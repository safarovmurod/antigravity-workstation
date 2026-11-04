'use strict';
const assert = require('node:assert/strict');
const { pageConnection } = require('./recording.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function inspectDetails(port, connect, expected) {
  const root = await pageConnection(port, connect);
  const observations = [];
  const expression = `Array.from(document.images).filter(image=>image.src===${JSON.stringify(expected.gif)}).map(image=>({src:image.src,complete:image.complete,width:image.naturalWidth,height:image.naturalHeight,link:image.closest('a')?.href}))`;
  async function frames(sessionId, tree) {
    for (const node of [tree, ...(tree.childFrames || [])]) {
      if (node !== tree) { const nested = await frames(sessionId, node); if (nested) return nested; continue; }
      try {
        const world = await root.call('Page.createIsolatedWorld', { frameId: node.frame.id, worldName: 'workstation-details-readonly' }, sessionId);
        const result = await root.call('Runtime.evaluate', { expression, contextId: world.executionContextId, returnByValue: true }, sessionId);
        const images = result.result?.value;
        if (Array.isArray(images) && images.length) {
          observations.push(...images);
          const loaded = images.find(image => image.complete && image.width > 0 && image.height > 0 && image.link === expected.mp4);
          if (loaded) return loaded;
        }
      } catch (error) { observations.push({ error: error.message }); }
    }
  }
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const targets = await root.call('Target.getTargets');
      for (const target of targets.targetInfos.filter(target => target.type === 'iframe')) {
        let session;
        try {
          session = (await root.call('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
          const tree = await root.call('Page.getFrameTree', {}, session);
          const loaded = await frames(session, tree.frameTree);
          if (loaded) return { installedDetailsPreview: 'PASS', expected, image: loaded,
            mp4Target: 'Actual installed Details anchor verified; playback is NOT TESTED by this preview test' };
        } catch (error) { observations.push({ target: target.url, error: error.message }); }
        finally { if (session) await root.call('Target.detachFromTarget', { sessionId: session }).catch(error => observations.push({ detach: error.message })); }
      }
      await pause(500);
    }
    assert.fail('Actual installed Details GIF/MP4 anchor not loaded: ' + JSON.stringify({ expected, observations: observations.slice(-8) }));
  } finally { root.close(); }
}
module.exports = { inspectDetails };
