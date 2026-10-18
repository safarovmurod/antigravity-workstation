'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

async function rendererConnection() {
  const targets = await (await fetch(`http://127.0.0.1:${process.env.MANSUR_EDITOR_CDP_PORT}/json/list`)).json();
  const target = targets.find(item => item.type === 'page' && item.url.startsWith('vscode-file:'));
  assert.ok(target, 'Isolated editor renderer is available');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let serial = 0;
  return {
    evaluate(expression) { return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => reject(new Error('Renderer inspection timed out')), 10000);
      function received(event) {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timer);
        socket.removeEventListener('message', received);
        if (message.error) reject(new Error(message.error.message));
        else if (message.result.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
        else resolve(message.result.result.value);
      }
      socket.addEventListener('message', received);
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { returnByValue: true, expression } }));
    }); }, close() { socket.close(); }
  };
}

async function inspectRenderer() {
  const connection = await rendererConnection();
  try {
    let result;
    await waitFor(async () => {
      result = await connection.evaluate(`(() => { const editor = document.querySelector('.monaco-editor'); const cursor = editor?.querySelector('.cursor'); const style = cursor && getComputedStyle(cursor); return { editor: !!editor, cursor: !!cursor, width: style?.width, animation: style?.animationName, transition: style?.transitionProperty, layer: editor?.querySelector('.cursors-layer')?.className }; })()`);
      return result.cursor && Math.abs(parseFloat(result.width) - 3) < 0.01;
    }, 'smooth cursor finishes its transition to the configured width', 3000);
    assert.equal(result.editor, true);
    assert.equal(result.cursor, true);
    assert.equal(result.width, '3px');
    assert.match(result.layer, /cursor-smooth-caret-animation/);
    return result;
  } finally { connection.close(); }
}

async function waitFor(check, description, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + description);
}

async function selectedFeatures(vscode, folder, document, editor) {
  const connection = await rendererConnection();
  try {
    const pulseCount = `Array.from(document.querySelectorAll('.monaco-editor div,.monaco-editor span')).filter(node => /^rgba?\\((56, 189, 248|2, 132, 199),/.test(getComputedStyle(node).backgroundColor) && node.getBoundingClientRect().width > 0).length`;
    assert.equal(await connection.evaluate(pulseCount), 0);
    await editor.edit(builder => builder.insert(document.lineAt(document.lineCount - 1).range.end, 'F'));
    await waitFor(async () => await connection.evaluate(pulseCount) > 0, 'typed character visibly pulses', 1500);
    await waitFor(async () => await connection.evaluate(pulseCount) === 0, 'pulse fades out', 2000);
    await waitFor(() => !document.isDirty && fs.readFileSync(document.uri.fsPath, 'utf8') === document.getText(),
      'Auto Save writes edited contents to disk', 8000);
  } finally { connection.close(); }
  await vscode.window.showTextDocument(document);
}

async function run() {
  if (process.env.MANSUR_VERIFY_EDITOR_PROFILE || process.env.MANSUR_VERIFY_COMPLETIONS) return verifyEditorProfile();
  const vscode = require('vscode');
  const extension = vscode.extensions.getExtension('mancho.ts-mancho');
  assert.ok(extension);
  const api = await extension.activate();
  await api.ready();
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const config = vscode.workspace.getConfiguration();
  assert.equal(config.get('typescript.validate.enable'), true);
  assert.equal(config.get('javascript.validate.enable'), true);
  assert.equal(config.get('typescript.suggestionActions.enabled'), true);
  assert.equal(config.get('javascript.suggestionActions.enabled'), true);
  assert.equal(config.get('editor.cursorSmoothCaretAnimation'), 'on');
  assert.equal(config.get('editor.cursorBlinking'), 'smooth');
  assert.equal(config.get('editor.smoothScrolling'), true);
  assert.equal(config.get('editor.cursorWidth'), 3);
  assert.equal(config.get('files.autoSave'), 'off');
  assert.equal(config.get('files.autoSaveDelay'), 2000);
  assert.notEqual(config.get('problems.visibility'), false);
  for (const [languageId, filename] of [['typescript', 'sample.ts'], ['typescriptreact', 'sample.tsx'],
    ['javascript', 'sample.js'], ['javascriptreact', 'sample.jsx']]) {
    const settings = vscode.workspace.getConfiguration('editor', { uri: vscode.Uri.joinPath(folder, filename), languageId });
    assert.equal(settings.get('showUnused'), true, languageId);
  }

  const file = vscode.Uri.joinPath(folder, 'quiet.ts');
  const document = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(document);
  const editorConfig = vscode.workspace.getConfiguration('editor', document);
  assert.equal(editorConfig.get('showUnused'), true);
  const typescript = vscode.extensions.getExtension('vscode.typescript-language-features');
  assert.ok(typescript);
  await typescript.activate();
  await waitFor(async () => {
    const completions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', file, document.lineAt(2).range.end);
    return completions?.items.some(item => (typeof item.label === 'string' ? item.label : item.label.label) === 'toFixed');
  }, 'IntelliSense remains operational');
  await waitFor(() => vscode.languages.getDiagnostics(file).some(item => item.code === 2322), 'TypeScript validation stays operational in quiet mode');
  const edit = new vscode.WorkspaceEdit();
  edit.insert(file, new vscode.Position(0, 0), 'const unusedAgain: number = "bad";\n');
  assert.equal(await vscode.workspace.applyEdit(edit), true);
  await new Promise(resolve => setTimeout(resolve, 2500));
  await waitFor(() => vscode.languages.getDiagnostics(file).some(item => item.code === 2322), 'TypeScript validation stays operational in quiet mode');
  assert.ok(document.getText().includes('const unusedAgain: number = "bad"'));
  const commands = await vscode.commands.getCommands(true);
  for (const old of ['tsMancho.explainAtCursor', 'tsMancho.showAnalysis', 'tsMancho.applyFix', 'tsMancho.applyVerifiedFix', 'tsMancho.openSettings', 'tsMancho.formatDocument']) {
    assert.ok(!commands.includes(old), 'Removed old command: ' + old);
  }
  assert.ok(commands.includes('tsMancho.resetManagedSettings'), 'The reset command is registered');
  await selectedFeatures(vscode, folder, document, editor);

  // Disabling the visual settings restores presentation, while validation stays enabled.
  const modes = vscode.workspace.getConfiguration('tsMancho');
  for (const key of ['quietMode', 'smoothTyping', 'typingPulse', 'autoSaveAfterTyping']) {
    await modes.update(key, false, vscode.ConfigurationTarget.Global);
  }
  await waitFor(() => vscode.workspace.getConfiguration().get('workbench.colorCustomizations') === undefined,
    'switching quiet mode off removes the calm squiggle colors');
  await api.ready();
  assert.equal(vscode.workspace.getConfiguration().get('typescript.validate.enable'), true);
  assert.equal(vscode.workspace.getConfiguration().get('editor.cursorBlinking'), 'blink');
  assert.equal(vscode.workspace.getConfiguration().get('files.autoSave'), 'off');
  assert.equal(vscode.workspace.getConfiguration().get('files.autoSaveDelay'), 2000);
  const connection = await rendererConnection();
  const squiggles = `document.querySelectorAll('.monaco-editor .squiggly-error,.monaco-editor .squiggly-warning').length`;
  try {
    await waitFor(async () => await connection.evaluate(squiggles) > 0, 'real squiggles are visible when quiet mode is off');
    for (const key of ['quietMode', 'smoothTyping', 'typingPulse', 'autoSaveAfterTyping']) {
      await modes.update(key, true, vscode.ConfigurationTarget.Global);
    }
    await api.ready();
    await waitFor(async () => vscode.workspace.getConfiguration().get('workbench.colorCustomizations')?.['editorError.foreground'] === '#f871710D',
      'calm colors return when quiet mode is on');
    await waitFor(async () => await connection.evaluate(squiggles) > 0, 'squiggles stay visible under the calm 95% colors');
  } finally { connection.close(); }
  assert.equal(vscode.workspace.getConfiguration('editor', document).get('showUnused'), true);
  assert.equal(vscode.workspace.getConfiguration().get('typescript.validate.enable'), true);
  assert.equal(vscode.workspace.getConfiguration().get('editor.cursorSmoothCaretAnimation'), 'on');
  const renderer = process.env.MANSUR_EDITOR_CDP_PORT ? await inspectRenderer() : undefined;
  const result = { passed: true, editorVersion: vscode.version,
    checks: ['native TS validation remains enabled', 'calm 95% squiggle colors applied and removed by the switch',
      'unused hints stay visible', 'IntelliSense toFixed available',
      'edit remains unchanged by extension', 'old commands removed', 'quiet switch keeps real squiggles visible', 're-enable reapplies calm colors',
      'native smooth cursor settings effective', 'typing pulse renders and fades', 'Auto Save persists actual edits',
      'native Auto Save settings remain unchanged'],
    ...(renderer ? { renderer } : {}) };
  if (process.env.MANSUR_EDITOR_RESULT) fs.writeFileSync(process.env.MANSUR_EDITOR_RESULT, JSON.stringify(result, null, 2));
  console.log('TS MANCHO EDITOR PASS', JSON.stringify(result));
}

async function verifyEditorProfile() {
  const vscode = require('vscode');
  const completionsOnly = process.env.MANSUR_VERIFY_COMPLETIONS === '1';
  const { applyEditorProfile, isRegisteredSetting } = require('../extensions/mansur-antigravity-stability/profile.cjs');
  const { expectedSettings } = require('../lib/profile-settings');
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const values = {};
  const context = { globalState: { get(key) { return values[key]; }, async update(key, value) { values[key] = value; } } };
  const complete = expectedSettings({ userProfile: folder.fsPath, localAppData: folder.fsPath, gitBashPath: '/fixture/git/bash' });
  // This editor has built-in/TS providers only; gallery-provider behavior is not claimed here.
  const settings = Object.fromEntries(Object.entries(complete).filter(([key]) => isRegisteredSetting(vscode, key)));
  const planFile = path.join(folder.fsPath, 'editor-profile.json');
  fs.writeFileSync(planFile, JSON.stringify({ schema: 1, requestId: require('node:crypto').randomUUID(), setupVersion: require('../package.json').version, locale: 'ru', settings }));
  const result = await applyEditorProfile(vscode, context, { file: planFile });
  assert.deepEqual(result.failed, [], 'Every managed setting must apply through the real editor API');
  assert.deepEqual(result.overrides, []);
  assert.equal(result.status, completionsOnly ? 'restart-required' : 'applied', JSON.stringify(result));
  if (!completionsOnly) assert.match(vscode.env.language, /^ru(?:-|$)/);
  const config = vscode.workspace.getConfiguration();
  assert.equal(config.get('workbench.iconTheme'), 'material-icon-theme');
  assert.equal(config.get('editor.defaultFormatter'), 'esbenp.prettier-vscode');
  assert.equal(config.get('editor.inlineSuggest.enabled'), false);
  assert.equal(config.get('typescript.suggest.autoImports'), true);
  assert.equal(config.get('editor.wordBasedSuggestions'), 'off');
  assert.equal(config.get('editor.snippetSuggestions'), 'none');
  assert.equal(config.get('editor.suggest.showKeywords'), true);
  assert.equal(config.get('editor.suggest.showVariables'), true);
  assert.equal(config.get('emmet.showExpandedAbbreviation'), 'never');
  const defaultSettings = JSON.parse(fs.readFileSync(process.env.MANSUR_DEFAULT_SETTINGS_FILE, 'utf8'));
  assert.equal(defaultSettings['editor.quickSuggestionsDelay'], 987, 'The named profile receives the settings; the unrelated default profile stays unchanged');
  const uri = vscode.Uri.joinPath(folder, 'completion.ts');
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
  const label = item => typeof item.label === 'string' ? item.label : item.label.label;
  await waitFor(async () => {
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(0, 3));
    return list?.items.some(item => label(item) === 'const');
  }, 'native const keyword completion');
  await waitFor(async () => {
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(3, 3));
    return list?.items.some(item => label(item) === 'Card');
  }, 'native cross-component auto-import completion');
  // The provider API is unfiltered. Check the actual widget after editor category filters.
  const suggestions = await rendererConnection();
  try {
    const labels = `Array.from(document.querySelectorAll('.suggest-widget .monaco-list-row .label-name')).map(node => node.textContent)`;
    editor.selection = new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3));
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    await waitFor(async () => (await suggestions.evaluate(labels)).length > 0, 'filtered native suggestion widget opens');
    assert.ok(!(await suggestions.evaluate(labels)).includes('const'), 'keyword suggestions are hidden in the real widget');
    editor.selection = new vscode.Selection(new vscode.Position(2, 3), new vscode.Position(2, 3));
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    await waitFor(async () => (await suggestions.evaluate(labels)).includes('localVariable'), 'own variable remains in the native widget');
    editor.selection = new vscode.Selection(new vscode.Position(3, 3), new vscode.Position(3, 3));
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    const selected = `document.querySelector('.suggest-widget .monaco-list-row.focused .label-name')?.textContent`;
    await waitFor(async () => (await suggestions.evaluate(labels)).includes('Card'), 'auto-import remains in the native widget');
    await vscode.commands.executeCommand('selectFirstSuggestion');
    for (let attempt = 0; attempt < 20 && await suggestions.evaluate(selected) !== 'Card'; attempt++) {
      await vscode.commands.executeCommand('selectNextSuggestion');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await suggestions.evaluate(selected), 'Card', 'Select the exported component in the native completion widget');
    await vscode.commands.executeCommand('acceptSelectedSuggestion');
  } finally { suggestions.close(); }
  await waitFor(() => /import\s*\{\s*Card\s*\}\s*from\s*["']\.\/Card["']/.test(document.getText())
    && /^Card\s*$/m.test(document.getText()), 'accepting the native completion inserts Card and its component import');
  const tsxUri = vscode.Uri.joinPath(folder, 'tsx-suggestions.tsx');
  const tsxDocument = await vscode.workspace.openTextDocument(tsxUri);
  const tsxEditor = await vscode.window.showTextDocument(tsxDocument);
  await waitFor(async () => {
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', tsxUri, new vscode.Position(3, 3));
    return list?.items.some(item => label(item) === 'Panel');
  }, 'native TSX component auto-import completion');
  const tsxSuggestions = await rendererConnection();
  try {
    const labels = `Array.from(document.querySelectorAll('.suggest-widget .monaco-list-row .label-name')).map(node => node.textContent)`;
    tsxEditor.selection = new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3));
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    await waitFor(async () => (await tsxSuggestions.evaluate(labels)).length > 0, 'TSX suggestion widget opens');
    assert.ok(!(await tsxSuggestions.evaluate(labels)).includes('const'), 'TSX keyword suggestions are hidden');
    tsxEditor.selection = new vscode.Selection(new vscode.Position(2, 3), new vscode.Position(2, 3));
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    await waitFor(async () => (await tsxSuggestions.evaluate(labels)).includes('localWidget'), 'own TSX variable remains');
    tsxEditor.selection = new vscode.Selection(new vscode.Position(3, 3), new vscode.Position(3, 3));
    await vscode.commands.executeCommand('editor.action.triggerSuggest');
    await waitFor(async () => (await tsxSuggestions.evaluate(labels)).includes('Panel'), 'TSX component import remains');
    const selected = `document.querySelector('.suggest-widget .monaco-list-row.focused .label-name')?.textContent`;
    await vscode.commands.executeCommand('selectFirstSuggestion');
    for (let attempt = 0; attempt < 20 && await tsxSuggestions.evaluate(selected) !== 'Panel'; attempt++) {
      await vscode.commands.executeCommand('selectNextSuggestion');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await tsxSuggestions.evaluate(selected), 'Panel');
    await vscode.commands.executeCommand('acceptSelectedSuggestion');
  } finally { tsxSuggestions.close(); }
  await waitFor(() => /import\s*\{\s*Panel\s*\}\s*from\s*["']\.\/Panel["']/.test(tsxDocument.getText())
    && /^Panel\s*$/m.test(tsxDocument.getText()), 'accepting TSX component completion inserts its import');
  await vscode.window.showTextDocument(document);
  let inlineRequests = 0;
  const provider = vscode.languages.registerInlineCompletionItemProvider('typescript', { provideInlineCompletionItems() {
    inlineRequests++;
    return [new vscode.InlineCompletionItem('UNWANTED_AI_GHOST')];
  } });
  try {
    editor.selection = new vscode.Selection(new vscode.Position(1, 3), new vscode.Position(1, 3));
    await vscode.commands.executeCommand('type', { text: 's' });
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(inlineRequests, 0, 'Automatic inline completion providers stay disabled');
    const connection = await rendererConnection();
    try {
      const ui = await connection.evaluate(`({ language: document.documentElement.lang, ghost: document.querySelectorAll('.ghost-text').length, labels: Array.from(document.querySelectorAll('[aria-label]')).map(node => node.getAttribute('aria-label')).filter(label => /Проводник|Поиск|Расширения/.test(label)).slice(0, 5) })`);
      assert.equal(ui.ghost, 0);
      if (!completionsOnly) assert.ok(ui.labels.length > 0, 'Official Russian UI strings are rendered: ' + JSON.stringify(ui));
      result.renderer = ui;
    } finally { connection.close(); }
  } finally { provider.dispose(); }
  const evidence = { passed: true, editorVersion: vscode.version,
    localeSelection: completionsOnly ? 'Not verified in this completion-focused run; language pack download is unavailable' : '--locale=ru in the isolated editor; installer argv.json is checked separately', ...result,
    checks: ['all registered built-in/TS settings applied through editor API', 'active named profile configured',
      ...(!completionsOnly ? ['Russian UI rendered after startup with selected locale'] : []),
      'keyword hidden from native widget', 'local variable shown', 'cross-component auto-import inserted',
      'TSX keyword hidden and local variable preserved', 'TSX component auto-import inserted',
      'automatic inline provider not invoked', 'no ghost text'] };
  fs.writeFileSync(process.env.MANSUR_EDITOR_RESULT, JSON.stringify(evidence, null, 2));
}

async function launchEditor() {
  const root = path.resolve(__dirname, '..');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mansur-editor-test-'));
  const extensionDir = path.join(base, 'profile/.antigravity-ide/extensions');
  const { installBundledTsMancho } = require('../lib/extensions');
  installBundledTsMancho(null, extensionDir, path.join(root, 'extensions/ts-mancho'), { isolated: true, log() {} });
  const pkg = require('../extensions/ts-mancho/package.json');
  const development = path.join(extensionDir, 'mancho.ts-mancho-' + pkg.version + '-universal');
  const userData = path.join(base, 'user-data');
  const workspace = path.join(base, 'workspace');
  fs.mkdirSync(path.join(userData, 'User'), { recursive: true });
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(userData, 'User/settings.json'), JSON.stringify({
    'editor.quickSuggestionsDelay': 987,
    'typescript.validate.enable': true, 'javascript.validate.enable': true,
    'typescript.suggestionActions.enabled': true, 'javascript.suggestionActions.enabled': true,
    'editor.cursorSmoothCaretAnimation': 'off', 'editor.cursorBlinking': 'blink', 'editor.smoothScrolling': false,
    'files.autoSave': 'off', 'files.autoSaveDelay': 2000,
    '[typescript]': { 'editor.renderValidationDecorations': 'on', 'editor.showUnused': true, 'editor.tabSize': 3 },
    'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none'
  }));
  fs.writeFileSync(path.join(workspace, 'quiet.ts'), 'const age: number = "20";\nconst unused = "unused";\n(42).to');
  fs.writeFileSync(path.join(workspace, 'completion.ts'), 'con\nconst localVariable = 1;\nloc\nCar\n');
  fs.writeFileSync(path.join(workspace, 'Card.ts'), 'export const Card = () => "component";\n');
  fs.writeFileSync(path.join(workspace, 'tsx-suggestions.tsx'), 'con\nconst localWidget = 1;\nloc\nPan\n');
  fs.writeFileSync(path.join(workspace, 'Panel.tsx'), 'export const Panel = () => null;\n');
  fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', jsx: 'preserve' }, include: ['*.ts', '*.tsx'] }));
  const env = { ...process.env, XDG_CACHE_HOME: path.join(base, 'cache'), XDG_CONFIG_HOME: path.join(base, 'config'),
    XDG_DATA_HOME: path.join(base, 'data'), MANSUR_EDITOR_RESULT: path.join(base, 'result.json'), MANSUR_DEFAULT_SETTINGS_FILE: path.join(userData, 'User/settings.json') };
  const extensions = path.join(base, 'empty-extensions');
  if (env.MANSUR_VERIFY_EDITOR_PROFILE) {
    if (!env.MANSUR_RUSSIAN_PACK) throw new Error('Set MANSUR_RUSSIAN_PACK to a compatible official language-pack source');
    const languagePack = JSON.parse(fs.readFileSync(path.join(env.MANSUR_RUSSIAN_PACK, 'package.json'), 'utf8'));
    const localeDir = path.join(extensions, languagePack.publisher.toLowerCase() + '.' + languagePack.name + '-' + languagePack.version);
    if (!env.MANSUR_RUSSIAN_VSIX) throw new Error('Set MANSUR_RUSSIAN_VSIX to the source-built official test language pack');
    const registration = spawnSync(process.env.MANSUR_VSCODE_CLI_PATH || 'code', ['--no-sandbox',
      '--user-data-dir=' + userData, '--extensions-dir=' + extensions,
      '--install-extension', env.MANSUR_RUSSIAN_VSIX, '--force'], { env, encoding: 'utf8', timeout: 30000 });
    if (registration.error || registration.status !== 0) throw new Error('Official test language-pack registration failed: ' + registration.stdout + registration.stderr);
    require('../lib/profile-settings').ensureRussianLanguagePack({ extensionsDir: extensions, userSettingsDir: path.join(userData, 'User') });
    const cache = path.join(userData, 'languagepacks.json');
    if (!fs.existsSync(cache) || !JSON.parse(fs.readFileSync(cache, 'utf8')).ru) {
      throw new Error('Official language-pack CLI did not register the ru startup cache: ' + registration.stdout);
    }
  }
  let display;
  try {
    if (process.platform === 'linux' && !env.DISPLAY) {
      let number = 200 + process.pid % 10000;
      while (fs.existsSync('/tmp/.X' + number + '-lock')) number++;
      env.DISPLAY = ':' + number;
      display = spawn(process.env.MANSUR_XVFB_PATH || 'Xvfb', [env.DISPLAY, '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-ac'], { stdio: 'ignore' });
      let displayError;
      display.on('error', error => { displayError = error; });
      await waitFor(() => {
        if (displayError) throw displayError;
        return fs.existsSync('/tmp/.X11-unix/X' + number);
      }, 'headless display', 5000);
    }
    // Browser plugin is unavailable here; inspect the isolated Electron renderer through local CDP.
    const net = require('node:net');
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    env.MANSUR_EDITOR_CDP_PORT = String(listener.address().port);
    await new Promise(resolve => listener.close(resolve));
    const args = ['--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--user-data-dir=' + userData, '--extensions-dir=' + extensions,
      '--extensionDevelopmentPath=' + development, '--extensionTestsPath=' + __filename,
      '--remote-debugging-port=' + env.MANSUR_EDITOR_CDP_PORT, '--remote-debugging-address=127.0.0.1', workspace];
    if (env.MANSUR_VERIFY_EDITOR_PROFILE || env.MANSUR_VERIFY_COMPLETIONS) {
      args.push('--profile', 'Mansur Profile Verification');
      if (env.MANSUR_VERIFY_EDITOR_PROFILE) args.push('--locale=ru');
    }
    const child = spawn(process.env.MANSUR_VSCODE_PATH || 'code', args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', bytes => { log += bytes; });
    child.stderr.on('data', bytes => { log += bytes; });
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Editor test exceeded 120 seconds')); }, 120000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); resolve(code); });
    });
    if (status !== 0 || !fs.existsSync(env.MANSUR_EDITOR_RESULT)) {
      throw new Error('Editor verification failed:\n' + log.split(/\r?\n/).slice(-25).join('\n'));
    }
    const result = JSON.parse(fs.readFileSync(env.MANSUR_EDITOR_RESULT, 'utf8'));
    assert.equal(result.passed, true);
    if (process.env.MANSUR_PROFILE_RESULT) fs.copyFileSync(env.MANSUR_EDITOR_RESULT, process.env.MANSUR_PROFILE_RESULT);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    display?.kill();
    fs.rmSync(base, { recursive: true, force: true });
  }
}

module.exports = { run };

if (require.main === module) launchEditor().catch(error => { console.error(error.message); process.exitCode = 1; });
