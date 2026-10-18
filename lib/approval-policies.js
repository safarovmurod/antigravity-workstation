'use strict';
const { fields, stringField, TOPIC_KEY } = require('./mcp-permissions');

// Values and field numbers come from the audited IDE's own protobuf schemas,
// getters and setters. BrowserJsExecutionPolicy.TURBO is 4, not the UI enum 2.
const BROWSER_TOPIC_KEY = 'antigravityUnifiedStateSync.browserPreferences';
const OVERRIDE_TOPIC_KEY = 'antigravityUnifiedStateSync.overrideStore';
const definitions = Object.freeze({
  [TOPIC_KEY]: Object.freeze({
    allowAgentAccessNonWorkspaceFilesSentinelKey: 1,
    allowCascadeAccessGitignoreFilesSentinelKey: 1,
    enableTerminalSandboxSentinelKey: 0,
    secureModeSentinelKey: 0, // legacy migration source
  }),
  [BROWSER_TOPIC_KEY]: Object.freeze({ browser_js_execution_config_sentinel_key: 4 }),
  [OVERRIDE_TOPIC_KEY]: Object.freeze({ secureModeEnabledSentinelKey: 0 }),
});
const EXTRA_TOPIC_KEYS = Object.freeze([BROWSER_TOPIC_KEY, OVERRIDE_TOPIC_KEY]);
const SNAPSHOT_FILES = Object.freeze({
  [BROWSER_TOPIC_KEY]: 'browser-preferences.base64',
  [OVERRIDE_TOPIC_KEY]: 'override-preferences.base64',
});
function decode(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid approval preferences');
  return Buffer.from(value, 'base64');
}
function rows(value, topicKey) {
  const policy = definitions[topicKey];
  if (!policy) throw new Error('Unknown approval topic');
  const seen = new Set();
  return fields(decode(value)).map(entry => {
    if (entry.id !== 1 || entry.wire !== 2) return { raw: entry.raw };
    const pair = fields(entry.value), keys = pair.filter(f => f.id === 1 && f.wire === 2);
    if (keys.length !== 1) throw new Error('Invalid approval map key');
    const key = keys[0].value.toString('utf8');
    if (!Object.hasOwn(policy, key)) return { raw: entry.raw };
    if (seen.has(key)) throw new Error('Duplicate approval preference');
    seen.add(key);
    const rowFields = pair.filter(f => f.id === 2 && f.wire === 2);
    if (rowFields.length !== 1) throw new Error('Invalid approval row');
    const row = fields(rowFields[0].value), values = row.filter(f => f.id === 1 && f.wire === 2);
    if (values.length !== 1) throw new Error('Invalid approval value');
    const primitive = fields(decode(values[0].value.toString('utf8')));
    const owned = primitive.filter(f => f.id === 1);
    if (owned.length !== 1 || owned[0].wire !== 0 || primitive.some(f => f.id >= 2 && f.id <= 5)
      || (topicKey !== BROWSER_TOPIC_KEY && ![0, 1].includes(owned[0].value))) throw new Error('Unexpected approval preference type');
    return { raw: entry.raw, key, pair, row, rowField: rowFields[0], valueField: values[0], primitive, value: owned[0].value };
  });
}
function read(value, topicKey) {
  return Object.fromEntries(rows(value, topicKey).filter(row => row.key).map(row => [row.key, row.value]));
}
function merge(value, topicKey) {
  const policy = definitions[topicKey], seen = new Set();
  const result = rows(value, topicKey).map(data => {
    if (!data.key) return data.raw;
    seen.add(data.key);
    const primitive = Buffer.concat(data.primitive.map(f => f.id === 1 ? Buffer.from([8, policy[data.key]]) : f.raw)).toString('base64');
    const row = Buffer.concat(data.row.map(f => f === data.valueField ? stringField(1, primitive) : f.raw));
    return stringField(1, Buffer.concat(data.pair.map(f => f === data.rowField ? stringField(2, row) : f.raw)));
  });
  for (const [key, mode] of Object.entries(policy)) if (!seen.has(key)) {
    result.push(stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, Buffer.from([8, mode]).toString('base64')))])));
  }
  return Buffer.concat(result).toString('base64');
}
function restore(current, saved, topicKey) {
  const originals = new Map(rows(saved, topicKey).filter(row => row.key).map(row => [row.key, row.raw]));
  const result = rows(current, topicKey).flatMap(row => {
    if (!row.key) return [row.raw];
    const original = originals.get(row.key); originals.delete(row.key);
    return original ? [original] : [];
  });
  return Buffer.concat([...result, ...originals.values()]).toString('base64');
}
module.exports = { definitions, BROWSER_TOPIC_KEY, OVERRIDE_TOPIC_KEY, EXTRA_TOPIC_KEYS, SNAPSHOT_FILES, read, merge, restore };
