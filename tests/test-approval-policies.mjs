import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const approvals = require('../lib/approval-policies');
const { fields, stringField } = require('../lib/mcp-permissions');
const entry = (key, bytes) => stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, bytes.toString('base64')))]));

test('Always approval rows preserve unrelated browser paths, account/enterprise data and future row metadata', () => {
  for (const [key, policy] of Object.entries(approvals.definitions)) {
    const foreign = entry('foreign', Buffer.from('PRIVATE-KEEP'));
    const source = foreign.toString('base64');
    const next = approvals.merge(source, key);
    assert.deepEqual(approvals.read(next, key), policy);
    assert.deepEqual(fields(Buffer.from(next, 'base64'))[0].raw, foreign);
    assert.equal(approvals.merge(next, key), next);
    assert.equal(approvals.restore(next, source, key), source);
  }
});
test('Approval mode errors reject malformed types, duplicate keys and truncated protobuf before changes', () => {
  for (const [topic, policy] of Object.entries(approvals.definitions)) {
    const key = Object.keys(policy)[0];
    const row = entry(key, Buffer.from([8, policy[key]]));
    for (const value of ['INVALID!', Buffer.from([10, 90]).toString('base64'),
      Buffer.concat([row, row]).toString('base64'), entry(key, Buffer.from([16, 1])).toString('base64')]) {
      assert.throws(() => approvals.merge(value, topic));
    }
  }
});
test('Restoring approval settings keeps later unrelated edits and removes only newly managed rows', () => {
  for (const [topic, policy] of Object.entries(approvals.definitions)) {
    const key = Object.keys(policy)[0], oldValue = topic === approvals.BROWSER_TOPIC_KEY ? 2 : 1 - policy[key];
    const old = entry(key, Buffer.from([8, oldValue])).toString('base64');
    const foreign = entry('later-foreign', Buffer.from('NEW'));
    const current = Buffer.concat([foreign, Buffer.from(approvals.merge(old, topic), 'base64')]).toString('base64');
    assert.equal(approvals.restore(current, old, topic), Buffer.concat([foreign, Buffer.from(old, 'base64')]).toString('base64'));
  }
});
