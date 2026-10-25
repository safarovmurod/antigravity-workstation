'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function activate() {
  const directory = process.env.WORKSTATION_GALLERY_SIGNALS;
  const phase = process.env.WORKSTATION_GALLERY_PHASE;
  if (!directory || !['initial', 'restart'].includes(phase)) return;
  const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2));
  try {
    const commands = await vscode.commands.getCommands(true);
    write(phase + '-chat-capabilities.json', {
      hostVersion: vscode.version, application: vscode.env.appName,
      nativeSendCommandRegistered: commands.includes('antigravity.sendPromptToAgentPanel'),
      chatParticipantApi: typeof vscode.chat?.createChatParticipant,
      candidateCommands: commands.filter(name => /^antigravity\./.test(name) && /question|form|prompt|agentpanel/i.test(name)),
      liveSend: 'NOT TESTED: no authenticated disposable Gemini task/chat is available to this fixture',
      inlineQuestionnaire: 'NOT TESTED: command discovery does not prove an inline form or current-chat Submit API',
    });
    const lens = vscode.extensions.getExtension('usernamehw.errorlens');
    assert.ok(lens, 'Actual installed Error Lens is discoverable');
    const helper = vscode.extensions.getExtension('workstation.stability-helper');
    assert.ok(helper, 'Actual installed Workstation helper is discoverable');
    await helper.activate();
    if (phase === 'initial') assert.equal(lens.packageJSON.version, '3.29.0');
    const statusFile = process.env.WORKSTATION_GALLERY_STATUS;
    const deadline = Date.now() + 18 * 60 * 1000;
    let status;
    while (Date.now() < deadline) {
      if (fs.existsSync(statusFile)) {
        status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        if (['failed', 'checked'].includes(status.state)) break;
      }
      await wait(500);
    }
    assert.equal(status?.state, 'checked', JSON.stringify(status));
    const update = status.updated.find(item => item.id === 'usernamehw.errorlens');
    assert.equal(update?.from, '3.29.0');
    assert.notEqual(update.to, update.from);
    if (phase === 'restart') {
      assert.equal(lens.packageJSON.version, update.to, 'New actual extension version survives normal restart');
      const before = status.attemptedAt;
      await wait(65000);
      assert.equal(JSON.parse(fs.readFileSync(statusFile, 'utf8')).attemptedAt, before,
        'Startup does not repeat a recently completed daily update');
    }
    write(phase + '-ready.json', { passed: true, phase, version: lens.packageJSON.version, status });
    while (!fs.existsSync(path.join(directory, phase + '-quit'))) await wait(200);
  } catch (error) {
    write(phase + '-fatal.json', { passed: false, error: error.stack });
  }
  await vscode.commands.executeCommand('workbench.action.quit');
}
module.exports = { activate };
