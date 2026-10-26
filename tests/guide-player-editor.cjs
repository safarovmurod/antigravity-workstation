'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { waitFor } = require('./calm-typescript-editor.cjs');

async function run() {
  const vscode = require('vscode');
  const extension = vscode.extensions.getExtension('workstation.stability-helper');
  assert.ok(extension, 'Actual installed helper registration');
  await extension.activate();
  const renderer = await require('./aster-renderer.cjs').connect();
  const results = [];
  try {
    for (const guide of require('../extensions/workstation-stability/guide-player.cjs').guides) {
      const id = guide.detailsExtension || (guide.id === 'stability' ? 'workstation.stability-helper' : 'workstation.calm-typescript');
      await vscode.commands.executeCommand('extension.open', id);
      const prefix = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/71573e0a98e1efcb9e48ac0137c6b12d6c9a9dab/docs/feature-guides/' + guide.id;
      const details = await require('./docs-screenshots/details.cjs').inspectDetails(Number(process.env.WORKSTATION_EDITOR_CDP_PORT), require('./docs-screenshots/controller.cjs').cdp,
        { gif: guide.gifUrl || prefix + '.gif', mp4: guide.mp4Url || prefix + '.mp4' });
      await renderer.screenshot(path.join(process.env.WORKSTATION_GUIDE_ARTIFACTS, guide.id + '-details-' + process.env.WORKSTATION_GUIDE_PHASE + '.png'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      assert.equal(await vscode.commands.executeCommand('workstationStability.openGuide', guide.id), guide.id);
      let target;
      await waitFor(async () => { target = await renderer.locate('!!document.querySelector("video source")'); return !!target; }, 'installed guide Webview');
      const evaluate = expression => renderer.evaluate(expression, target.sessionId, target.contextId);
      assert.match(await evaluate('document.body.innerText'), guide.kind === 'instructional' ? /not an IDE recording/ : /Actual IDE recording/);
      await evaluate('(async()=>{const v=document.querySelector("video");v.muted=true;await v.play();return true})()');
      let actual;
      await waitFor(async () => {
        actual = await evaluate('(()=>{const v=document.querySelector("video");return {src:v.currentSrc,time:v.currentTime,duration:v.duration,paused:v.paused,frames:v.getVideoPlaybackQuality().totalVideoFrames,error:v.error?{code:v.error.code,message:v.error.message}:null}})()');
        if (actual.error) throw new Error('Actual host codec/playback error: ' + JSON.stringify(actual));
        return actual.time > 0.2 && actual.frames > 0 && !actual.paused && actual.duration > 0;
      }, 'real guide decodes frames and advances time');
      await evaluate('document.querySelector("video").pause()');
      assert.equal(await evaluate('document.querySelector("video").paused'), true);
      await evaluate('(async()=>{const v=document.querySelector("video");v.currentTime=1;await v.play();return true})()');
      await waitFor(async () => await evaluate('document.querySelector("video").currentTime > 1.1'), 'seek and resume');
      await renderer.screenshot(path.join(process.env.WORKSTATION_GUIDE_ARTIFACTS, guide.id + '-' + process.env.WORKSTATION_GUIDE_PHASE + '.png'));
      results.push({ id: guide.id, label: guide.label, sha256: guide.sha256, details, actual, pauseSeekResume: true });
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    fs.writeFileSync(process.env.WORKSTATION_GUIDE_RESULT, JSON.stringify({ passed: true, host: vscode.env.appName, version: vscode.version, extension: extension.packageJSON.version, phase: process.env.WORKSTATION_GUIDE_PHASE, scope: 'Actual installed separate Webview playback, not inline Details or authenticated Gemini', results }, null, 2));
  } finally { renderer.close(); }
}

async function launch() {
  const directory = process.env.WORKSTATION_GUIDE_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-guide-artifacts-'));
  fs.mkdirSync(directory, { recursive: true });
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-guide-host-'));
  const user = path.join(base, 'user'), extensions = path.join(base, 'extensions'), driver = path.join(base, 'driver');
  for (const dir of [user, extensions, driver, path.join(user, 'User')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(user, 'User/settings.json'), JSON.stringify({ 'workbench.startupEditor': 'none', 'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off', 'security.workspace.trust.enabled': false }));
  fs.writeFileSync(path.join(driver, 'package.json'), JSON.stringify({ name: 'guide-test-driver', publisher: 'workstation', version: '1.0.0', engines: { vscode: '^1.107.0' } }));
  const executable = process.env.WORKSTATION_VSCODE_PATH;
  assert.ok(executable, 'An actual IDE executable is required');
  const env = { ...process.env, WORKSTATION_GUIDE_ARTIFACTS: directory };
  const { buildVsix, payload } = require('../scripts/package-stability.cjs');
  const pkg = buildVsix();
  assert.deepEqual(fs.readFileSync(pkg.file), pkg.bytes);
  const manifest = require('../extensions/workstation-stability/package.json');
  const files = Object.fromEntries([...payload()].map(([file, bytes]) => [file, require('node:crypto').createHash('sha256').update(bytes).digest('hex')]));
  const pin = { id: 'workstation.stability-helper', version: manifest.version, files, vsixSha256: require('node:crypto').createHash('sha256').update(pkg.bytes).digest('hex') };
  const cliArgs = [path.join(path.dirname(executable), 'resources/app/out/cli.js')];
  const install = require('./aster-cli-install.cjs').installFixture;
  assert.equal(typeof install, 'function');
  let display;
  try {
    install({ executable, cliArgs, userDataDir: user, extensionsDir: extensions, artifact: pkg.file, pin, expectedPackage: manifest, env, log: console.log });
    const calm = require('../scripts/package-calm-typescript.cjs').buildCalmTypeScript();
    assert.deepEqual(fs.readFileSync(calm.file), calm.bytes);
    const calmRoot = path.resolve(__dirname, '../extensions/calm-typescript');
    const calmFiles = { 'package.json': fs.readFileSync(path.join(calmRoot, 'package.json')), 'README.md': fs.readFileSync(path.join(calmRoot, 'README.md')), 'icon.png': fs.readFileSync(path.join(calmRoot, 'icon.png')), 'dist/extension.cjs': fs.readFileSync(path.join(calmRoot, 'extension.cjs')), 'LICENSE.txt': fs.readFileSync(path.resolve(__dirname, '../LICENSE')) };
    const calmManifest = require('../extensions/calm-typescript/package.json');
    const calmPin = { ...calm.pin, files: Object.fromEntries(Object.entries(calmFiles).map(([name, bytes]) => [name, require('node:crypto').createHash('sha256').update(bytes).digest('hex')])) };
    install({ executable, cliArgs, userDataDir: user, extensionsDir: extensions, artifact: calm.file, pin: calmPin, expectedPackage: calmManifest, env, log: console.log });
    for (const [builder, source] of [['../scripts/package-git-panel.cjs', '../extensions/git-branch-panel/package.json'], ['../scripts/package-aster.cjs', '../extensions/aster-appearance/package.json']]) {
      const packaged = require(builder).build();
      assert.deepEqual(fs.readFileSync(packaged.file), packaged.bytes, 'Source-identical instructional package');
      install({ executable, cliArgs, userDataDir: user, extensionsDir: extensions, artifact: packaged.file, pin: packaged.pin, expectedPackage: require(source), env, log: console.log });
    }
    if (process.platform === 'linux' && !env.DISPLAY) {
      const number = 400 + process.pid % 10000; env.DISPLAY = ':' + number;
      display = spawn(process.env.WORKSTATION_XVFB_PATH || 'Xvfb', [env.DISPLAY, '-screen', '0', '1440x1000x24', '-nolisten', 'tcp', '-ac'], { stdio: 'ignore' });
      await waitFor(() => fs.existsSync('/tmp/.X11-unix/X' + number), 'owned Xvfb', 5000);
    }
    for (const phase of ['fresh', 'restart']) {
      const listener = require('node:net').createServer();
      await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
      env.WORKSTATION_EDITOR_CDP_PORT = String(listener.address().port);
      await new Promise(resolve => listener.close(resolve));
      env.WORKSTATION_GUIDE_PHASE = phase; env.WORKSTATION_GUIDE_RESULT = path.join(directory, phase + '.json');
      const args = ['--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--user-data-dir=' + user, '--extensions-dir=' + extensions, '--extensionDevelopmentPath=' + driver, '--extensionTestsPath=' + __filename, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + env.WORKSTATION_EDITOR_CDP_PORT];
      const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let log = ''; child.stdout.on('data', bytes => { log += bytes; }); child.stderr.on('data', bytes => { log += bytes; });
      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('Guide host exceeded 120 seconds')); }, 120000);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('exit', code => { clearTimeout(timer); resolve(code); });
      });
      fs.writeFileSync(path.join(directory, phase + '-ide.log'), log);
      assert.equal(code, 0, log.slice(-6000));
      assert.equal(JSON.parse(fs.readFileSync(env.WORKSTATION_GUIDE_RESULT)).passed, true);
    }
    console.log('GUIDE_PLAYER_ARTIFACTS=' + directory);
  } finally { display?.kill(); fs.rmSync(base, { recursive: true, force: true }); }
}
module.exports = { run, launch };
if (require.main === module) launch().catch(error => { console.error(error); process.exitCode = 1; });
