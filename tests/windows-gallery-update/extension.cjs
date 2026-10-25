'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(probe, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await probe()) return; await wait(100); }
  throw new Error('Timed out: ' + message);
}
async function activate() {
  const directory = process.env.WORKSTATION_GALLERY_SIGNALS;
  const phase = process.env.WORKSTATION_GALLERY_PHASE;
  if (!directory || !['initial', 'restart', 'profile-update', 'multi-root'].includes(phase)) return;
  const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2));
  try {
    assert.equal(process.platform, 'win32');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
    const relative = path.relative(process.env.RUNNER_TEMP, directory);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    const commands = await vscode.commands.getCommands(true);
    write(phase + '-chat-capabilities.json', {
      hostVersion: vscode.version, application: vscode.env.appName,
      nativeSendCommandRegistered: commands.includes('antigravity.sendPromptToAgentPanel'),
      chatParticipantApi: typeof vscode.chat?.createChatParticipant,
      candidateCommands: commands.filter(name => /^antigravity\./.test(name) && /question|form|prompt|agentpanel/i.test(name)),
      liveSend: 'NOT TESTED: no authenticated disposable Gemini task/chat is available to this fixture',
      inlineQuestionnaire: 'NOT TESTED: command discovery does not prove an inline form or current-chat Submit API',
    });
    const probeFile = path.join(directory, 'native-chat-command-probe.json');
    if (phase === 'initial' && !fs.existsSync(probeFile)) {
      const product = JSON.parse(fs.readFileSync(path.join(vscode.env.appRoot, 'product.json'), 'utf8'));
      const probe = { ideVersion: product.ideVersion, vscodeEngine: vscode.version,
        command: 'antigravity.sendPromptToAgentPanel', registered: commands.includes('antigravity.sendPromptToAgentPanel'),
        state: 'not-invoked', liveModelReply: 'NOT TESTED', currentChatScope: 'NOT TESTED: no chat identity/receipt API verified',
        inlineForm: 'NOT TESTED: standard extension API discovery does not establish inline Gemini form support' };
      if (probe.registered && product.ideVersion === '2.5.5') {
        probe.state = 'dispatching'; write(path.basename(probeFile), probe);
        let timer;
        try {
          const outcome = await Promise.race([
            Promise.resolve(vscode.commands.executeCommand(probe.command,
              'Disposable Workstation API capability probe. Do not edit files, run tools, or change settings. If a model is available, reply only WORKSTATION_PROBE_OK.'))
              .then(value => ({ state: 'command-returned-without-verified-chat-receipt', returnType: typeof value })),
            new Promise(resolve => { timer = setTimeout(() => resolve({ state: 'uncertain-timeout-no-retry' }), 15000); }),
          ]);
          Object.assign(probe, outcome);
        } catch (error) {
          probe.state = 'native-command-failed';
          probe.error = require('../../extensions/workstation-stability/repair-chat.cjs').redact(error.message, 2000);
        } finally { clearTimeout(timer); }
      }
      write(path.basename(probeFile), probe);
    }
    const lens = vscode.extensions.getExtension('usernamehw.errorlens');
    assert.ok(lens, 'Actual installed Error Lens is discoverable');
    const helper = vscode.extensions.getExtension('workstation.stability-helper');
    assert.ok(helper, 'Actual installed Workstation helper is discoverable');
    await helper.activate();
    if (phase === 'initial') assert.equal(lens.packageJSON.version, '3.29.0');
    const personalFile = path.join(directory, 'personal-theme.json');
    if (phase === 'initial') {
      await until(() => vscode.workspace.getConfiguration().inspect('workbench.colorTheme')?.globalValue === 'One Dark Pro', 'actual installed helper applies the initial managed theme');
      const themes = vscode.extensions.all.flatMap(extension => extension.packageJSON.contributes?.themes || []);
      const light = themes.find(theme => /Light\+/.test(theme.id || ''));
      assert.ok(light, 'Actual installed Light+ theme is contributed');
      const config = vscode.workspace.getConfiguration();
      await config.update('workbench.colorTheme', 'One Dark Pro', vscode.ConfigurationTarget.Global);
      const rule = { scope: 'comment.personal.fixture', settings: { foreground: '#123456' } };
      const tokens = { ...config.inspect('editor.tokenColorCustomizations')?.globalValue,
        '[Light+]': { comments: '#234567', textMateRules: [rule] },
        ['[' + light.id + ']']: { comments: '#345678', textMateRules: [rule] }, textMateRules: [rule] };
      await config.update('editor.tokenColorCustomizations', tokens, vscode.ConfigurationTarget.Global);
      await config.update('workbench.colorTheme', light.id, vscode.ConfigurationTarget.Global);
      write('personal-theme.json', { theme: light.id, rule, lightTokens: tokens['[' + light.id + ']'], arbitraryLightBlock: tokens['[Light+]'] });
    }
    const personal = JSON.parse(fs.readFileSync(personalFile, 'utf8'));
    await until(() => vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light, 'actual rendered editor changes to Light+');
    const verifyTheme = () => {
      const config = vscode.workspace.getConfiguration();
      assert.equal(config.inspect('workbench.colorTheme').globalValue, personal.theme);
      const tokens = config.inspect('editor.tokenColorCustomizations').globalValue;
      assert.deepEqual(tokens['[Light+]'], personal.arbitraryLightBlock);
      assert.deepEqual(tokens['[' + personal.theme + ']'], personal.lightTokens);
      assert.ok(tokens.textMateRules.some(rule => JSON.stringify(rule) === JSON.stringify(personal.rule)));
    };
    await wait(1500); verifyTheme();
    if (phase === 'multi-root') assert.equal(vscode.workspace.workspaceFolders.length, 2);
    const statusFile = process.env.WORKSTATION_GALLERY_STATUS;
    const expectedRequest = JSON.parse(fs.readFileSync(path.join(path.dirname(statusFile), 'editor-profile.json'), 'utf8')).requestId;
    const deadline = Date.now() + 18 * 60 * 1000;
    let status;
    while (Date.now() < deadline) {
      if (fs.existsSync(statusFile)) {
        status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        if (status.requestId === expectedRequest && ['failed', 'checked'].includes(status.state)) break;
      }
      await wait(500);
    }
    assert.equal(status?.state, 'checked', JSON.stringify(status));
    assert.equal(status.requestId, expectedRequest);
    let update = status.updated.find(item => item.id === 'usernamehw.errorlens');
    if (['initial', 'restart'].includes(phase)) {
      assert.equal(update?.from, '3.29.0'); assert.notEqual(update.to, update.from);
    } else {
      update = JSON.parse(fs.readFileSync(path.join(directory, 'initial-ready.json'), 'utf8')).status.updated[0];
      assert.deepEqual(status.updated, [], 'A new setup-profile request checks metadata without reinstalling the current package');
    }
    if (phase === 'restart' || phase === 'multi-root') {
      assert.equal(lens.packageJSON.version, update.to, 'New actual extension version survives normal restart');
      const before = status.attemptedAt;
      await wait(65000);
      assert.equal(JSON.parse(fs.readFileSync(statusFile, 'utf8')).attemptedAt, before,
        'Startup does not repeat a recently completed daily update');
    }
    if (phase !== 'initial') assert.equal(lens.packageJSON.version, update.to);
    verifyTheme();
    write(phase + '-ready.json', { passed: true, phase, version: lens.packageJSON.version, status,
      personalTheme: personal.theme, renderedThemeKind: vscode.window.activeColorTheme.kind,
      themeTokensPreserved: true, workspaceFolderCount: vscode.workspace.workspaceFolders.length });
    while (!fs.existsSync(path.join(directory, phase + '-quit'))) await wait(200);
  } catch (error) {
    write(phase + '-fatal.json', { passed: false, error: error.stack });
  }
  await vscode.commands.executeCommand('workbench.action.quit');
}
module.exports = { activate };
