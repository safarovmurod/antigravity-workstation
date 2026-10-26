'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),command=require('../package.json').scripts.test;
if(!command.startsWith('node --test '))throw new Error('Review the coverage runner after changing the main test command');
const files=command.slice('node --test '.length).trim().split(/\s+/);
if(!files.length||files.some(file=>!/^tests\/[a-zA-Z0-9_./-]+\.(?:mjs|cjs|js)$/.test(file)))throw new Error('Unsupported test path in the main test command');
const result=spawnSync(process.execPath,['--experimental-test-coverage','--test-coverage-include=lib/**','--test-coverage-include=extensions/**',
  ...process.argv.slice(2),'--test',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.signal)console.error('Coverage test process terminated by '+result.signal);
process.exitCode=result.status??1;
