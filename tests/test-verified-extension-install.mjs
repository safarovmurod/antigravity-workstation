import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { installVerifiedExtension } = require('../lib/verified-extension-install');

test('A local VSIX retries a vendor process crash and a source mismatch before accepting verified installation', () => {
  let installs = 0, verifications = 0;
  const waits = [], artifacts = [];
  const result = installVerifiedExtension('owned-editor', 'verified.vsix', () => ++verifications === 2, {
    log() {}, wait: ms => waits.push(ms),
    run(file, args, options) {
      assert.equal(file, 'owned-editor'); assert.equal(options.windowsHide, true);
      assert.equal(options.timeout, 180000); artifacts.push(args[1]);
      return { status: ++installs === 1 ? 3 : 0 };
    },
  });
  assert.deepEqual(result, { success: true, attempts: 3 });
  assert.equal(verifications, 2);
  assert.deepEqual(artifacts, ['verified.vsix', 'verified.vsix', 'verified.vsix']);
  assert.deepEqual(waits, [500, 1000]);
});

test('A local VSIX never accepts a failed process or unverified source and stops after three attempts', () => {
  for (const failure of ['crash', 'source']) {
    let installs = 0, verifications = 0;
    assert.throws(() => installVerifiedExtension('owned-editor', 'verified.vsix', () => { verifications++; return false; }, {
      log() {}, wait() {}, run() { installs++; return { status: failure === 'crash' ? 3 : 0 }; },
    }), /after 3 installation attempts/);
    assert.equal(installs, 3);
    assert.equal(verifications, failure === 'crash' ? 0 : 3);
  }
});

test('Windows local VSIX retries preserve quoted paths and reject shell-expanding path characters before execution', () => {
  const cli = 'C:\\Owned editor\\editor.cmd', vsix = 'D:\\Owned source\\extension.vsix';
  let calls = 0;
  assert.equal(installVerifiedExtension(cli, vsix, () => true, { platform: 'win32', log() {}, wait() {},
    exec(command, options) {
      calls++; assert.equal(command, `"${cli}" --install-extension "${vsix}" --force`);
      assert.equal(options.windowsHide, true);
      if (calls === 1) throw new Error('FATAL ERROR: Empty MaybeLocal');
    },
  }).attempts, 2);
  for (const invalid of ['C:\\Bad%EXPAND%\\editor.cmd', 'C:\\bad"path\\editor.cmd']) {
    assert.throws(() => installVerifiedExtension(invalid, vsix, () => true, { platform: 'win32', exec() { assert.fail('Invalid path executed'); } }), /Unsupported CLI/);
  }
});
