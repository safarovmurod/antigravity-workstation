import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertHosted, ownedDirectory, wrapperText, verifyOfflineGalleryReuse, verifyLatestGalleryReuse } = require('./full-catalog.cjs');

test('Full-catalog installation refuses personal computers and self-hosted runners before any IDE command', () => {
  for (const [platform, environment] of [
    ['win32', {}], ['linux', { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }],
    ['win32', { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' }],
    ['win32', { GITHUB_ACTIONS: 'false', RUNNER_ENVIRONMENT: 'github-hosted' }],
  ]) assert.throws(() => assertHosted(platform, environment), /restricted to an isolated GitHub-hosted Windows runner/);
  assert.doesNotThrow(() => assertHosted('win32', { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }));
});

test('The native repeat-gallery guard rejects any downloader or installation attempt even if its error is swallowed', () => {
  const catalog = [{ id: 'test.gallery', source: 'gallery' }, { id: 'test.optional', source: 'gallery', optional: true }];
  assert.throws(() => verifyOfflineGalleryReuse({ installGalleryExtensions(_cli, _catalog, options) {
    try { options.install(); } catch {   }
    return { failures: [], skipped: ['test.optional'] };
  } }, 'fixture-cli', catalog, {}), /attempted a download or reinstall/);
  assert.throws(() => verifyOfflineGalleryReuse({ installGalleryExtensions() {
    return { failures: ['bad registration'], skipped: [] };
  } }, 'fixture-cli', catalog, {}), /Every installed mandatory gallery/);
  const passed = verifyOfflineGalleryReuse({ installGalleryExtensions() {
    return { failures: [], skipped: ['test.optional'] };
  } }, 'fixture-cli', catalog, {});
  assert.deepEqual(passed, { passed: true, requiredGalleryCount: 1, attemptedDownloadsOrInstalls: 0, optionalSkipped: ['test.optional'] });
});

function latestFixture(t,queries,statuses=[]){
  const catalog=['alpha.gallery','beta.gallery'].map(id=>({id,source:'gallery',trackLatest:true}));let call=0;
  t.mock.method(require('node:child_process'),'spawnSync',()=>({status:statuses[call++]??0,stdout:'{"version":"1.0.0"}'}));
  const extensions={installExtension(_cli,id,options){options.run('fixture-node',['install-gallery-extension.cjs','--metadata',id,'{}'],{});return{success:true};},
    installGalleryExtensions(cli,_catalog,options){for(const id of queries)options.install(cli,id,{});return{failures:[],skipped:[]};}};
  return()=>verifyLatestGalleryReuse(extensions,'fixture-cli',catalog,{});
}
test('Production latest reuse verifies every ID despite a bounded transient metadata retry',t=>{
  const result=latestFixture(t,['alpha.gallery','alpha.gallery','beta.gallery'],[1,0,0])();
  assert.equal(result.metadataChecks,3);assert.deepEqual(result.verifiedMetadataIds,['alpha.gallery','beta.gallery']);
  assert.deepEqual(result.metadataAttemptsById,{'alpha.gallery':2,'beta.gallery':1});assert.equal(result.forbiddenOperations,0);
});
test('Production latest reuse cannot hide missing, unsuccessful, unexpected or excessively retried IDs',t=>{
  assert.throws(latestFixture(t,['alpha.gallery']),/Every mandatory gallery/);
  t.mock.restoreAll();assert.throws(latestFixture(t,['alpha.gallery','beta.gallery'],[0,1]),/successful metadata response/);
  t.mock.restoreAll();assert.throws(latestFixture(t,['unexpected.gallery']),/Unexpected gallery metadata ID/);
  t.mock.restoreAll();assert.throws(latestFixture(t,['alpha.gallery','alpha.gallery','alpha.gallery','alpha.gallery','beta.gallery']),/retry limit exceeded/);
});

test('Full-catalog fixtures must be descendants of the hosted runner temporary directory', () => {
  const temp = path.resolve(os.tmpdir());
  assert.equal(ownedDirectory(path.join(temp, 'Owned fixture with spaces'), temp), path.join(temp, 'Owned fixture with spaces'));
  assert.throws(() => ownedDirectory(temp, temp), /stay inside RUNNER_TEMP/);
  assert.throws(() => ownedDirectory(path.dirname(temp), temp), /stay inside RUNNER_TEMP/);
  assert.throws(() => ownedDirectory(temp + '-foreign/fixture', temp), /stay inside RUNNER_TEMP/);
});

test('The full-catalog wrapper invokes only the official CLI with explicit private profile flags and quoted paths', () => {
  const executable = 'D:\\Hosted programs with spaces\\Муҳит\\My editor\\Antigravity IDE.exe';
  const cli = 'D:\\Hosted programs with spaces\\Муҳит\\My editor\\resources\\app\\out\\cli.js';
  const userData = 'C:\\Runner temp\\Owned profile\\AppData\\Roaming\\Antigravity IDE';
  const extensions = 'C:\\Runner temp\\Owned profile\\.antigravity-ide\\extensions';
  const text = wrapperText(executable, cli, userData, extensions);
  assert.ok(text.indexOf('chcp 65001 >nul') < text.indexOf(executable), 'UTF-8 batch paths must be decoded before the first non-ASCII path');
  assert.ok(text.includes('set "ELECTRON_RUN_AS_NODE=1"'));
  assert.ok(text.includes('set "VSCODE_IPC_HOOK_CLI="'));
  assert.ok(text.includes(`"${executable}" "${cli}" --user-data-dir "${userData}" --extensions-dir "${extensions}" %*`));
  assert.ok(text.includes('exit /b %errorlevel%'));
  for (const invalid of ['relative.exe', 'C:\\Bad%EXPAND%\\IDE.exe', 'C:\\Bad"path\\IDE.exe', 'C:\\bad\r\ncommand.exe']) {
    assert.throws(() => wrapperText(invalid, cli, userData, extensions), /Unsafe full-catalog CLI wrapper path/);
  }
});
