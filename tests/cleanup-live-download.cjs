'use strict';
const fs=require('node:fs'),path=require('node:path');
function cleanupLiveDownload(directory,creationRoot) {
  if(!path.isAbsolute(directory)||!path.isAbsolute(creationRoot))throw new Error('Unsafe live-test cleanup');
  const entry=fs.lstatSync(directory);
  if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error('Unsafe live-test cleanup');
  const target=fs.realpathSync(directory),root=fs.realpathSync(creationRoot);
  if(!/^workstation-live-download-[a-f0-9]{32}$/.test(path.relative(root,target)))throw new Error('Unsafe live-test cleanup');
  fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
module.exports={cleanupLiveDownload};
if(require.main===module)cleanupLiveDownload(process.argv[2],process.argv[3]);
