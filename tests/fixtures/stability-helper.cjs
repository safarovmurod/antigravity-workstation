const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'stability-helper-test-'));
process.on('exit', () => fs.rmSync(storage, { recursive: true, force: true }));
const extensionPath = path.resolve(__dirname, '../../extensions/workstation-stability');
const checks = [];
const processes = [];
const executed = [];
let warningCount = 0;
const known = { mode: 'repair', changed: false, reviewRequired: false, targets: [{ id: 'anteprimorac.html-end-tag-labels', status: 'protected' }] };
const notices = {};
function load(tabs = []) {
  const registered = new Map();
  const context = { extensionPath, globalStorageUri: { fsPath: storage }, subscriptions: [], globalState: {
    get(key, fallback) { return notices[key] ?? fallback; },
    async update(key, value) { notices[key] = value; },
  } };
  const vscode = {
    window: {
      tabGroups: { all: [{tabs}], async close(closing, preserveFocus) {
        assert.equal(preserveFocus, true);
        executed.push({closeLabels: closing.map(tab=>tab.label)});
        return true;
      } },
      createOutputChannel() { return { appendLine() {}, show() {}, dispose() {} }; },
      async showWarningMessage() { warningCount++; },
      async showInformationMessage() { throw new Error('No file should be repaired in this integration fixture'); },
    },
    extensions: { getExtension() { return { extensionPath }; }, onDidChange() { return { dispose() {} }; } },
    commands: {
      registerCommand(name, callback) { registered.set(name, callback); return { dispose() {} }; },
      async executeCommand(command) { executed.push(command); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(extensionPath, 'extension.js'), 'utf8'), {
    module, process, setTimeout, clearTimeout,
    require(name) {
      if (name === 'vscode') return vscode;
      if (name === 'node:os') return { ...require('node:os'), homedir: () => storage };
      if (name === './profile.cjs') return { watchEditorProfile(_vscode, ctx) { ctx.subscriptions.push(vscode.commands.registerCommand('workstationStability.applySettings', async () => ({}))); } };
      if (name === './repair-chat.cjs') return require(path.join(extensionPath, 'repair-chat.cjs'));
      if (name === './questions.cjs') return require(path.join(extensionPath, 'questions.cjs'));
      if (name === 'node:child_process') return { execFile(executable, args, options, callback) {
        const child = { executable, args, options, callback, killed: false, kill() { this.killed = true; } };
        processes.push(child);
        return child;
      } };
      return require(name);
    },
  });
  module.exports.activate(context);
  return { context, registered, dispose() { for (const item of context.subscriptions) item.dispose(); } };
}
function pass(name) { checks.push({ name, result: 'PASS' }); }
async function finish(child, result) {
  child.callback(null, JSON.stringify(result));
  await new Promise(resolve => setImmediate(resolve));
}
(async () => {
  const first = load();
  const second = load();
  assert.equal(first.registered.size, 6); pass('Six global commands registered');
  const repair = first.registered.get('workstationStability.repair')();
  assert.equal(processes.length, 1);
  assert.ok(fs.existsSync(path.join(storage, 'maintenance.lock'))); pass('Repair holds an exclusive global lock');
  const competing = await second.registered.get('workstationStability.repair')();
  assert.equal(competing.skipped, 'another_window_is_checking');
  assert.equal(processes.length, 1); pass('Second editor window cannot start concurrent repair');
  await finish(processes[0], known);
  await repair;
  assert.equal(fs.existsSync(path.join(storage, 'maintenance.lock')), false); pass('Completion releases the owned global lock');
  assert.ok(processes[0].args.includes('--repair'));
  assert.equal(processes[0].options.timeout, 6000);
  assert.equal(processes[0].options.windowsHide, true); pass('Repair subprocess is bounded and hidden');
  assert.deepEqual(executed, []); pass('Maintenance does not automatically reload the editor');
  await first.registered.get('workstationStability.reconnectMcp')();
  assert.deepEqual(executed, ['antigravity.killLanguageServerAndReloadWindow']); pass('Manual MCP command forwards the verified native recovery command');
  const recovery = load([{label:'Manage MCPs',isDirty:false},{label:'Manage MCPs',isDirty:true},{label:'App.tsx',isDirty:false}]);
  executed.length = 0;
  await recovery.registered.get('workstationStability.reconnectMcp')();
  assert.equal(executed.length,2);
  assert.deepEqual(executed[0],{closeLabels:['Manage MCPs']});
  assert.equal(executed[1],'antigravity.killLanguageServerAndReloadWindow');
  pass('Recovery closes the clean MCP status view before native reload');
  assert.equal(executed[0].closeLabels.length,1);
  pass('Recovery preserves dirty tabs and unrelated project tabs');
  recovery.dispose();
  const unknown = { mode: 'status', changed: false, reviewRequired: true, targets: [{ id: 'anteprimorac.html-end-tag-labels', status: 'needs_review', version: '9.0.0' }] };
  let pending = first.registered.get('workstationStability.status')();
  await finish(processes[1], unknown); await pending;
  pending = first.registered.get('workstationStability.status')();
  await finish(processes[2], unknown); await pending;
  assert.equal(warningCount, 1); pass('The same unknown vendor release is reported once');
  assert.equal(processes[1].args.includes('--repair'), false); pass('Status command does not enable repair');
  const active = first.registered.get('workstationStability.repair')();
  first.dispose(); second.dispose();
  assert.equal(processes[3].killed, true);
  assert.equal(fs.existsSync(path.join(storage, 'maintenance.lock')), false); pass('Disposal stops only the owned subprocess and releases its lock');
  await finish(processes[3], known); await active;
  console.log(JSON.stringify({ passed: checks.length, checks }));
})().catch(error => { console.error(error); process.exitCode = 1; });
