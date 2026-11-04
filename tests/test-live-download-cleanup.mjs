import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{cleanupLiveDownload}=require('./cleanup-live-download.cjs');
function fixture(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'owned-live-cleanup-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));const root=path.join(base,'PowerShell temp with spaces');fs.mkdirSync(root);const directory=path.join(root,'workstation-live-download-'+crypto.randomUUID().replaceAll('-',''));fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'fixture.txt'),'owned');fs.writeFileSync(path.join(root,'personal.txt'),'preserve');return{base,root,directory};}
test('Live fixture cleanup uses its recorded creation root even when Node has a different OS temp root',t=>{const f=fixture(t);assert.notEqual(f.root,os.tmpdir());cleanupLiveDownload(f.directory,f.root);assert.equal(fs.existsSync(f.directory),false);assert.equal(fs.readFileSync(path.join(f.root,'personal.txt'),'utf8'),'preserve');});
test('Live fixture cleanup refuses root, wrong runtime root, nested and relative paths without deleting data',t=>{const f=fixture(t);const nested=path.join(f.directory,path.basename(f.directory));fs.mkdirSync(nested);for(const [directory,root]of [[f.root,f.root],[f.directory,os.tmpdir()],[nested,f.root],['relative',f.root],[f.directory,'relative']])assert.throws(()=>cleanupLiveDownload(directory,root),/Unsafe live-test cleanup/);assert.equal(fs.readFileSync(path.join(f.directory,'fixture.txt'),'utf8'),'owned');assert.equal(fs.readFileSync(path.join(f.root,'personal.txt'),'utf8'),'preserve');});
test('Live fixture cleanup refuses a symlink or Windows junction even with an owned-looking name', t => {
  const f = fixture(t), link = path.join(f.root, 'workstation-live-download-' + crypto.randomUUID().replaceAll('-', ''));
  try {
    fs.symlinkSync(f.directory, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
      t.skip('Windows environment restricted junction creation');
      return;
    }
    throw err;
  }
  assert.throws(() => cleanupLiveDownload(link, f.root), /Unsafe live-test cleanup/);
  assert.equal(fs.readFileSync(path.join(f.directory, 'fixture.txt'), 'utf8'), 'owned');
});
