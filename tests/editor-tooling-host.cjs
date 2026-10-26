'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

function writeFixture(workspace) {
    const path = require('node:path');
    fs.writeFileSync(path.join(workspace, 'library-import.ts'), 'export {};\nconst state = useSta\n');
    fs.writeFileSync(path.join(workspace, 'format-nested.ts'), 'export function nested(){return {answer:42}}\n');
    for (const name of ['SnippetFunction.jsx', 'SnippetArrow.tsx', 'emmet.html', 'EmmetComponent.tsx']) {
        fs.writeFileSync(path.join(workspace, name), '');
    }
    fs.writeFileSync(path.join(workspace, 'visible-type-error.ts'), 'export const age: number = "wrong";\n');
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
    assert.match(document.getText(), /^ {3}return \{ answer: 42 \}/m, 'Prettier and the editor use three-space indentation');
    assert.equal(editor.options.tabSize, 3);
    assert.equal(editor.options.insertSpaces, true);
    assert.equal(vscode.workspace.getConfiguration('prettier', document).get('useEditorConfig'), true);
    assert.equal(vscode.workspace.getConfiguration('files', document).get('autoSave'), 'afterDelay');
    assert.equal(vscode.workspace.getConfiguration('files', document).get('autoSaveDelay'), 1000);
    await until(() => !document.isDirty && fs.readFileSync(document.uri.fsPath, 'utf8') === document.getText(),
        'actual editor saves the formatted edit after the typing pause');
    return 'Prettier formats nested code with three spaces and Auto Save writes the actual file';
}

async function verifySnippetsAndEmmet(vscode, folder, until, keyboard = {}) {
    const snippets = vscode.extensions.getExtension('dsznajder.es7-react-js-snippets');
    assert.ok(snippets, 'The actual installed React snippet extension is present');
    await snippets.activate();
    for (const [name, prefix, generated] of [
        ['SnippetFunction.jsx', 'rfc', /export default function SnippetFunction\s*\(/],
        ['SnippetArrow.tsx', 'rafce', /(?:const|function) SnippetArrow\b/],
    ]) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, name));
        const editor = await vscode.window.showTextDocument(document);
        await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), ''));
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await vscode.commands.executeCommand('default:type', { text: prefix });
        await vscode.commands.executeCommand('editor.action.triggerSuggest');
        await until(async () => {
            if (keyboard.acceptSuggestion) await keyboard.acceptSuggestion();
            else await vscode.commands.executeCommand('acceptSelectedSuggestion');
            return generated.test(document.getText());
        }, prefix + ' expands from the real editor suggestion menu in ' + name);
        assert.match(document.getText(), /import React from ["']react["']/);
        assert.match(document.getText(), /<div>/);
        if (prefix === 'rafce') assert.match(document.getText(), /export default SnippetArrow/);
        await vscode.commands.executeCommand('leaveSnippet');
        await vscode.commands.executeCommand('hideSuggestWidget');
    }
    for (const [name, initial, line, character] of [
        ['emmet.html', 'div', 0, 3],
        ['EmmetComponent.tsx', 'export default function EmmetComponent() {\n   return (\n      div\n   )\n}\n', 2, 9],
    ]) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, name));
        const editor = await vscode.window.showTextDocument(document);
        await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), initial));
        editor.selection = new vscode.Selection(line, character, line, character);
        if (keyboard.expandEmmet) await keyboard.expandEmmet();
        else await vscode.commands.executeCommand('editor.emmet.action.expandAbbreviation');
        await until(() => /<div>[\s\S]*<\/div>/.test(document.getText()), 'Emmet expands div in ' + name);
        assert.match(document.getText(), /<div>[\s\S]*<\/div>/, 'The native Emmet Tab action expands div in ' + name);
        await vscode.commands.executeCommand('leaveSnippet');
    }
    return 'React rfc/rafce accepted from the real suggestion menu; native Emmet expands div in HTML and TSX';
}

async function verifyTypeDiagnostics(vscode, folder, until) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'visible-type-error.ts'));
    await vscode.window.showTextDocument(document);
    const settings = vscode.workspace.getConfiguration(undefined, document);
    assert.equal(settings.get('typescript.validate.enable'), true);
    assert.equal(settings.get('problems.visibility'), true);
    await until(() => vscode.languages.getDiagnostics(document.uri).some(item => item.code === 2322
        && item.severity === vscode.DiagnosticSeverity.Error), 'The real TypeScript provider reports a string assigned to number');
    for (const key of ['editorError.foreground', 'errorLens.errorForeground']) {
        assert.equal(settings.get('workbench.colorCustomizations')[key], '#f8717133');
    }
    return 'TypeScript reports error 2322 with visible validation decorations and 80% transparent colors';
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

module.exports = { writeFixture, stageGitPanel, verifyLibraryImport, verifyFormatAndSave, verifySnippetsAndEmmet, verifyTypeDiagnostics, verifyGitPanel };
