import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { mergeConfiguration, mergeUserConfiguration } = require('../lib/config-merge');
const { mergeSettings } = require('../lib/profile-settings');
const { mergeManagedValue } = require('../extensions/workstation-stability/profile.cjs');

test('Ordinary user configuration never supplies permission grants; explicit opt-in still retains personal policies', () => {
  const managed = { permissions: { allow: ['write_file(*)'] }, userSettings: { useAiCredits: true } };
  assert.deepEqual(mergeUserConfiguration({}, managed), { userSettings: { useAiCredits: true } });
  assert.deepEqual(mergeUserConfiguration({}, managed, { allowPermissions: true }), managed);
  const personal = { permissions: { deny: ['write_file(*)'], custom: false }, userSettings: { useAiCredits: false } };
  for (const options of [{}, { allowPermissions: true }]) {
    assert.deepEqual(mergeUserConfiguration(personal, managed, options), personal);
  }
});

test('Retiring a known exact hook preserves modified hooks, mixed foreign hooks and group metadata', () => {
  const { retireOwnedHooks } = require('../lib/config-merge');
  const old = { type: 'command', command: 'known owned command', timeout: 10 };
  const retired = { hooks: { AfterTool: [{ matcher: 'Read', hooks: [old] }] } };
  const changed = { ...old, timeout: 99 };
  const foreign = { type: 'command', command: 'foreign command' };
  const current = { hooks: { AfterTool: [{ matcher: 'Read', hooks: [old] },
    { matcher: 'Read', label: 'personal', hooks: [old, foreign] }, { matcher: 'Read', hooks: [changed] }] } };
  const next = retireOwnedHooks(current, retired, {});
  assert.deepEqual(next.hooks.AfterTool, [{ matcher: 'Read', label: 'personal', hooks: [foreign] }, { matcher: 'Read', hooks: [changed] }]);
  assert.deepEqual(retireOwnedHooks(next, retired, {}), next);
  assert.deepEqual(retireOwnedHooks(current, retired, retired), current);
});

test('Real installer preserves personal configuration through update, repeat and backup rollback', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workstation-personal-merge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const customRoots = { userProfile: path.join(root, 'User with spaces'), gitBashPath: process.execPath };
  const env = require('../lib/paths').getEnvironmentPaths(customRoots);
  const options = { customRoots, skipExtensions: true, skipAgentBrowser: true, skipFont: true, skipPermissions: true, log() {} };
  const run = () => {
    const result = require('../lib/installer').runInstaller(options);
    assert.equal(result.success, true, result.failures.join('; '));
    return result;
  };
  run();
  const screenshotRoot = path.join(env.geminiSkillsDir, 'in-chat-screenshot-to-code');
  const personalSettings = JSON.parse(fs.readFileSync(env.settingsJson));
  personalSettings['errorLens.excludeBySource'] = ['personal-linter', 'typescript'];
  personalSettings['errorLens.excludeByMessage'] = ['^personal ignored warning$'];
  const personalSettingsBytes = JSON.stringify(personalSettings, null, 3);
  fs.writeFileSync(env.settingsJson, personalSettingsBytes);
  for (const relative of ['SKILL.md', 'SOURCE.md', 'references/replication_instructions.md', 'references/stack_recipes.md', 'references/repo_orientation.md']) {
    assert.deepEqual(fs.readFileSync(path.join(screenshotRoot, relative)), fs.readFileSync(path.resolve(import.meta.dirname, '../skills/in-chat-screenshot-to-code', relative)));
  }
  assert.equal(fs.existsSync(path.join(env.geminiSkillsDir, '.DS_Store')), false);
  assert.equal(fs.existsSync(path.join(env.geminiSkillsDir, '__MACOSX')), false);
  for (const file of ['audit-context-inventory.cjs', 'build-corrective-checklist.cjs', 'clean-owned-comments.cjs', 'build-feature-guides.cjs',
    'audit-configuration.cjs', 'build-instructional-animations.cjs', 'build-instructional-catalog.cjs', 'build-stability-instructional.cjs', 'package-git-panel.cjs',
    'audit-powershell-syntax.ps1','audit-tracked-files.cjs','build-aster-icon.cjs','build-aster.cjs','fetch-aster-fonts.cjs','migrate-aster-profile.cjs','package-aster.cjs','run-test-coverage.cjs'])
    assert.equal(fs.existsSync(path.join(env.geminiScriptsDir, file)), false, 'Source-only development tooling must not be globally deployed');
  const files = [path.join(env.geminiDir, 'antigravity/settings.json'), path.join(env.geminiConfigDir, 'config.json')];
  const originals = files.map(file => {
    const value = JSON.parse(fs.readFileSync(file));
    value.personalPlugin = { nested: { list: ['original', 'keep'] } };
    value.userSettings = { ...value.userSettings, personal: { flag: true } };
    const bytes = JSON.stringify(value, null, 3);
    fs.writeFileSync(file, bytes);
    return bytes;
  });
  const updated = run();
  const checkExclusions = () => {
    const settings = JSON.parse(fs.readFileSync(env.settingsJson));
    for (const key of ['errorLens.excludeBySource', 'errorLens.excludeByMessage']) assert.deepEqual(settings[key], personalSettings[key]);
  };
  checkExclusions();
  for (const file of files) {
    const value = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(value.personalPlugin, { nested: { list: ['original', 'keep'] } });
    assert.deepEqual(value.userSettings.personal, { flag: true });
  }
  const after = files.map(file => fs.readFileSync(file, 'utf8'));
  run();
  checkExclusions();
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), after);
  const doctor = require('../lib/doctor').runDoctor({ customRoots, log() {} });
  assert.equal(doctor.checks.find(item => item.name === 'Managed editor settings').status, 'pass');
  for (const template of ['config/antigravity-settings.json', 'config/gemini-config.json']) {
    assert.equal(doctor.checks.find(item => item.name === template).status, 'pass');
  }
  require('../lib/backup').restoreBackup(updated.backupInfo.backupDir, env);
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), originals);
  assert.equal(fs.readFileSync(env.settingsJson, 'utf8'), personalSettingsBytes);
});

test('Configuration updates preserve nested personal values, permissions and foreign hook groups and are idempotent', () => {
  const managedHook = { type: 'command', command: 'managed command', timeout: 10 };
  const personalHook = { type: 'command', command: 'personal command', timeout: 55 };
  const before = { userSettings: { personal: true, useAiCredits: false }, otherPlugin: { nested: ['keep'] },
    permissions: { allow: ['personal permission'], deny: ['personal denial'] },
    hooks: { BeforeTool: [{ matcher: 'Read', label: 'keep metadata', hooks: [{ ...managedHook, timeout: 1 }, personalHook] }],
      PersonalEvent: [{ hooks: [personalHook] }] } };
  const snapshot = structuredClone(before);
  const managed = { userSettings: { useAiCredits: true }, permissions: { allow: ['managed permission', 'managed permission'] },
    hooks: { BeforeTool: [{ matcher: 'Read', hooks: [managedHook] }] } };
  const next = mergeConfiguration(before, managed);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(next.otherPlugin, before.otherPlugin);
  assert.deepEqual(next.userSettings, { personal: true, useAiCredits: true });
  assert.deepEqual(next.permissions, { allow: ['personal permission', 'managed permission'], deny: ['personal denial'] });
  assert.deepEqual(next.hooks.BeforeTool, [{ matcher: 'Read', label: 'keep metadata', hooks: [managedHook, personalHook] }]);
  assert.deepEqual(next.hooks.PersonalEvent, before.hooks.PersonalEvent);
  assert.deepEqual(mergeConfiguration(next, managed), next);
  assert.deepEqual(mergeConfiguration({}, managed), { ...managed, permissions: { allow: ['managed permission'] } });
});

test('Managed object type collisions refuse before discarding personal scalar or array values',()=>{
  for(const value of [null,false,42,'personal value',['personal value']]){
    const current={userSettings:value,personal:{keep:true}},snapshot=structuredClone(current);
    assert.throws(()=>mergeConfiguration(current,{userSettings:{useAiCredits:true}}),/Invalid managed object at userSettings.*preserved/);
    assert.deepEqual(current,snapshot);
  }
  assert.throws(()=>mergeConfiguration([],{userSettings:{useAiCredits:true}}),/Invalid managed object at <root>/);
});

test('Corrupt extension inventory is rejected in installer preflight before settings or backup changes',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'workstation-index-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const customRoots={userProfile:path.join(root,'User'),gitBashPath:process.execPath},env=require('../lib/paths').getEnvironmentPaths(customRoots);
  const options={customRoots,skipExtensions:true,skipAgentBrowser:true,skipFont:true,skipPermissions:true,log(){}};
  assert.equal(require('../lib/installer').runInstaller(options).success,true);
  fs.mkdirSync(env.extensionsDir,{recursive:true});fs.writeFileSync(path.join(env.extensionsDir,'extensions.json'),'null');
  const snapshot=()=>{
    const values={};const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else values[path.relative(root,file)]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}};
    walk(root);return values;
  };
  const before=snapshot();
  assert.throws(()=>require('../lib/installer').runInstaller({...options,skipExtensions:false}),/Invalid Aster Atelier extension index/);
  assert.deepEqual(snapshot(),before,'Failed preflight changes neither active settings, ownership nor backup files');
});

for(const kind of ['settings','keybindings','argv','gemini','antigravity','mcp'])test('Planning race preserves concurrent personal edits in '+kind,t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'workstation-plan-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const customRoots={userProfile:path.join(root,'User'),gitBashPath:process.execPath},env=require('../lib/paths').getEnvironmentPaths(customRoots);
  const options={customRoots,skipExtensions:true,skipAgentBrowser:true,skipFont:true,skipPermissions:true,log(){}};
  assert.equal(require('../lib/installer').runInstaller(options).success,true);
  const targets={settings:env.settingsJson,keybindings:env.keybindingsJson,argv:env.argvJson,
    gemini:path.join(env.geminiConfigDir,'config.json'),antigravity:path.join(env.geminiDir,'antigravity/settings.json'),mcp:path.join(env.geminiConfigDir,'mcp_config.json')};
  const target=targets[kind];
  const before=new Map(Object.values(targets).map(file=>[file,fs.readFileSync(file)])),backups=fs.readdirSync(env.backupsDir);
  const originalRead=fs.readFileSync;let reads=0,injected=false;
  t.mock.method(fs,'readFileSync',function(file,...args){
    const bytes=originalRead.call(fs,file,...args);
    if(file===target&&++reads===2){
      const value=JSON.parse(bytes.toString());
      if(kind==='keybindings')value.push({key:'ctrl+alt+shift+9',command:'personal.concurrentEdit'});else value['personal.concurrentEdit']='preserve exactly';
      fs.writeFileSync(file,JSON.stringify(value));injected=true;
    }
    return bytes;
  });
  let failure;
  try{require('../lib/installer').runInstaller(options);}catch(error){failure=error;}
  assert.equal(injected,true);
  const after=JSON.parse(originalRead(target,'utf8'));
  if(kind==='keybindings')assert.equal(after.some(binding=>binding.command==='personal.concurrentEdit'),true);else assert.equal(after['personal.concurrentEdit'],'preserve exactly');
  assert.match(failure?.message||'',/Profile file changed during installation/);
  assert.deepEqual(fs.readdirSync(env.backupsDir),backups,'Planning conflict stops before backup creation');
  for(const [file,bytes] of before)if(file!==target)assert.deepEqual(originalRead(file),bytes,'Unrelated active files are untouched');
  t.mock.restoreAll();assert.equal(require('../lib/installer').runInstaller(options).success,true,'A fresh retry can merge the new personal setting safely');
  const retried=JSON.parse(fs.readFileSync(target,'utf8'));
  if(kind==='keybindings')assert.equal(retried.some(binding=>binding.command==='personal.concurrentEdit'),true);else assert.equal(retried['personal.concurrentEdit'],'preserve exactly');
});

test('Rules-only update preserves edits made while its backup is being created',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'workstation-rules-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const env=require('../lib/paths').getEnvironmentPaths({userProfile:path.join(root,'User')});
  const files=[path.join(env.geminiDir,'GEMINI.md'),...['workstation-unified-design','workstation-unified-full-stack'].map(name=>path.join(env.geminiRulesDir,name+'.md')),
    ...['design.md','full-stack.md'].map(name=>path.join(env.geminiConfigDir,'workstation-unified/guides',name))];
  for(const file of files){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'original '+path.basename(file));}
  const before=files.map(file=>fs.readFileSync(file)),copy=fs.copyFileSync;let injected=false;
  t.mock.method(fs,'copyFileSync',function(source,...args){const result=copy.call(fs,source,...args);if(source===files[0]){fs.writeFileSync(source,'concurrent personal instructions');injected=true;}return result;});
  let failure;try{require('../lib/installer').runInstaller({rulesOnly:true,home:env.userProfile,log(){}});}catch(error){failure=error;}
  assert.equal(injected,true);assert.equal(fs.readFileSync(files[0],'utf8'),'concurrent personal instructions');
  assert.match(failure?.message||'',/Profile file changed during installation/);
  for(let index=1;index<files.length;index++)assert.deepEqual(fs.readFileSync(files[index]),before[index]);
});

test('Personal theme token rules survive installer and editor application with personal rules retaining last priority', () => {
  const ownRule = { scope: 'comment', settings: { fontStyle: 'italic' } };
  const userRule = { scope: 'comment', settings: { foreground: '#123456' } };
  const previous = { '[Light+]': { textMateRules: [userRule] }, textMateRules: [userRule],
    '[One Dark Pro]': { textMateRules: [userRule], personalSetting: true } };
  const desired = { '[One Dark Pro]': { comments: '#7F848E', textMateRules: [ownRule] } };
  const merged = mergeSettings({ 'workbench.colorTheme': 'Light+', 'editor.tokenColorCustomizations': previous },
    { 'workbench.colorTheme': 'One Dark Pro', 'editor.tokenColorCustomizations': desired });
  assert.equal(merged['workbench.colorTheme'], 'Light+');
  const tokens = merged['editor.tokenColorCustomizations'];
  assert.deepEqual(tokens['[Light+]'], previous['[Light+]']);
  assert.deepEqual(tokens.textMateRules, [userRule]);
  assert.deepEqual(tokens['[One Dark Pro]'].textMateRules, [ownRule, userRule]);
  assert.equal(tokens['[One Dark Pro]'].personalSetting, true);
  assert.deepEqual(mergeManagedValue('editor.tokenColorCustomizations', tokens, desired), tokens);
});

test('personal editor visual preferences survive setup without replacing false values and nested palettes', () => {
  const { mergeSettings } = require('../lib/profile-settings');
  const current = {
    'editor.guides.indentation': false,
    'editor.guides.bracketPairs': true,
    'editor.fontFamily': 'Personal Mono',
    'workbench.settings.applyToAllProfiles': ['personal.key'],
    'workbench.colorCustomizations': { 'editor.background': '#123456', '[My Theme]': { 'editor.foreground': '#abcdef' } },
    'editor.semanticTokenColorCustomizations': { rules: { 'variable.readonly': { bold: true } } },
    'errorLens.enabled': false,
    'prettier.requireConfig': true,
    'git.autofetch': false,
    '[typescriptreact]': { 'editor.fontSize': 21, 'editor.guides.indentation': false }
  };
  const desired = Object.fromEntries(Object.keys(current).map(key => [key, {}]));
  const merged = mergeSettings(current, desired);
  for (const [key,value] of Object.entries(current)) {
    if (key === 'editor.tokenColorCustomizations') continue;
    assert.deepEqual(merged[key], value, key);
  }
  assert.equal(mergeSettings({'editor.tabSize': 6}, {'editor.tabSize': 2})['editor.tabSize'], 2,
    'Non-appearance managed settings still migrate');
  const restored = mergeSettings({ 'editor.guides.bracketPairs': false, 'editor.fontLigatures': false },
    { 'editor.guides.bracketPairs': 'active', 'editor.fontLigatures': true });
  assert.deepEqual(restored, { 'editor.guides.bracketPairs': 'active', 'editor.fontLigatures': true },
    'Values earlier setups wrote move to the active scope line and ligatures');
});

test('Upgrade delivers new managed appearance keys while personal values stay verbatim', () => {
  const current = {
    'workbench.colorCustomizations': {
      'errorLens.errorForeground': '#f8717126',
      'errorLens.errorBackground': '#00000000',
    },
    'workbench.settings.applyToAllProfiles': ['personal.setting', 'window.zoomLevel'],
    'editor.fontFamily': 'Personal Mono',
  };
  const managed = require('../config/settings.json');
  const merged = mergeSettings(current, managed);
  const customizations = merged['workbench.colorCustomizations'];
  assert.equal(customizations['errorLens.errorForeground'], '#f8717126', 'personal errorLens value preserved');
  assert.equal(customizations['errorLens.errorBackgroundLight'], '#00000000', 'new managed transparent keys reach the upgrade');
  assert.equal(customizations['errorLens.warningRangeBackground'], '#00000000', 'new managed range keys reach the upgrade');
  const shared = merged['workbench.settings.applyToAllProfiles'];
  assert.ok(shared.includes('personal.setting'), 'user-added sharing entries survive');
  assert.ok(shared.includes('terminal.integrated.fontFamily'), 'managed sharing additions reach the upgrade');
  assert.ok(shared.includes('scm.inputFontFamily'), 'scm sharing additions reach the upgrade');
  assert.equal(merged['editor.fontFamily'], 'Personal Mono', 'personal font stays');
});

test('Apply-profile keeps a studio font on every surface instead of splitting editor and terminal', () => {
  const { FONT_FAMILY_KEYS } = require('../extensions/aster-appearance/appearance.cjs');
  const current = Object.fromEntries(FONT_FAMILY_KEYS.map(key => [key, "'Fira Code', monospace"]));
  current['terminal.integrated.fontWeight'] = 500;
  const managed = require('../config/settings.json');
  const merged = mergeSettings(current, managed, { userLanguageOverrides: false });
  for (const key of FONT_FAMILY_KEYS) assert.equal(merged[key], "'Fira Code', monospace", key + ' keeps the personal font');
  assert.equal(merged['terminal.integrated.fontWeight'], 500);
});

test('Settings of removed extensions are deleted instead of being carried forward', () => {
  const { isRetiredSetting } = require('../lib/profile-settings');
  const current = { 'turboConsoleLog.quote': "'", 'turboConsoleLog.includeLineNum': true, 'tsMancho.quiet': true, 'editor.fontSize': 17 };
  const merged = mergeSettings(current, require('../config/settings.json'));
  assert.equal(Object.keys(merged).some(isRetiredSetting), false);
  assert.equal(isRetiredSetting('tsMancho.quiet'), false, 'old Calm TypeScript keys keep their own migration');
  assert.equal(merged['editor.fontSize'], 17, 'personal settings stay');
  assert.equal(isRetiredSetting('editor.turboConsoleLog'), false, 'only the exact prefix is retired');
});
