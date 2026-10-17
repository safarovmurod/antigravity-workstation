# Opt-in public-network check. Does not install prerequisites, extensions or fonts.
# Tests production download/extraction helpers and the downloaded Node installer
# in an isolated profile. Native Windows bootstrap is covered separately.
param([string]$ExpectedCommit = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$expectedVersion = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$directory = Join-Path ([IO.Path]::GetTempPath()) ('mansur-live-download-' + [guid]::NewGuid().ToString('N'))
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'scripts/bootstrap.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -is [Management.Automation.Language.FunctionDefinitionAst]) { . ([scriptblock]::Create($statement.Extent.Text)) }
}
try {
    New-Item -ItemType Directory -Path $directory | Out-Null
    $git = (Get-Command git -ErrorAction Stop).Source
    $node = (Get-Command node -ErrorAction Stop).Source
    $remote = Invoke-SetupGit -GitPath $git -Arguments @('ls-remote', 'https://github.com/safarovmurod/antigravity-workstation.git', 'refs/heads/main') -Label 'Resolve live main'
    $commit = ("$remote" -split '\s+')[0]
    if ($ExpectedCommit -and $commit -cne $ExpectedCommit) { throw "Remote main $commit differs from expected published commit $ExpectedCommit" }
    $bootstrap = Join-Path $directory 'downloaded bootstrap.ps1'
    Invoke-SetupDownload -Uri ('https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/main/scripts/bootstrap.ps1?t=' + [guid]::NewGuid()) -OutFile $bootstrap -TimeoutSec 120
    $downloadErrors = $null
    $downloadedAst = [Management.Automation.Language.Parser]::ParseFile($bootstrap, [ref]$tokens, [ref]$downloadErrors)
    if ($downloadErrors.Count) { throw 'Downloaded bootstrap has PowerShell syntax errors' }
    $functions = @($downloadedAst.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.FunctionDefinitionAst] })
    if ('Assert-SetupPackage' -notin $functions.Name -or 'Get-SetupArguments' -notin $functions.Name) { throw 'Downloaded bootstrap is stale: version guard or command routing missing' }
    foreach ($statement in $functions) { . ([scriptblock]::Create($statement.Extent.Text)) }
    $source = Get-SetupSource -GitPath $git -Commit $commit -Directory $directory
    $package = Assert-SetupPackage -Source $source -MinimumVersion $expectedVersion
    if ($package.version -ne $expectedVersion) { throw "Downloaded $($package.version), expected the published version $expectedVersion" }
    if ((Get-FileHash -LiteralPath $bootstrap).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source 'scripts/bootstrap.ps1')).Hash) { throw 'Raw bootstrap and commit ZIP do not contain the same script' }
    foreach ($required in @('lib/agent-automation.js', 'lib/quiet-completion.js', 'lib/setup-status.js', 'lib/rollback.js', 'lib/native-compatibility.js', 'config/native-compatibility.json', 'config/extension-profiles.json', 'docs/RELIABILITY-2.2.0.md', 'rules/GEMINI.template.md', 'config/settings.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Leaf)) { throw "New release file is missing: $required" }
    }
    $isolatedProfile = Join-Path $directory 'User with spaces'
    $entry = Join-Path $source 'bin/mansur-setup.js'
    $quietArguments = @(Get-SetupArguments -Entry $entry -QuietCompletion)
    if ($quietArguments.Count -ne 2 -or $quietArguments[0] -cne $entry -or $quietArguments[1] -cne 'quiet-completion') { throw 'Downloaded quiet launcher must invoke only the completion command' }
    $normalArguments = @(Get-SetupArguments -Entry $entry)
    if ($normalArguments[1] -cne 'install' -or '--auto-approve' -notin $normalArguments) { throw 'Ordinary download must include native automation and completion disable' }
    $liteArguments = @(Get-SetupArguments -Entry $entry -ExtensionProfile lite)
    if ('--extension-profile' -notin $liteArguments -or 'lite' -notin $liteArguments) { throw 'Downloaded bootstrap lacks optional lite selection' }
    & $node $entry install --rules-only --home $isolatedProfile
    if ($LASTEXITCODE -ne 0) { throw 'Downloaded rules installer failed' }
    $original = Join-Path $source 'rules/GEMINI.template.md'
    $installed = Join-Path $isolatedProfile '.gemini/GEMINI.md'
    if ((Get-FileHash -LiteralPath $original).Hash -ne (Get-FileHash -LiteralPath $installed).Hash) { throw 'Downloaded rules were not applied exactly' }
    $verifyDownloaded = @'
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const source = process.argv[1], home = process.argv[2];
const { runInstaller } = require(path.join(source, 'lib/installer'));
const { getEnvironmentPaths } = require(path.join(source, 'lib/paths'));
const { planPayload, statePath, digest } = require(path.join(source, 'lib/owned-files'));
const { selectExtensions } = require(path.join(source, 'lib/extension-profiles'));
const catalog = JSON.parse(fs.readFileSync(path.join(source, 'config/extensions.json')));
assert.equal(selectExtensions(catalog, 'full').length, catalog.length);
assert.ok(selectExtensions(catalog, 'lite').length < catalog.length);
const customRoots = { userProfile: home, gitBashPath: process.execPath };
for (let i = 0; i < 2; i++) {
  const result = runInstaller({ customRoots, skipExtensions: true, skipAgentBrowser: true, skipPermissions: true, log() {} });
  if (!result.success) throw new Error(result.failures.join('; '));
  if (i === 0) {
    const firstEnv = getEnvironmentPaths(customRoots);
    const personal = JSON.parse(fs.readFileSync(firstEnv.settingsJson));
    personal['editor.fontSize'] = 37;
    personal['editor.inlineSuggest.enabled'] = true;
    fs.writeFileSync(firstEnv.settingsJson, JSON.stringify(personal));
  }
}
const env = getEnvironmentPaths(customRoots), plan = planPayload(env, source, 'Шеф');
const settingsAfterUpdate = JSON.parse(fs.readFileSync(env.settingsJson));
const sourceSettings = JSON.parse(fs.readFileSync(path.join(source, 'config/settings.json')));
assert.equal(settingsAfterUpdate['editor.fontSize'], sourceSettings['editor.fontSize'], 'Update deliberately reapplies repository settings');
assert.equal(settingsAfterUpdate['editor.inlineSuggest.enabled'], false);
assert.equal(JSON.parse(fs.readFileSync(path.join(env.geminiConfigDir, 'mansur-setup/install-options.json'))).extensionProfile, 'full');
assert.equal(plan.writes.length, 0, 'Downloaded payload must be complete and repeatable');
assert.equal(plan.removals.length, 0);
const registry = JSON.parse(fs.readFileSync(statePath(env)));
assert.equal(registry.files.length, plan.expectedCount);
assert.ok(registry.files.length >= 1068, 'Rules, skills, agents, hooks and runtimes must all be present');
const counts = {};
for (const file of registry.files) {
  const separator = file.key.indexOf('/'), area = file.key.slice(0, separator);
  const installed = path.join(plan.roots[area], file.key.slice(separator + 1));
  assert.equal(digest(fs.readFileSync(installed)), file.hash, 'Installed file mismatch: ' + file.key);
  counts[area] = (counts[area] || 0) + 1;
}
console.log('PASS: downloaded full profile and repeat; every installed payload hash verified: ' + JSON.stringify(counts));
const nativeSource = process.env.MANSUR_ANTIGRAVITY_MAIN;
if (nativeSource) {
  const { DatabaseSync } = require('node:sqlite');
  const { applyQuietCompletion } = require(path.join(source, 'lib/quiet-completion'));
  const { queueAutomation, TAB_TOPIC_KEY, TAB_POLICIES, readTabPolicies } = require(path.join(source, 'lib/agent-automation'));
  const { TOPIC_KEY, stringField } = require(path.join(source, 'lib/mcp-permissions'));
  const quietHome = path.join(home, 'Downloaded quiet completion');
  const quietEnv = { ideRoot: path.join(quietHome, 'IDE'), userSettingsDir: path.join(quietHome, 'User'),
    settingsJson: path.join(quietHome, 'User/settings.json'), geminiConfigDir: path.join(quietHome, '.gemini/config'),
    backupsDir: path.join(quietHome, 'backups') };
  const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  const main = path.join(quietEnv.ideRoot, 'resources/app/out/main.js');
  fs.mkdirSync(path.dirname(main), { recursive: true }); fs.copyFileSync(nativeSource, main);
  writeJson(path.join(quietEnv.ideRoot, 'resources/app/product.json'), { ideVersion: '2.5.5' });
  const inline = 'editor.inlineSuggest.enabled';
  const beforeSettings = { [inline]: true, 'editor.suggestOnTriggerCharacters': true,
    'typescript.suggest.autoImports': true, 'javascript.suggest.autoImports': true,
    'editor.suggest.showFiles': true, 'editor.suggest.showFolders': true,
    'chat.tools.terminal.autoApprove': { 'npm install': false, 'git status': true },
    '[javascript][typescript]': { [inline]: true, 'editor.defaultFormatter': 'personal.formatter' },
    '[python]': { [inline]: true, 'editor.tabSize': 8 }, 'personal.setting': 'retain' };
  writeJson(quietEnv.settingsJson, beforeSettings);
  const profileFile = path.join(quietEnv.geminiConfigDir, 'mansur-setup/editor-profile.json');
  writeJson(profileFile, { schema: 1, requestId: require('node:crypto').randomUUID(), setupVersion: '2.1.12', locale: 'ru',
    settings: { 'chat.tools.terminal.autoApprove': { 'npm install': true }, 'editor.fontSize': 99 } });
  const dbFile = path.join(quietEnv.userSettingsDir, 'globalStorage/state.vscdb');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  const agentBefore = 'PRIVATE-OPAQUE-AGENT-PREFERENCES';
  const entry = (key, value) => stringField(1, Buffer.concat([stringField(1, key), stringField(2, stringField(1, Buffer.from([16, value]).toString('base64')))]));
  try {
    db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)');
    const insert = db.prepare('INSERT INTO ItemTable VALUES(?,?)');
    insert.run(TOPIC_KEY, agentBefore);
    insert.run(TAB_TOPIC_KEY, Buffer.concat([entry('tabEnabled', 2), entry('autocompleteSpeed', 3)]).toString('base64'));
    insert.run('private-account-row', 'PRIVATE-ACCOUNT-RETAIN');
  } finally { db.close(); }
  const queue = (receivedEnv, options) => {
    assert.equal(receivedEnv, quietEnv); assert.equal(options.scope, 'completion');
    return queueAutomation(receivedEnv, { ...options, isRunning: () => false });
  };
  const first = applyQuietCompletion(quietEnv, { queue });
  assert.equal(first.success, true); assert.equal(first.editor.changed, true);
  assert.equal(first.native.applied, true); assert.equal(first.native.scope, 'completion');
  assert.equal(first.native.runtimeVerified, false); assert.deepEqual(first.native.storedTabPolicies, TAB_POLICIES);
  const savedSettings = fs.readFileSync(quietEnv.settingsJson), savedProfile = fs.readFileSync(profileFile);
  const settings = JSON.parse(savedSettings), profile = JSON.parse(savedProfile);
  assert.equal(settings[inline], false);
  for (const key of ['[javascript]', '[javascriptreact]', '[typescript]', '[typescriptreact]', '[javascript][typescript]', '[python]']) assert.equal(settings[key][inline], false);
  for (const key of ['editor.suggestOnTriggerCharacters', 'typescript.suggest.autoImports', 'javascript.suggest.autoImports', 'editor.suggest.showFiles', 'editor.suggest.showFolders']) assert.equal(settings[key], true);
  assert.deepEqual(settings['chat.tools.terminal.autoApprove'], beforeSettings['chat.tools.terminal.autoApprove']);
  assert.equal(settings['[javascript][typescript]']['editor.defaultFormatter'], 'personal.formatter');
  assert.equal(settings['[python]']['editor.tabSize'], 8); assert.equal(settings['personal.setting'], 'retain');
  assert.deepEqual(Object.keys(profile.settings).filter(key => !key.startsWith('[')), [inline]);
  for (const [key, value] of Object.entries(profile.settings)) {
    if (key.startsWith('[')) assert.deepEqual(value, { [inline]: false });
  }
  const verifyDb = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const get = key => verifyDb.prepare('SELECT value FROM ItemTable WHERE key=?').get(key)?.value;
    assert.equal(get(TOPIC_KEY), agentBefore); assert.equal(get('private-account-row'), 'PRIVATE-ACCOUNT-RETAIN');
    assert.deepEqual(readTabPolicies(get(TAB_TOPIC_KEY)), { tabEnabled: 1, tabToJump: 2 });
  } finally { verifyDb.close(); }
  const repeat = applyQuietCompletion(quietEnv, { queue });
  assert.equal(repeat.success, true); assert.equal(repeat.editor.changed, false); assert.equal(repeat.native.changed, false);
  assert.deepEqual(fs.readFileSync(quietEnv.settingsJson), savedSettings); assert.deepEqual(fs.readFileSync(profileFile), savedProfile);
  const { getSetupStatus } = require(path.join(source, 'lib/setup-status'));
  assert.equal(getSetupStatus(quietEnv).state, 'applied');
  const { restoreSetup } = require(path.join(source, 'lib/rollback'));
  const restored = restoreSetup(first.editor.backup, quietEnv, { isRunning: () => false });
  assert.equal(restored.success, true); assert.equal(restored.complete, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(quietEnv.settingsJson)), beforeSettings);
  const restoredDb = new DatabaseSync(dbFile, { readOnly: true });
  try {
    assert.equal(restoredDb.prepare('SELECT value FROM ItemTable WHERE key=?').get(TOPIC_KEY).value, agentBefore);
    assert.equal(restoredDb.prepare('SELECT value FROM ItemTable WHERE key=?').get('private-account-row').value, 'PRIVATE-ACCOUNT-RETAIN');
  } finally { restoredDb.close(); }
  assert.equal(getSetupStatus(quietEnv).state, 'cancelled');
  console.log('PASS: downloaded quiet command, status and coordinated rollback preserve IntelliSense, personal language values and exact chat/account bytes; native AI Tab and ghost text disable and repeat are verified.');
} else {
  console.log('SKIP: downloaded native quiet-completion integration needs MANSUR_ANTIGRAVITY_MAIN from the audited official 2.5.5 build.');
}
console.log('NOTE: external font/gallery/browser provisioning and live native chat were not run by this isolated check.');
'@
    & $node -e $verifyDownloaded $source $isolatedProfile
    if ($LASTEXITCODE -ne 0) { throw 'Downloaded isolated profile installer failed' }
    Write-Host "PASS: live raw bootstrap, commit-resolved download/extraction, rules install, isolated full configuration and repeat. Package $($package.version); commit $commit"
} finally {
    if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
}
