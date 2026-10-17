import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(exec);
test('Browser renders matching pages and detects a changed background', { timeout: 120000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-browser-'));
  const session = `mansur-test-${Date.now()}`;
  const server = http.createServer((request, response) => {
    const background = request.url === '/modified' ? '#dc2626' : '#0f172a';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><style>body{margin:0;background:${background};color:#ffffff;font-family:sans-serif}h1{font-size:32px}</style></head><body><h1>Mansur browser test</h1><button onclick="this.textContent='1'">0</button></body></html>`);
  });
  async function browser(command) {
    // Await the child so this process can still answer the HTTP requests.
    const result = await run(`agent-browser --session ${session} --json ${command}`, { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024,
      env: { ...process.env, AGENT_BROWSER_SOCKET_DIR: directory } });
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true, result.stdout);
    return output.data;
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const baseline = path.join(directory, 'baseline.png');
  let testFailed = false;
  try {
    await browser(`open ${url}/baseline`);
    await browser('set viewport 800 600');
    await browser(`screenshot "${baseline}"`);
    const image = fs.readFileSync(baseline);
    assert.equal(image.readUInt32BE(16), 800);
    assert.equal(image.readUInt32BE(20), 600);
    await browser(`open ${url}/actual`);
    const same = await browser(`diff screenshot --baseline "${baseline}" --output "${path.join(directory, 'same.png')}"`);
    assert.equal(same.mismatchPercentage, 0, JSON.stringify(same));
    await browser(`open ${url}/modified`);
    const different = await browser(`diff screenshot --baseline "${baseline}" --output "${path.join(directory, 'different.png')}"`);
    assert.ok(different.mismatchPercentage > 50, JSON.stringify(different));
    await browser('snapshot -i');
    await browser('click "button"');
    const text = await browser('get text "button"');
    assert.equal(text.text, '1');
  } catch (error) {
    testFailed = true;
    throw error;
  } finally {
    try { await browser('close'); } catch (error) {
      if (!testFailed) throw error;
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});
