'use strict';

// Runs in the actual IDE test host against its installed TypeScript provider.
const assert = require('node:assert/strict');
const fs = require('node:fs');

function writeFixture(workspace) {
    const path = require('node:path');
    fs.writeFileSync(path.join(workspace, 'library-import.ts'), 'export {};\nconst state = useSta\n');
    fs.writeFileSync(path.join(workspace, 'format-nested.ts'), 'export function nested(){return {answer:42}}\n');
    const git = (...args) => require('node:child_process').execFileSync('git', args, { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    const remote = path.join(path.dirname(workspace), 'owned-git-remote.git');
    git('init', '--bare', '--initial-branch=main', remote);
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Workstation Test');
    git('config', 'user.email', 'fixture@example.test');
    git('remote', 'add', 'origin', remote);
    fs.writeFileSync(path.join(workspace, '.gitignore'), 'node_modules/\n');
    fs.writeFileSync(path.join(workspace, 'git-smoke.txt'), 'Owned local Git fixture.\n');
    git('add', '--', 'git-smoke.txt');
    git('-c', 'core.hooksPath=', 'commit', '-m', 'Create isolated Git fixture');
}

function stageGitPanel(repo, extensionsDir) {
    const path = require('node:path');
    const source = path.join(repo, 'extensions/git-branch-panel');
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    const id = manifest.publisher + '.' + manifest.name;
    const location = id + '-' + manifest.version;
    require(path.join(repo, 'lib/extensions')).installCustomGithubPanel(null, extensionsDir, source, { isolated: true, log() {} });
    const indexFile = path.join(extensionsDir, 'extensions.json');
    const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile)) : [];
    fs.writeFileSync(indexFile, JSON.stringify([...index.filter(item => item.identifier?.id !== id), {
        identifier: { id }, version: manifest.version, relativeLocation: location,
        location: { $mid: 1, scheme: 'file', path: path.join(extensionsDir, location).replace(/\\/g, '/') },
    }]));
}

async function verifyLibraryImport(vscode, folder, until) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'library-import.ts'));
    const editor = await vscode.window.showTextDocument(document);
    const original = 'export {};\nconst state = useSta\n';
    await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), original));
    const position = new vscode.Position(1, 20);
    let selected;
    await until(async () => {
        const completions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position);
        selected = completions?.items.find(item => {
            const label = typeof item.label === 'string' ? item.label : item.label.label;
            const source = typeof item.label === 'object' ? item.label.description : item.detail;
            return label === 'useState' && /\breact\b/.test(source || '');
        });
        return Boolean(selected);
    }, 'installed React types offer useState with the source library shown');
    assert.ok(selected.command, 'Native completion supplies its import-acceptance action');
    // The editor first inserts the selected symbol, then runs its completion command.
    await editor.edit(edit => edit.replace(new vscode.Range(1, 14, 1, 20), 'useState'));
    await vscode.commands.executeCommand(selected.command.command, ...(selected.command.arguments || []));
    await until(() => /import\s*\{\s*useState\s*\}\s*from\s*["']react["']/.test(document.getText()),
        'accepting the native library suggestion inserts the React import');
    assert.match(document.getText(), /const state = useState/);
    return 'installed npm library symbol shows its source and accepting it inserts the matching import';
}

async function verifyFormatAndSave(vscode, folder, until) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'format-nested.ts'));
    const editor = await vscode.window.showTextDocument(document);
    const original = 'export function nested(){return {answer:42}}\n';
    await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), original));
    await vscode.commands.executeCommand('editor.action.formatDocument');
    assert.match(document.getText(), /^ {2}return \{ answer: 42 \}/m, 'Prettier and the editor use two-space indentation');
    assert.equal(editor.options.tabSize, 2);
    assert.equal(editor.options.insertSpaces, true);
    assert.equal(vscode.workspace.getConfiguration('prettier', document).get('useEditorConfig'), true);
    assert.equal(vscode.workspace.getConfiguration('files', document).get('autoSave'), 'afterDelay');
    assert.equal(vscode.workspace.getConfiguration('files', document).get('autoSaveDelay'), 1000);
    await until(() => !document.isDirty && fs.readFileSync(document.uri.fsPath, 'utf8') === document.getText(),
        'actual editor saves the formatted edit after the typing pause');
    return 'Prettier formats nested code with two spaces and Auto Save writes the actual file';
}

async function verifyGitPanel(vscode, folder, until) {
    const git = vscode.extensions.getExtension('vscode.git');
    await git.activate();
    const api = git.exports.getAPI(1);
    let repository;
    await until(async () => {
        repository = api.getRepository(folder) || await api.openRepository(folder);
        return Boolean(repository);
    }, 'built-in Git detects the owned fixture repository');
    const extension = vscode.extensions.getExtension('workstation.git-branch-panel');
    assert.ok(extension, 'IDE discovers the installed Git Branch Panel');
    await extension.activate();
    const panel = require(require('node:path').join(extension.extensionPath, 'extension.js'));
    const calls = { fetch: 0, push: 0 };
    // The real API returns a fresh wrapper for each getRepository() call.
    // Observe its shared methods while forwarding every invocation unchanged.
    const prototype = Object.getPrototypeOf(repository);
    const fetchOriginal = prototype.fetch;
    const pushOriginal = prototype.push;
    prototype.fetch = async function (...args) { calls.fetch++; return fetchOriginal.apply(this, args); };
    prototype.push = async function (...args) { calls.push++; return pushOriginal.apply(this, args); };
    try {
        await panel.gitExec(['fetch', 'origin', '--prune'], folder.fsPath);
        await panel.gitExec(['push', '-u', 'origin', 'main:main'], folder.fsPath);
        assert.ok(calls.fetch > 0, 'Panel fetch uses the actual editor Git API');
        assert.ok(calls.push > 0, 'Panel push uses the actual editor Git API');
        const local = await panel.gitExec(['rev-parse', 'HEAD'], folder.fsPath);
        const remote = await panel.gitExec(['ls-remote', 'origin', 'refs/heads/main'], folder.fsPath);
        assert.equal(remote.split(/\s/)[0], local, 'The owned bare remote contains the actual pushed commit');
    } finally {
        prototype.fetch = fetchOriginal;
        prototype.push = pushOriginal;
    }
    return 'Git Branch Panel activates and fetch/push reuse the actual built-in Git API';
}

module.exports = { writeFixture, stageGitPanel, verifyLibraryImport, verifyFormatAndSave, verifyGitPanel };
