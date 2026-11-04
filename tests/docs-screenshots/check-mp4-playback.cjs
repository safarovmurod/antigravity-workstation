'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { cdp } = require('./controller.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(browser, url, directory, name) {
  const profile = path.join(directory, name + '-profile'); fs.mkdirSync(profile);
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9349', '--user-data-dir=' + profile, url], { stdio: 'ignore', windowsHide: true });
  let launchError; child.on('error', error => { launchError = error; });
  let connection, last;
  try {
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error('Owned browser exited: ' + child.exitCode);
      try {
        const pages = await (await fetch('http://127.0.0.1:9349/json/list')).json();
        const page = pages.find(item => item.type === 'page' && item.url.startsWith('https://github.com/safarovmurod/antigravity-workstation/'));
        if (page) { connection = await cdp(page.webSocketDebuggerUrl); break; }
      } catch (error) { last = error.message; }
      await pause(500);
    }
    if (!connection) throw new Error('Actual public GitHub media page unavailable: ' + last);
    let evidence;
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await connection.call('Runtime.evaluate', { expression: `(async()=>{const video=document.querySelector('video');if(!video)return {url:location.href,title:document.title,videoFound:false,text:document.body.innerText.slice(-3000)};video.muted=true;let playError;try{await video.play()}catch(error){playError=error.message}return {url:location.href,videoFound:true,currentSrc:video.currentSrc,currentTime:video.currentTime,duration:video.duration,readyState:video.readyState,paused:video.paused,decodedFrames:video.getVideoPlaybackQuality?.().totalVideoFrames??null,mediaError:video.error?{code:video.error.code,message:video.error.message}:null,playError};})()`, awaitPromise: true, returnByValue: true });
      evidence = result.result?.value;
      if (evidence?.videoFound && evidence.currentTime > 0 && evidence.decodedFrames > 0 && !evidence.paused && !evidence.mediaError) {
        return { status: 'PASS', browser, url, evidence, proof: 'Existing actual GitHub page video played and decoded frames; no video/DOM result was fabricated' };
      }
      if (evidence?.mediaError) break;
      await pause(1000);
    }
    const screenshot = await connection.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(directory, name + '-actual-page.png'), Buffer.from(screenshot.data, 'base64'));
    return { status: 'FAIL', browser, url, evidence, proof: 'Real page inspected; no injected player or invented playback result' };
  } finally {
    if (connection) connection.close();
    if (child.pid && child.exitCode === null) {
      try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    }
  }
}
async function main() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('Only disposable GitHub-hosted Windows may run this browser probe');
  const directory = path.join(process.env.RUNNER_TEMP, 'workstation-public-mp4-' + require('node:crypto').randomUUID()); fs.mkdirSync(directory);
  const browsers = [path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')].filter(file => fs.existsSync(file));
  if (!browsers.length) throw new Error('Neither actual Edge nor Chrome is available');
  const results = [];
  const publicMedia = [];
  const recordings = require('../../docs/feature-guides/real-recordings.json').recordings;
  for (const name of ['calm-typescript', 'stability']) {
    const recording = recordings.find(item => item.name === name);
    for (const media of recording.media) {
      const url = 'https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/71573e0a98e1efcb9e48ac0137c6b12d6c9a9dab/docs/feature-guides/' + media.name;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
        const signature = media.name.endsWith('.gif') ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) : bytes.subarray(4, 8).toString() === 'ftyp';
        publicMedia.push({ url, finalUrl: response.url, redirected: response.redirected, httpStatus: response.status, mime: response.headers.get('content-type'), disposition: response.headers.get('content-disposition'), bytes: bytes.length, sha256,
          status: response.ok && bytes.length === media.bytes && sha256 === media.sha256 && signature ? 'PASS' : 'FAIL' });
      } catch (error) { publicMedia.push({ url, status: 'FAIL', error: error.message }); }
    }
    const url = 'https://github.com/safarovmurod/antigravity-workstation/blob/71573e0a98e1efcb9e48ac0137c6b12d6c9a9dab/docs/feature-guides/' + name + '.mp4';
    for (const [index, browser] of browsers.entries()) {
      let result;
      try { result = await check(browser, url, directory, name + '-' + index); }
      catch (error) { result = { status: 'FAIL', browser, url, error: error.message }; }
      results.push({ name, ...result });
      if (result.status === 'PASS') break;
    }
  }
  for (const guide of require('../../extensions/workstation-stability/instructional-guides.json')) {
    const source = guide.id === 'stability-instructional' ? require('../../docs/feature-guides/stability-instructional.json') : require('../../docs/feature-guides/instructional-animations.json').guides.find(item => item.id === guide.id);
    for (const asset of source.media) {
      const url = asset.path.endsWith('.gif') ? guide.gifUrl : guide.mp4Url;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
        const signature = asset.path.endsWith('.gif') ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) : bytes.subarray(4, 8).toString() === 'ftyp';
        publicMedia.push({ url, httpStatus: response.status, mime: response.headers.get('content-type'), bytes: bytes.length, sha256,
          status: response.ok && bytes.length === asset.bytes && sha256 === asset.sha256 && signature ? 'PASS' : 'FAIL' });
      } catch (error) { publicMedia.push({ url, status: 'FAIL', error: error.message }); }
    }
  }
  const installed = [];
  for (const phase of ['fresh', 'restart']) {
    try { installed.push(JSON.parse(fs.readFileSync(path.join(process.env.WORKSTATION_GUIDE_ARTIFACTS || '', phase + '.json'), 'utf8'))); }
    catch (error) { installed.push({ passed: false, phase, error: error.message }); }
  }
  const report = { sourceCommit: process.env.GITHUB_SHA,
    scope: 'Promised behavior is raw GIF preview/download plus a separately installed IDE Webview player. GitHub blob page inspection is diagnostic only; no inline Details playback is claimed.',
    passed: publicMedia.length === 20 && publicMedia.every(item => item.status === 'PASS') && installed.length === 2 && installed.every(item => item.passed === true && item.results?.length === 10 && new Set(item.results.map(clip => clip.id)).size === 10 && item.results.every(clip => clip.actual?.frames > 0 && clip.actual?.time > 0 && clip.pauseSeekResume === true)),
    publicMedia, installed, githubBlobDiagnostics: results };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2));
  console.log('WORKSTATION_MP4_PLAYBACK=' + JSON.stringify(report));
  console.log('WORKSTATION_MP4_ARTIFACT=' + directory);
  if (!report.passed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { check };
