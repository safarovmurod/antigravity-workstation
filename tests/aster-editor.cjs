'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {rendererConnection,waitFor}=require('./calm-typescript-editor.cjs');
async function run(){
  const vscode=require('vscode'),source=path.resolve(__dirname,'../extensions/aster-appearance');
  const extension=vscode.extensions.getExtension('workstation.aster-appearance');assert.ok(extension);await extension.activate();
  const config=vscode.workspace.getConfiguration(undefined,null),palettes=require('../extensions/aster-appearance/package.json').contributes.themes;
  const editor=await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({language:'typescript',content:'export interface Workspace { name: string; ready: boolean }\nconst message: string = "Aster Atelier";\nfunction render(count: number) { return count + 42; }\n'}));
  const connection=await rendererConnection();
  const result={host:{name:vscode.env.appName,version:vscode.version,platform:process.platform},installed:{id:extension.id,version:extension.packageJSON.version,path:extension.extensionPath},themes:[]};
  try{
    for(const item of palettes){
      const expected=require(path.join(source,item.path));
      await config.update('workbench.colorTheme',item.label,vscode.ConfigurationTarget.Global);
      const hex=expected.colors['editor.background'],rgb='rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
      let actual;
      await waitFor(async()=>{actual=await connection.evaluate("getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor");return actual===rgb;},'real renderer theme '+item.label,10000);
      result.themes.push({name:item.label,expected:rgb,actual,kind:vscode.window.activeColorTheme.kind});
    }
    await config.update('editor.fontSize',19,vscode.ConfigurationTarget.Global);
    await config.update('editor.fontWeight','600',vscode.ConfigurationTarget.Global);
    for(const style of ['italic','normal']){
      await config.update('asterAppearance.fontStyle',style,vscode.ConfigurationTarget.Global);
      let actual;
      await waitFor(async()=>{actual=await connection.evaluate("Array.from(document.querySelectorAll('.view-line span')).filter(e=>!e.children.length&&e.textContent.trim()).map(e=>({text:e.textContent,style:getComputedStyle(e).fontStyle,size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight}))");result[style]=actual;return actual.length&&actual.every(item=>item.style===style&&item.size==='19px'&&item.weight==='600');},'real editor glyph spans: '+style+' size and weight',10000);
      result[style]=actual;
    }
    await vscode.commands.executeCommand('asterAppearance.open');
    const ui=await require('./aster-renderer.cjs').connect();
    try{
      let target;
      await waitFor(async()=>{target=await ui.locate();return target;},'actual installed Aster panel DOM',15000);
      const evaluate=expression=>ui.evaluate(expression,target.sessionId,target.contextId);
      await waitFor(async()=>await evaluate('document.getElementById("theme").options.length===20 && document.getElementById("font").options.length>=10'),'panel state',15000);
      result.panel=await evaluate('({themes:document.getElementById("theme").options.length,fonts:Array.from(document.getElementById("font").options).filter(o=>o.value).length,preview:document.getElementById("preview").textContent})');
      assert.equal(result.panel.themes,20);assert.equal(result.panel.fonts,10);
      await waitFor(async()=>await evaluate('document.querySelector("header img").complete && document.querySelector("header img").naturalWidth===256'),'real packaged icon loads');
      result.panel.iconLoaded=true;result.panel.fontPreviews=[];
      for(const font of require('../extensions/aster-appearance/fonts.json')) {
        await evaluate(`document.getElementById('font').value=${JSON.stringify(font.id)};document.getElementById('font').dispatchEvent(new Event('change',{bubbles:true}));`);
        let preview;
        await waitFor(async()=>{preview=await evaluate(`({family:getComputedStyle(document.getElementById('preview')).fontFamily,loaded:Array.from(document.fonts).filter(f=>f.family===${JSON.stringify('AsterPreview-'+font.id)}&&f.status==='loaded').length,status:document.getElementById('availability').textContent})`);return preview.family.includes(font.family)||(preview.family.includes('AsterPreview-'+font.id)&&preview.loaded>0);},'real font preview '+font.family,15000);
        result.panel.fontPreviews.push({font:font.family,...preview});
        if(process.env.ASTER_VERIFY_FONT_INSTALL==='1') {
          await waitFor(()=>vscode.workspace.getConfiguration().get('editor.fontFamily').includes(font.family),'real font selection applies '+font.family,15000);
          await vscode.window.showTextDocument(editor.document,vscode.ViewColumn.Two);
          await ui.call('DOM.enable');await ui.call('CSS.enable');await ui.call('DOM.getDocument',{depth:-1,pierce:true});
          let platformFonts;
          await waitFor(async()=>{
            const node=await ui.call('Runtime.evaluate',{expression:"Array.from(document.querySelectorAll('.view-line span')).find(e=>!e.children.length&&e.textContent.includes('Aster'))"});
            if(!node.result.objectId)return false;
            const {nodeId}=await ui.call('DOM.requestNode',{objectId:node.result.objectId});
            if(!nodeId)return false;
            platformFonts=(await ui.call('CSS.getPlatformFontsForNode',{nodeId})).fonts;
            return platformFonts.some(face=>face.glyphCount>0&&face.familyName.toLowerCase().replace(/[^a-z0-9]/g,'').startsWith(font.family.toLowerCase().replace(/[^a-z0-9]/g,'')));
          },'actual rendered editor font glyphs '+font.family,15000);
          result.panel.fontPreviews.at(-1).actualEditorFonts=platformFonts;
          await vscode.commands.executeCommand('asterAppearance.open');
        }
      }
      await evaluate('document.getElementById("theme").value="git hab light";document.getElementById("theme").dispatchEvent(new Event("change",{bubbles:true}))');
      await waitFor(()=>vscode.workspace.getConfiguration().get('workbench.colorTheme')==='git hab light','theme selector changes actual editor settings');
      await ui.screenshot(path.join(path.dirname(process.env.WORKSTATION_EDITOR_RESULT),'aster-light.png'));
      await evaluate('document.getElementById("theme").value="oceanic pro";document.getElementById("theme").dispatchEvent(new Event("change",{bubbles:true}))');
      await waitFor(()=>vscode.workspace.getConfiguration().get('workbench.colorTheme')==='oceanic pro','dark selector changes actual editor settings');
      await ui.screenshot(path.join(path.dirname(process.env.WORKSTATION_EDITOR_RESULT),'aster-dark.png'));
      result.panel.selectorChangesActualSettings=true;
    }finally{ui.close();}
    result.scope='Real editor renderer and installed package. Panel selectors, OS font installation, restart and Antigravity-specific behavior are separate acceptance checks.';
    fs.writeFileSync(process.env.WORKSTATION_EDITOR_RESULT,JSON.stringify(result,null,2));
  }finally{fs.writeFileSync(process.env.WORKSTATION_EDITOR_RESULT,JSON.stringify(result,null,2));connection.close();}
}
async function launch(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'aster-editor-')),user=path.join(base,'user'),extensions=path.join(base,'extensions'),workspace=path.join(base,'workspace');
  fs.mkdirSync(path.join(user,'User'),{recursive:true});fs.mkdirSync(workspace);fs.mkdirSync(extensions);
  fs.writeFileSync(path.join(user,'User/settings.json'),JSON.stringify({'workbench.startupEditor':'none','update.mode':'none','extensions.autoUpdate':false,'telemetry.telemetryLevel':'off','security.workspace.trust.enabled':false}));
  const executable=process.env.WORKSTATION_VSCODE_PATH||'code',env={...process.env,WORKSTATION_EDITOR_RESULT:path.join(base,'result.json'),XDG_CACHE_HOME:path.join(base,'cache'),XDG_CONFIG_HOME:path.join(base,'config'),XDG_DATA_HOME:path.join(base,'data')};
  if(process.env.ASTER_VERIFY_FONT_INSTALL==='1') {
    assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
    const service=require('../extensions/aster-appearance/font-service.cjs'),fonts=require('../extensions/aster-appearance/fonts.json'),fontReport=[];
    const before=await service.installed(fonts);
    const storage=path.join(base,'font-downloads');fs.mkdirSync(storage);
    try{
      for(const font of fonts){
        if(!before[font.id])await service.install(path.resolve(__dirname,'../extensions/aster-appearance'),font,storage);
        const available=(await service.installed([font]))[font.id];assert.equal(available,true,font.family+' not registered by Windows');
        fontReport.push({family:font.family,alreadyInstalled:before[font.id],downloadedAndInstalled:!before[font.id],osReportsInstalled:available});
      }
    }finally{
      fs.writeFileSync(path.join(base,'font-install.json'),JSON.stringify(fontReport,null,2));
      if(process.env.ASTER_ARTIFACT_DIRECTORY){fs.mkdirSync(process.env.ASTER_ARTIFACT_DIRECTORY,{recursive:true});fs.copyFileSync(path.join(base,'font-install.json'),path.join(process.env.ASTER_ARTIFACT_DIRECTORY,'font-install.json'));}
    }
  }
  const artifact=path.resolve(__dirname,'../extensions/aster-appearance/aster-appearance-1.0.0.vsix');
  const cliArgs=path.basename(executable)==='code'||/\.exe$/i.test(executable)?[path.join(path.dirname(executable),'resources/app/out/cli.js')]:[];
  const install=spawnSync(executable,[...cliArgs,'--no-sandbox','--user-data-dir='+user,'--extensions-dir='+extensions,'--install-extension',artifact,'--force'],{env:{...env,...(cliArgs.length?{ELECTRON_RUN_AS_NODE:'1'}:{})},encoding:'utf8',timeout:60000});
  assert.equal(install.status,0,install.stdout+install.stderr);
  const driver=path.join(base,'driver');fs.mkdirSync(driver);fs.writeFileSync(path.join(driver,'package.json'),JSON.stringify({name:'aster-test-driver',publisher:'workstation',version:'1.0.0',engines:{vscode:'^1.107.0'}}));
  let display;
  try{
    if(process.platform==='linux'&&!env.DISPLAY){const n=400+process.pid%10000;env.DISPLAY=':'+n;display=spawn(process.env.WORKSTATION_XVFB_PATH||'Xvfb',[env.DISPLAY,'-screen','0','1440x1000x24','-nolisten','tcp','-ac'],{env,stdio:'ignore'});await waitFor(()=>fs.existsSync('/tmp/.X11-unix/X'+n),'Xvfb',5000);}
    const server=require('node:net').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));env.WORKSTATION_EDITOR_CDP_PORT=String(server.address().port);await new Promise(resolve=>server.close(resolve));
    const child=spawn(executable,['--no-sandbox','--disable-gpu','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--user-data-dir='+user,'--extensions-dir='+extensions,'--extensionDevelopmentPath='+driver,'--extensionTestsPath='+__filename,'--remote-debugging-port='+env.WORKSTATION_EDITOR_CDP_PORT,'--remote-debugging-address=127.0.0.1',workspace],{env,stdio:['ignore','pipe','pipe']});
    let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Editor timeout: '+log.slice(-8000)));},180000);child.on('exit',code=>{clearTimeout(timer);resolve(code);});child.on('error',reject);});
    fs.writeFileSync(path.join(base,'editor.log'),log);
    if(process.env.ASTER_ARTIFACT_DIRECTORY){fs.mkdirSync(process.env.ASTER_ARTIFACT_DIRECTORY,{recursive:true});for(const name of ['result.json','editor.log','aster-light.png','aster-dark.png'])if(fs.existsSync(path.join(base,name)))fs.copyFileSync(path.join(base,name),path.join(process.env.ASTER_ARTIFACT_DIRECTORY,name));}
    assert.equal(code,0,log.slice(-8000));assert.ok(fs.existsSync(env.WORKSTATION_EDITOR_RESULT),'No actual editor result');
    console.log('Evidence: '+env.WORKSTATION_EDITOR_RESULT);console.log(fs.readFileSync(env.WORKSTATION_EDITOR_RESULT,'utf8'));
  }finally{display?.kill();console.log('Artifacts retained: '+base);}
}
module.exports={run};
if(require.main===module)launch().catch(error=>{console.error(error);process.exitCode=1;});
