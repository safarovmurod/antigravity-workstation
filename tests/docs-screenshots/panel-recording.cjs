'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { pageConnection, caption } = require('./recording.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 60000 }).trim(); }
function assertFixture(directory) {
  assert.equal(process.platform, 'win32'); assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  const relative = path.relative(process.env.RUNNER_TEMP, directory);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}
function prepareFixture(directory) {
  assertFixture(directory);
  const repo = path.join(directory, 'Git guide workspace'), remote = path.join(directory, 'Git guide origin.git');
  assert.equal(fs.existsSync(repo), false); assert.equal(fs.existsSync(remote), false);
  fs.mkdirSync(repo); fs.mkdirSync(remote);
  git(remote, 'init', '--bare', '-b', 'main'); git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Disposable Guide'); git(repo, 'config', 'user.email', 'guide@example.invalid');
  git(repo, 'config', 'core.autocrlf', 'false'); git(repo, 'remote', 'add', 'origin', remote);
  fs.writeFileSync(path.join(repo, 'branch.txt'), 'main branch content\n');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'base shared content\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Disposable guide base'); git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'switch', '-c', 'demo-other');
  fs.writeFileSync(path.join(repo, 'branch.txt'), 'other branch content\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Other branch file'); git(repo, 'push', '-u', 'origin', 'demo-other');
  git(repo, 'switch', 'main'); git(repo, 'switch', '-c', 'incoming');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'incoming shared content\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Incoming shared file'); git(repo, 'push', '-u', 'origin', 'incoming');
  git(repo, 'switch', 'main');
  return { repo, remote, originalTree: git(repo, 'rev-parse', 'HEAD^{tree}'),
    remoteScope: 'Disposable local bare origin for create/switch/merge/delete; no foreign GitHub ref is mutated' };
}
async function panel(port, connect, evidenceFile) {
  const root = await pageConnection(port, connect);
  const observations = [];
  async function evaluate(expression, sessionId, contextId) {
    const result = await root.call('Runtime.evaluate', { expression, returnByValue: true,
      ...(contextId ? { contextId } : {}) }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  async function probe(sessionId, contextId) {
    try {
      const result = await evaluate('({panel:!!document.getElementById("branchName"),url:location.href,branch:document.getElementById("branchName")?.textContent})', sessionId, contextId);
      observations.push(result);
      return result?.panel ? { sessionId, contextId, url: result.url } : null;
    } catch (error) { observations.push({ error: error.message }); return null; }
  }
  let selected;
  try {
    for (let attempt = 0; attempt < 15 && !selected; attempt++) {
      const targets = (await root.call('Target.getTargets')).targetInfos;
      for (const target of targets.filter(item => item.type === 'iframe' && /vscode-webview:/.test(item.url))) {
        let sessionId;
        try {
          sessionId = (await root.call('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
          selected = await probe(sessionId);
          if (selected) break;
        } catch (error) { observations.push({ target: target.url, error: error.message }); }
        if (sessionId) await root.call('Target.detachFromTarget', { sessionId });
      }
      if (!selected) {
        const frames = [];
        const visit = node => { frames.push(node.frame); for (const child of node.childFrames || []) visit(child); };
        visit((await root.call('Page.getFrameTree')).frameTree);
        for (const frame of frames.filter(item => /vscode-webview:/.test(item.url))) {
          try {
            const { executionContextId } = await root.call('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'workstation-guide-readonly-locator' });
            selected = await probe(undefined, executionContextId); if (selected) break;
          } catch (error) { observations.push({ frame: frame.url, error: error.message }); }
        }
      }
      if (!selected) await pause(500);
    }
    if (evidenceFile) fs.writeFileSync(evidenceFile, JSON.stringify({ observations, selected }, null, 2));
    assert.ok(selected, 'Actual installed Git Branch Panel DOM could not be located; inspect native target evidence');
    const read = expression => evaluate(expression, selected.sessionId, selected.contextId);
    async function point(selector) {
      const control = await read(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); if(!element)return null; element.scrollIntoView({block:'nearest'}); const box=element.getBoundingClientRect(); return {x:box.x+box.width/2,y:box.y+box.height/2,width:box.width,height:box.height,disabled:element.disabled===true}; })()`);
      assert.ok(control?.width > 0 && control.height > 0 && !control.disabled, 'Visible enabled actual panel control: ' + selector);
      const host = new URL(selected.url).host;
      const frame = await evaluate(`(() => {const candidates=Array.from(document.querySelectorAll('iframe')).map(element=>({src:element.src,box:element.getBoundingClientRect()})).filter(item=>item.box.width>0&&item.box.height>0);const selected=candidates.find(item=>item.src.includes(${JSON.stringify(host)}))||(candidates.length===1?candidates[0]:null);return selected?{x:selected.box.x,y:selected.box.y}:null;})()`);
      assert.ok(frame, 'The live Git webview has an unambiguous visible owner frame');
      return { x: frame.x + control.x, y: frame.y + control.y };
    }
    async function click(selector, label) {
      const position = await point(selector);
      await caption(root, label, position);
      for (const type of ['mousePressed', 'mouseReleased']) await root.call('Input.dispatchMouseEvent', {
        type, x: position.x, y: position.y, button: 'left', clickCount: 1,
      });
      await pause(700);
      return { selector, position, method: 'Actual CDP mouse input to the visible installed webview control' };
    }
    async function open(content, selector, label) {
      const visible = await read(`(() => {const element=document.querySelector(${JSON.stringify(content)});return element&&getComputedStyle(element).display!=='none';})()`);
      if (!visible) await click(selector, label);
    }
    async function fill(selector, value) {
      await click(selector, 'Поле: ' + value);
      for (const type of ['keyDown', 'keyUp']) await root.call('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await root.call('Input.insertText', { text: value });
      assert.equal(await read(`document.querySelector(${JSON.stringify(selector)}).value`), value);
    }
    async function select(selector, value) {
      const found = await read(`(() => {const element=document.querySelector(${JSON.stringify(selector)});if(!element||!Array.from(element.options).some(option=>option.value===${JSON.stringify(value)}))return false;element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));return element.value;})()`);
      assert.equal(found, value, 'Actual HTML select option exists');
    }
    return { read, click, open, fill, select, root,
      async close() { if (selected.sessionId) await root.call('Target.detachFromTarget', { sessionId: selected.sessionId }); root.close(); } };
  } catch (error) { root.close(); throw error; }
}
async function dialog(port, connect, label, text) {
  const root = await pageConnection(port, connect);
  try {
    const expression = `(() => { const button=Array.from(document.querySelectorAll('.monaco-dialog-box button,.dialog-buttons-row button')).find(button=>button.innerText.trim()===${JSON.stringify(label)}); if(!button)return {visibleText:document.body.innerText.slice(-12000)};const box=button.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2,width:box.width,label:button.innerText};})()`;
    let button;
    for (let attempt = 0; attempt < 60; attempt++) {
      button = (await root.call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
      if (button?.width > 0) break; await pause(150);
    }
    assert.ok(button?.width > 0, 'Actual custom modal choice is visible: ' + JSON.stringify(button));
    await caption(root, text, button); await pause(1700);
    for (const type of ['mousePressed', 'mouseReleased']) await root.call('Input.dispatchMouseEvent', { type,
      x: button.x, y: button.y, button: 'left', clickCount: 1 });
    return button;
  } finally { root.close(); }
}
async function until(probe, message, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await probe()) return; await pause(150); }
  throw new Error('Git recording timed out: ' + message);
}
async function perform(action, fixture, port, connect, recording, output, stage) {
  assertFixture(fixture.repo);
  const evidence = { action, beforeBranch: git(fixture.repo, 'branch', '--show-current') };
  const absent = (cwd, ref) => { try { git(cwd, 'rev-parse', '--verify', ref); return false; } catch { return true; } };
  if (action === 'prepare-conflict') {
    assert.equal(git(fixture.repo, 'remote', 'get-url', 'origin'), fixture.remote);
    fs.writeFileSync(path.join(fixture.repo, 'shared.txt'), 'local current shared content\n');
    git(fixture.repo, 'add', 'shared.txt'); git(fixture.repo, 'commit', '-m', 'Keep local work before receive');
    const other = path.join(path.dirname(fixture.repo), 'Incoming writer fixture'); assertFixture(other);
    git(path.dirname(fixture.repo), 'clone', '--branch', 'incoming', fixture.remote, other);
    git(other, 'config', 'user.name', 'Incoming Guide'); git(other, 'config', 'user.email', 'incoming@example.invalid');
    fs.writeFileSync(path.join(other, 'shared.txt'), 'fresh incoming shared content\n');
    git(other, 'add', '.'); git(other, 'commit', '-m', 'Fresh incoming change'); git(other, 'push', 'origin', 'incoming');
    evidence.originBeforeFetch = git(fixture.repo, 'rev-parse', 'refs/remotes/origin/incoming');
    evidence.originFresh = git(fixture.remote, 'rev-parse', 'refs/heads/incoming');
    assert.notEqual(evidence.originBeforeFetch, evidence.originFresh);
  } else if (action === 'prepare-pr') {
    assert.equal(git(fixture.repo, 'status', '--porcelain'), '');
    assert.equal(git(fixture.repo, 'remote', 'get-url', 'origin'), fixture.remote);
    for (const name of ['main', 'demo-other', 'incoming']) {
      const ref = 'refs/remotes/origin/' + name;
      if (!absent(fixture.repo, ref)) git(fixture.repo, 'update-ref', '-d', ref, git(fixture.repo, 'rev-parse', ref));
    }
    git(fixture.repo, 'remote', 'set-url', 'origin', 'https://github.com/safarovmurod/antigravity-workstation.git');
    const head = 'codex/corrective-audit-20261025';
    git(fixture.repo, 'fetch', '--depth=1', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/' + head + ':refs/remotes/origin/' + head);
    git(fixture.repo, 'switch', '--no-track', '-c', head, 'refs/remotes/origin/' + head);
    fixture.prUrl = 'https://github.com/safarovmurod/antigravity-workstation/compare/main...' + encodeURIComponent(head) + '?expand=1';
    evidence.remoteScope = 'Public GitHub origin, fetch/ls-remote/compare only; no push, PR creation, merge or branch deletion';
  } else if (action === 'show-pr-page') {
    assert.equal(new URL(fixture.prUrl).hostname, 'github.com');
    const candidates = [path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')];
    const binary = candidates.find(file => fs.existsSync(file)); assert.ok(binary, 'An actual installed browser must be available');
    fixture.browserPort = 9342;
    const browserProfile = path.join(path.dirname(fixture.repo), 'Readonly GitHub browser'); assertFixture(browserProfile);
    fixture.browser = spawn(binary, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + fixture.browserPort, '--user-data-dir=' + browserProfile, fixture.prUrl],
    { windowsHide: true, stdio: 'ignore' });
    let browserError; fixture.browser.on('error', error => { browserError = error; });
    let destination;
    await until(async () => {
      if (browserError) throw browserError;
      try {
        const pages = await (await fetch('http://127.0.0.1:' + fixture.browserPort + '/json/list')).json();
        const page = pages.find(item => item.type === 'page' && item.url.startsWith('https://github.com/safarovmurod/antigravity-workstation/compare/'));
        if (!page) return false;
        const browser = await connect(page.webSocketDebuggerUrl);
        try {
          const body = (await browser.call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result.value;
          if (!/Comparing changes|Compare changes|Files changed/i.test(body)) return false;
          destination = { url: page.url, title: page.title, visibleText: body.slice(0, 16000) };
          return true;
        } finally { browser.close(); }
      } catch (error) { if (browserError) throw browserError; return false; }
    }, 'actual public GitHub compare head/base/diff loads', 90000);
    assert.ok(recording, 'PR destination belongs in the real live recording');
    await recording.switchTo(fixture.browserPort, 'Настоящий GitHub compare: head/base и diff. Пока это сравнение, не merge и не созданный PR.');
    evidence.destination = destination;
    await pause(3000);
  } else {
    const p = await panel(port, connect, path.join(output, stage + '-targets.json'));
    try {
      if (action === 'view-current') {
        const before = git(fixture.repo, 'rev-parse', 'HEAD^{tree}');
        await p.click('#blockCurrent .block-header', 'Текущая ветка: только просмотр');
        await p.click('#blockCurrent .block-header', 'Снова открываем тот же блок');
        assert.equal(git(fixture.repo, 'rev-parse', 'HEAD^{tree}'), before);
        assert.equal(git(fixture.repo, 'branch', '--show-current'), 'main'); evidence.unchangedTree = before;
      } else if (action === 'create') {
        await p.open('#contentNewBranch', '#blockNewBranch .block-header', 'Новая ветка');
        await p.select('#newBranchBase', 'main'); await p.fill('#newBranchInput', 'demo-new');
        evidence.click = await p.click('#newBranchBtn', 'Create & push: demo-new из main');
        await until(() => !absent(fixture.remote, 'refs/heads/demo-new'), 'new branch really pushed to origin');
        assert.equal(git(fixture.repo, 'branch', '--show-current'), 'demo-new');
        evidence.local = git(fixture.repo, 'rev-parse', 'refs/heads/demo-new');
        evidence.origin = git(fixture.remote, 'rev-parse', 'refs/heads/demo-new'); assert.equal(evidence.local, evidence.origin);
      } else if (action.startsWith('switch-')) {
        await p.open('#contentMyBranch', '#blockMyBranch .block-header', 'Переключить ветку');
        await p.select('#branchSelect', 'demo-other');
        if (action === 'switch-clean') {
          await until(() => git(fixture.repo, 'branch', '--show-current') === 'demo-other', 'clean switch');
          assert.equal(fs.readFileSync(path.join(fixture.repo, 'branch.txt'), 'utf8'), 'other branch content\n');
        } else {
          const pattern = action === 'switch-unsaved' ? /несохранённые редакторы/ : /конфликтуют/;
          await until(async () => pattern.test(await p.read('document.getElementById("statusBar").textContent')), action + ' actual protected error');
          assert.equal(git(fixture.repo, 'branch', '--show-current'), 'demo-new');
        }
      } else if (action === 'receive') {
        await p.open('#contentPull', '#blockPull .block-header', 'Получить изменения');
        await p.select('#pullSource', 'incoming');
        evidence.before = git(fixture.repo, 'rev-parse', 'HEAD');
        await p.click('#pullBtn', 'Fetch origin/incoming → merge в demo-other');
        await until(() => fs.existsSync(path.join(fixture.repo, '.git/MERGE_HEAD')), 'real merge conflict state');
        assert.equal(git(fixture.repo, 'diff', '--name-only', '--diff-filter=U'), 'shared.txt');
        assert.equal(git(fixture.repo, 'rev-parse', 'refs/remotes/origin/incoming'), git(fixture.remote, 'rev-parse', 'refs/heads/incoming'));
      } else if (action === 'resolve') {
        await p.select('#conflictList select[data-conflict="shared.txt"]', 'ours');
        await p.click('#conflictPanel button[onclick="resolveConflicts()"]', 'Сохранить выбор: оставить текущую версию файла');
        await until(() => !fs.existsSync(path.join(fixture.repo, '.git/MERGE_HEAD')), 'actual conflict resolved');
        assert.equal(fs.readFileSync(path.join(fixture.repo, 'shared.txt'), 'utf8'), 'local current shared content\n');
        assert.notEqual(git(fixture.repo, 'rev-parse', 'HEAD'), git(fixture.remote, 'rev-parse', 'refs/heads/demo-other'));
      } else if (action.startsWith('delete-')) {
        await p.open('#contentDeleteBranch', '#blockDeleteBranch .block-header', 'Удалить ветку');
        const name = action === 'delete-merged' ? 'demo-new' : 'demo-other';
        const selected = await p.read('Array.from(document.querySelectorAll("#deleteChecklist input:checked")).map(element=>element.dataset.branch)');
        for (const old of selected.filter(branch => branch !== name)) await p.click('#deleteChecklist input[data-branch="' + old + '"]', 'Снять предыдущий выбор');
        const checked = await p.read('document.querySelector(' + JSON.stringify('#deleteChecklist input[data-branch="' + name + '"]') + ')?.checked');
        if (!checked) await p.click('#deleteChecklist input[data-branch="' + name + '"]', 'Выбираем только ' + name);
        await p.click('#deleteBtn', 'Удалить выбранную ветку: scope ещё нужно подтвердить');
        const choice = action === 'delete-unmerged' ? 'Удалить' : action === 'delete-unsaved' ? 'Force local' : 'Удалить local + origin';
        evidence.dialog = await dialog(port, connect, choice, 'Явный scope: ' + choice + '. Смотри реальные unmerged/unpublished counts.');
        if (action === 'delete-merged') {
          evidence.remoteDialog = await dialog(port, connect, choice, 'Второе подтверждение: свежие origin ref/SHA и число неслитых commits.');
          await until(() => absent(fixture.repo, 'refs/heads/demo-new') && absent(fixture.remote, 'refs/heads/demo-new'), 'both selected refs are really gone');
        } else {
          const pattern = action === 'delete-unmerged' ? /unmerged commits/ : /Сохрани/;
          await until(async () => pattern.test(await p.read('document.getElementById("statusBar").textContent')), 'actual deletion protection message');
          assert.ok(!absent(fixture.repo, 'refs/heads/demo-other') && !absent(fixture.remote, 'refs/heads/demo-other'));
        }
        assert.ok(!absent(fixture.repo, 'refs/heads/main') && !absent(fixture.remote, 'refs/heads/main'));
      } else if (action === 'open-pr') {
        await p.open('#contentPr', '#blockPr .block-header', 'Pull Request — предложение объединить код');
        await p.select('#prTarget', 'main');
        await p.click('#prBtn', 'Открыть официальный GitHub compare');
        await until(async () => /official GitHub|официальная|официальн/.test(await p.read('document.getElementById("statusBar").textContent')), 'actual IDE accepts opening the GitHub destination');
      } else throw new Error('Unknown bounded guide action: ' + action);
      evidence.visiblePanelText = await p.read('document.body.innerText');
    } finally { await p.close(); }
  }
  evidence.afterBranch = git(fixture.repo, 'branch', '--show-current');
  evidence.afterHead = git(fixture.repo, 'rev-parse', 'HEAD');
  return evidence;
}
module.exports = { prepareFixture, assertFixture, panel, dialog, git, perform };
