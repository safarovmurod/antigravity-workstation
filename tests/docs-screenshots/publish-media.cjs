'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repository = path.resolve(__dirname, '../..');
const directory = process.env.WORKSTATION_MEDIA_ARTIFACT;
assert.ok(directory && path.isAbsolute(directory));
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REPOSITORY, 'safarovmurod/antigravity-workstation');
assert.equal(process.env.GITHUB_REF_NAME, 'codex/corrective-audit-20261025');
const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
assert.equal(result.passed, true); assert.equal(result.commit, process.env.GITHUB_SHA);
const scope = process.env.WORKSTATION_DOCS_SCOPE || 'all-eight';
assert.ok(['all-eight', 'calm-stability'].includes(scope));
assert.equal(result.recordingScope, scope);
assert.equal(result.allEightRecorded, scope === 'all-eight');
const expectedNames = scope === 'calm-stability' ? ['calm-typescript', 'stability']
  : ['calm-typescript', 'current-branch', 'delete-branch', 'get-changes', 'new-branch', 'pull-request', 'stability', 'switch-branch'];
assert.deepEqual(result.recordings.map(item => item.name).sort(), expectedNames);
const verified = [];
for (const recording of result.recordings) {
  assert.equal(recording.codeCommit, process.env.GITHUB_SHA);
  assert.ok(recording.frames >= 10);
  assert.deepEqual(recording.media.map(item => item.name).sort(), [recording.name + '.gif', recording.name + '.mp4']);
  for (const media of recording.media) {
    assert.ok([recording.name + '.mp4', recording.name + '.gif'].includes(media.name));
    const source = path.join(directory, media.name);
    assert.equal(fs.lstatSync(source).isSymbolicLink(), false);
    const bytes = fs.readFileSync(source);
    assert.equal(bytes.length, media.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), media.sha256);
    if (media.name.endsWith('.gif')) assert.match(bytes.subarray(0, 6).toString('ascii'), /^GIF8[79]a$/);
    else assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp');
    verified.push({ name: media.name, bytes });
  }
}
assert.equal(verified.length, expectedNames.length * 2);
const destination = path.join(repository, 'docs/feature-guides');
for (const item of verified) fs.writeFileSync(path.join(destination, item.name), item.bytes);
fs.writeFileSync(path.join(destination, 'real-recordings.json'), JSON.stringify({
  sourceCommit: result.commit, runId: process.env.GITHUB_RUN_ID,
  recordingScope: scope, allEightRecorded: result.allEightRecorded, installedDetailsPlayback: 'NOT TESTED by capture publication',
  recordings: result.recordings, caveat: 'Actual disposable installed IDE UI, not a live Gemini session. First five Git operations use a real disposable local bare origin; PR destination uses public GitHub readonly compare. No GitHub PR was created or merged and no foreign branch was mutated.',
}, null, 2) + '\n');
console.log(JSON.stringify({ verified: verified.map(item => item.name), sourceCommit: result.commit }));
