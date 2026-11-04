'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function pageConnection(port, connect) {
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = pages.find(item => item.type === 'page' && /\/workbench\.html(?:[?#]|$)/i.test(item.url))
    || pages.find(item => item.type === 'page' && /Workstation documentation/i.test(item.title))
    || pages.find(item => item.type === 'page' && item.url.startsWith('https://github.com/'));
  assert.ok(page?.webSocketDebuggerUrl, 'Actual installed IDE renderer is available for recording');
  return connect(page.webSocketDebuggerUrl);
}
async function caption(connection, text, point) {
  await connection.call('Runtime.evaluate', { expression: `(() => {
    let caption = document.getElementById('workstation-recording-caption');
    if (!caption) { caption = document.createElement('div'); caption.id = 'workstation-recording-caption';
      caption.style.cssText = 'position:fixed;left:24px;bottom:35px;max-width:1300px;background:#101722ed;color:white;padding:12px 18px;font:20px Segoe UI,sans-serif;z-index:2147483647;pointer-events:none;border-radius:8px';
      document.body.append(caption); }
    caption.textContent = ${JSON.stringify(text)};
    let pointer = document.getElementById('workstation-recording-click');
    if (!pointer) { pointer = document.createElement('div'); pointer.id = 'workstation-recording-click';
      pointer.style.cssText = 'position:fixed;width:22px;height:22px;border:3px solid #ffca56;border-radius:50%;z-index:2147483647;pointer-events:none'; document.body.append(pointer); }
    const point = ${JSON.stringify(point || null)};
    pointer.style.display = point ? 'block' : 'none';
    if (point) { pointer.style.left = (point.x - 11) + 'px'; pointer.style.top = (point.y - 11) + 'px'; }
  })()` });
}
async function startRecording(port, connect, output, name, text) {
  let connection = await pageConnection(port, connect);
  await connection.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await connection.call('Page.bringToFront');
  await caption(connection, text);
  const directory = path.join(output, name + '-frames'); fs.mkdirSync(directory);
  const frames = [], started = Date.now(), segments = [{ frame: 0, kind: 'Actual installed IDE', port }];
  let active = true, paused = false, capturing = false, failure;
  const loop = (async () => {
    while (active) {
      if (paused) { await pause(20); continue; }
      const tick = Date.now();
      try {
        capturing = true;
        const frame = await connection.call('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: false, fromSurface: true });
        const file = String(frames.length).padStart(5, '0') + '.jpg';
        fs.writeFileSync(path.join(directory, file), Buffer.from(frame.data, 'base64'));
        frames.push({ file, elapsedMs: Date.now() - started });
        if (frames.length >= 900) throw new Error('Recording exceeds the bounded three-minute frame budget');
      } catch (error) { failure = error; active = false; }
      finally { capturing = false; }
      await pause(Math.max(0, 200 - (Date.now() - tick)));
    }
  })();
  return {
    async caption(text, point) { await caption(connection, text, point); },
    async switchTo(nextPort, text) {
      paused = true;
      const deadline = Date.now() + 15000;
      while (capturing && Date.now() < deadline) await pause(20);
      assert.equal(capturing, false);
      const next = await pageConnection(nextPort, connect);
      await next.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await next.call('Page.bringToFront'); await caption(next, text);
      const previous = connection; connection = next; previous.close();
      segments.push({ frame: frames.length, kind: 'Actual public GitHub compare destination in a fresh unauthenticated browser', port: nextPort });
      paused = false;
    },
    async stop() {
      active = false; await loop;
      try {
        if (failure) throw failure;
        assert.ok(frames.length >= 10, 'A real guide must contain multiple captured UI frames');
        const binary = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
        const input = path.join(directory, '%05d.jpg'), mp4 = path.join(output, name + '.mp4'), gif = path.join(output, name + '.gif');
        execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '5', '-i', input,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-crf', '23', mp4], { windowsHide: true, timeout: 120000 });
        execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4,
          '-filter_complex', 'fps=5,scale=1080:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse', '-loop', '0', gif], { windowsHide: true, timeout: 120000 });
        const result = { name, codeCommit: process.env.GITHUB_SHA, viewport: { width: 1440, height: 1000 },
          frames: frames.length, realElapsedMs: frames.at(-1).elapsedMs + 200, encodedDurationSeconds: frames.length / 5,
          method: 'Actual installed official Antigravity renderer captured throughout the real UI interaction. Only caption and click-ring overlays were added; no result screen was manufactured.',
          sourceSegments: segments,
          media: [mp4, gif].map(file => ({ name: path.basename(file), bytes: fs.statSync(file).size,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })), timestamps: frames };
        fs.writeFileSync(path.join(output, name + '-recording.json'), JSON.stringify(result, null, 2));
        return result;
      } finally { connection.close(); }
    },
  };
}
async function clickSetting(port, connect, key, expected) {
  const connection = await pageConnection(port, connect);
  const expression = `(() => {
    const key = ${JSON.stringify(key)};
    const row = Array.from(document.querySelectorAll('[data-key], .setting-item')).find(element =>
      element.getAttribute('data-key') === key || element.getAttribute('data-setting-id') === key);
    const control = row?.querySelector('[role="checkbox"],input[type="checkbox"]');
    if (!control) return { missing: true, visibleText: document.body.innerText.slice(-8000) };
    const rect = control.getBoundingClientRect();
    return { checked: control.getAttribute('aria-checked') ?? String(control.checked), x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
  })()`;
  try {
    let before;
    for (let attempt = 0; attempt < 40; attempt++) {
      before = (await connection.call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
      if (before?.width > 0 && before?.height > 0) break;
      await pause(250);
    }
    assert.equal(before?.checked, String(!expected), 'The actual visible checkbox must start in the opposite state: ' + JSON.stringify(before));
    await caption(connection, 'Settings → Calm TypeScript → Quiet Mode. Нажимаем настоящую галочку.', before);
    for (const type of ['mousePressed', 'mouseReleased']) await connection.call('Input.dispatchMouseEvent', {
      type, x: before.x, y: before.y, button: 'left', clickCount: 1,
    });
    let after;
    for (let attempt = 0; attempt < 40; attempt++) {
      after = (await connection.call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
      if (after?.checked === String(expected)) break;
      await pause(100);
    }
    assert.equal(after?.checked, String(expected), 'The real UI checkbox changed');
    await pause(1800);
    return { key, before, after };
  } finally { connection.close(); }
}
async function enter(port, connect) {
  const connection = await pageConnection(port, connect);
  try {
    for (const type of ['keyDown', 'keyUp']) await connection.call('Input.dispatchKeyEvent', {
      type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
  } finally { connection.close(); }
}
module.exports = { startRecording, clickSetting, enter, pageConnection, caption };
