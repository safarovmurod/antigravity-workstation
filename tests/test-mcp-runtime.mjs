import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const runtime = path.join(root, 'resources/mcp-runtime');
const requireRuntime = createRequire(path.join(runtime, 'package.json'));
const { Client } = await import(pathToFileURL(requireRuntime.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StdioClientTransport } = await import(pathToFileURL(requireRuntime.resolve('@modelcontextprotocol/sdk/client/stdio.js')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/mcp/active.template.json'), 'utf8')).mcpServers;

for (const [name, config] of Object.entries(catalog)) {
  test(`${name}: real stdio initialize and tool discovery`, { timeout: 60000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-mcp-'));
    const entry = config.args[0].replace('${USER_HOME}/.gemini/config/mcp-runtime', runtime);
    const args = [entry];
    const chrome = name === 'chrome-devtools-mcp' && process.env.WORKSTATION_TEST_CHROME;
    if (chrome) {
      args.push('--headless', '--isolated', '--executablePath=' + chrome, '--no-usage-statistics', '--no-page-id-routing');
      if (process.env.WORKSTATION_TEST_NO_SANDBOX === '1') args.push('--chromeArg=--no-sandbox');
    }
    const transport = new StdioClientTransport({ command: process.execPath, args, cwd: directory,
      stderr: 'pipe', env: { ...process.env, DISABLE_THOUGHT_LOGGING: 'true', CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' } });
    let errors = '';
    transport.stderr?.on('data', data => { errors += data; });
    const client = new Client({ name: 'workstation-setup-integration', version: '1.0.0' });
    t.after(async () => { await client.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.length > 0, errors);
    assert.ok(tools.every(tool => typeof tool.name === 'string' && tool.inputSchema?.type === 'object'));
    t.diagnostic(`${tools.length} tools: ${tools.map(tool => tool.name).join(', ')}`);
    if (chrome) {
      const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<h1>Workstation MCP audit</h1>');
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      t.after(() => { server.closeAllConnections(); server.close(); });
      const page = await client.callTool({ name: 'new_page', arguments: { url: `http://127.0.0.1:${server.address().port}` } });
      assert.notEqual(page.isError, true, JSON.stringify(page));
      const result = await client.callTool({ name: 'evaluate_script', arguments: { function: '() => document.querySelector("h1").textContent' } });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.match(JSON.stringify(result.content), /Workstation MCP audit/);
      t.diagnostic('Actual isolated Chromium page opened and its DOM read through MCP');
    }
    if (name === 'gsd') {
      const state = path.join(directory, '.planning/STATE.md');
      fs.mkdirSync(path.dirname(state)); fs.writeFileSync(state, '# Isolated state\n');
      const result = await client.callTool({ name: 'gsd_read_state', arguments: { path: state } });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.equal(result.content[0].text, '# Isolated state\n');
    }
    if (name === 'sequential-thinking') {
      const result = await client.callTool({ name: 'sequentialthinking', arguments: {
        thought: 'Validate the isolated MCP integration fixture.', thoughtNumber: 1, totalThoughts: 1, nextThoughtNeeded: false,
      } });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.equal(JSON.parse(result.content[0].text).thoughtNumber, 1);
    }
  });
}
