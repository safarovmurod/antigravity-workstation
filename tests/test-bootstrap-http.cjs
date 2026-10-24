'use strict';
// Real loopback HTTP tests for WinPS 5.1/7 on Windows and portable PowerShell 7.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
async function main() {
  const payload = Buffer.from(Array.from({ length: 128 * 1024 }, (_, i) => i % 251));
  const hash = createHash('sha256').update(payload).digest('hex');
  const counts = new Map();
  let toolDirectory;
  const childEnv = { ...process.env };
  if (process.platform !== 'win32') {
    const curl = (process.env.PATH || '').split(path.delimiter).map(directory => path.join(directory, 'curl')).find(file => {
      try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
    });
    if (!curl) throw new Error('Portable HTTP coverage requires an actual curl executable');
    toolDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-http-tools-'));
    // The production Windows helper discovers curl.exe. Expose the real Unix
    // curl under that name to exercise both actual transports without mocks.
    fs.symlinkSync(curl, path.join(toolDirectory, 'curl.exe'));
    childEnv.PATH = toolDirectory + path.delimiter + childEnv.PATH;
  }
  const server = http.createServer((req, res) => {
    const key = req.url;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (key.startsWith('/retry') && counts.get(key) === 1) { res.writeHead(503); res.end('Temporary outage'); return; }
    if (key.startsWith('/empty')) { res.writeHead(200, { 'Content-Length': 0 }); res.end(); return; }
    if (key.startsWith('/truncated')) {
      res.writeHead(200, { 'Content-Length': payload.length });
      res.write(payload.subarray(0, 128)); setTimeout(() => res.destroy(), 20); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length }); res.end(payload);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const shells = process.platform === 'win32' ? ['powershell.exe', 'pwsh'] : [process.env.WORKSTATION_PWSH || 'pwsh'];
  try {
    let serial = 0;
    for (const shell of shells) for (const withoutCurl of [false, true]) for (const scenario of ['ordinary', 'retry', 'empty', 'truncated']) {
      const route = '/' + scenario + '-' + (++serial);
      const child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-bootstrap-http.ps1'),
        '-Uri', 'http://127.0.0.1:' + server.address().port + route, '-ExpectedSha256', hash,
        ...(withoutCurl ? ['-WithoutCurl'] : []), ...(['empty', 'truncated'].includes(scenario) ? ['-ExpectFailure'] : [])],
      { windowsHide: true, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      const status = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('HTTP regression test timed out: ' + output)); }, 60000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); resolve(code); });
      });
      if (status !== 0) throw new Error(shell + ' HTTP regression failed: ' + output);
      if (scenario === 'retry' && counts.get(route) !== 4) throw new Error('The retry route did not perform one recovery plus three verified downloads');
      if (['empty', 'truncated'].includes(scenario) && counts.get(route) !== 6) throw new Error('Every invalid download must fail after two requests in three destinations');
      console.log(output.trim());
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (toolDirectory) fs.rmSync(toolDirectory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
