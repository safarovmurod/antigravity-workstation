import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'extensions/jelly-cursor');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('Jelly Cursor is the upstream MIT code with only the engine lowered to Antigravity 1.107', () => {
  const upstream = readJson(path.join(source, 'upstream.json'));
  const manifest = readJson(path.join(source, 'package.json'));
  assert.equal(upstream.license, 'MIT');
  assert.match(fs.readFileSync(path.join(source, 'LICENSE.txt'), 'utf8'), /^MIT License/);
  assert.equal(manifest.engines.vscode, '^1.107.0');
  const restored = { ...manifest, engines: { ...manifest.engines, vscode: upstream.upstreamEngine } };
  assert.equal(restored.engines.vscode, '^1.120.0');
  for (const [file, digest] of Object.entries(upstream.upstreamFiles)) {
    if (file !== 'package.json') assert.equal(sha256(fs.readFileSync(path.join(source, file))), digest, file + ' is byte-identical to upstream');
  }
  const ide = readJson(path.join(root, 'config/extensions.json')).find(item => item.id === 'iranon.jelly-cursor');
  assert.deepEqual([ide.source, ide.version, ide.optional], ['local-vsix', manifest.version, undefined]);
});

test('Every Jelly Cursor source file is tracked by git, not hidden by an ignore rule', () => {
  const tracked = execFileSync('git', ['ls-files', 'extensions/jelly-cursor'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/);
  for (const file of Object.keys(readJson(path.join(source, 'upstream.json')).upstreamFiles)) assert.ok(tracked.includes('extensions/jelly-cursor/' + file), file);
});

test('The Jelly Cursor VSIX is reproducible and matches its SHA-256 pin', () => {
  const { buildJellyCursor } = require('../scripts/package-jelly-cursor.cjs');
  const built = buildJellyCursor(root), pin = readJson(path.join(source, 'manifest.json'));
  assert.deepEqual(fs.readFileSync(built.file), built.bytes);
  assert.deepEqual(built.pin, pin);
  const entries = new Map();
  for (let offset = 0; built.bytes.readUInt32LE(offset) === 0x04034b50;) {
    const size = built.bytes.readUInt32LE(offset + 18), nameSize = built.bytes.readUInt16LE(offset + 26), start = offset + 30 + nameSize;
    entries.set(built.bytes.subarray(offset + 30, start).toString(), inflateRawSync(built.bytes.subarray(start, start + size)));
    offset = start + size;
  }
  assert.match(entries.get('extension.vsixmanifest').toString(), /Microsoft\.VisualStudio\.Code\.Engine" Value="\^1\.107\.0"/);
  assert.equal(JSON.parse(entries.get('extension/package.json')).engines.vscode, '^1.107.0');
});

test('Jelly Cursor installs through the verified local VSIX path and its effects are managed on', () => {
  const { installLocalVsix } = require('../lib/appearance-extension');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-install-')), dir = path.join(home, '.antigravity-ide', 'extensions');
  try {
    fs.mkdirSync(dir, { recursive: true });
    assert.equal(installLocalVsix(null, dir, source, 'iranon.jelly-cursor', { isolated: true, log() {} }).success, true);
    assert.equal(installLocalVsix(null, dir, source, 'iranon.jelly-cursor', { isolated: true, log() {} }).unchanged, true);
    const entry = readJson(path.join(dir, 'extensions.json')).find(item => item.identifier.id === 'iranon.jelly-cursor');
    assert.equal(entry.version, '0.0.8');
    assert.throws(() => installLocalVsix(null, dir, source, 'workstation.aster-appearance', { isolated: true }), /identity/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
  const settings = readJson(path.join(root, 'config/settings.json'));
  // A soft profile for long coding sessions: the rounded caret simply floats
  // to its new place with a faint glow while it moves. It leaves no trail or
  // ghost mark, clicks draw no ring and nothing spawns bubbles or particles.
  assert.equal(settings['jellyCursor.glowEnabled'], true);
  for (const key of ['trailEnabled', 'rippleEnabled', 'springEnabled', 'landingPulseEnabled', 'sparkEnabled', 'rainbowEnabled', 'gradientEnabled', 'reminders']) assert.equal(settings['jellyCursor.' + key], false, key);
  assert.equal(settings['jellyCursor.animationMode'], 'smooth');
  assert.equal(settings['jellyCursor.shapeStyle'], 'rounded');
  assert.equal(settings['jellyCursor.sparkAmount'], 0);
  assert.ok(settings['jellyCursor.glowOpacity'] <= 0.35 && settings['jellyCursor.glowSize'] <= 10, 'glow stays soft');
  assert.ok(settings['jellyCursor.midSpeed'] >= 0.2 && settings['jellyCursor.midSpeed'] <= 0.3, 'the caret floats gently instead of jumping');
  assert.equal(settings['calmTypeScript.typingPulse'], true);
  // While the caret rests it clearly blinks with the native smooth fade, yet
  // keeps a faint trace at the lowest point so its place is never lost.
  assert.equal(settings['editor.cursorBlinking'], 'smooth');
  assert.ok(settings['jellyCursor.minAlpha'] >= 0.05 && settings['jellyCursor.minAlpha'] <= 0.2);
  const options = require('../extensions/jelly-cursor/package.json').contributes.configuration.properties;
  for (const key of Object.keys(settings).filter(key => key.startsWith('jellyCursor.'))) assert.ok(options[key], key + ' is a real Jelly Cursor setting');
});

test('An update moves Jelly values written by earlier setups to the calm profile and keeps personal ones', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jelly-upgrade-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const customRoots = { userProfile: path.join(home, 'User'), gitBashPath: process.execPath };
  const env = require('../lib/paths').getEnvironmentPaths(customRoots);
  const options = { customRoots, skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} };
  assert.equal(require('../lib/installer').runInstaller(options).success, true);
  // The busy profile an earlier release wrote, plus two values the user chose.
  const earlier = { rippleEnabled: true, landingPulseEnabled: true, sparkEnabled: true, trailEnabled: true, springEnabled: true,
    animationMode: 'full', glowEnabled: false, glowOpacity: 0.35, glowSize: 10, shapeStyle: 'native', minAlpha: 0.3, reminders: true };
  const personal = { glowColor: '#ff00aa', trailLength: 7 };
  const current = readJson(env.settingsJson);
  for (const [key, value] of Object.entries({ ...earlier, ...personal })) current['jellyCursor.' + key] = value;
  current['calmTypeScript.typingPulse'] = false;
  current['personal.keep'] = 'exactly';
  fs.writeFileSync(env.settingsJson, JSON.stringify(current, null, 3));
  assert.equal(require('../lib/installer').runInstaller(options).success, true);
  const managed = readJson(path.join(root, 'config/settings.json')), after = readJson(env.settingsJson);
  for (const key of Object.keys(earlier)) assert.equal(after['jellyCursor.' + key], managed['jellyCursor.' + key], key);
  for (const [key, value] of Object.entries(personal)) assert.equal(after['jellyCursor.' + key], value, key);
  assert.equal(after['calmTypeScript.typingPulse'], true);
  assert.equal(after['personal.keep'], 'exactly');
});
