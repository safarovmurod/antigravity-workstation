'use strict';
// A real loopback HTTP response exercises the actual WinPS IWR/curl implementations.
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
async function main() {
  if (process.platform !== 'win32') throw new Error('Run this regression test on Windows with PowerShell 5.1 and 7');
  const payload = Buffer.from(Array.from({ length: 128 * 1024 }, (_, i) => i % 251));
  const hash = createHash('sha256').update(payload).digest('hex');
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length }); res.end(payload); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const shell of ['powershell.exe', 'pwsh']) for (const withoutCurl of [false, true]) {
      const child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-bootstrap-http.ps1'),
        '-Uri', 'http://127.0.0.1:' + server.address().port + '/fixture', '-ExpectedSha256', hash, ...(withoutCurl ? ['-WithoutCurl'] : [])],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      const status = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('HTTP regression test timed out: ' + output)); }, 60000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); resolve(code); });
      });
      if (status !== 0) throw new Error(shell + ' HTTP regression failed: ' + output);
      console.log(output.trim());
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
