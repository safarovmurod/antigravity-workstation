'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {installAsterFixture}=require('./aster-cli-install.cjs');
const {rendererConnection,waitFor}=require('./calm-typescript-editor.cjs');
async function run(){
  const vscode=require('vscode'),source=path.resolve(__dirname,'../extensions/aster-appearance');
  const extension=vscode.extensions.getExtension('workstation.aster-appearance');assert.ok(extension);await extension.activate();
  const config=vscode.workspace.getConfiguration(undefined,null),palettes=require('../extensions/aster-appearance/package.json').contributes.themes;
  const persistedKeys=['workbench.colorTheme','editor.fontFamily','editor.fontSize','editor.fontWeight','asterAppearance.fontStyle','workbench.settings.applyToAllProfiles','editor.tokenColorCustomizations','editor.semanticTokenColorCustomizations'];
  const previous=process.env.ASTER_EXPECTED_SETTINGS_FILE?JSON.parse(fs.readFileSync(process.env.ASTER_EXPECTED_SETTINGS_FILE)):null;
  if(previous)for(const key of persistedKeys.filter(key=>process.env.ASTER_NAMED_PROFILE!=='1'||!key.includes('ColorCustomizations')))assert.deepEqual(config.inspect(key)?.globalValue,previous[key],'Persisted user setting after restart/project change: '+key);
  const editor=await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({language:'typescript',content:'export interface Workspace { name: string; ready: boolean }\nconst message: string = "Aster Atelier";\nfunction render(count: number) { return count + 42; }\n'}));
  const connection=await rendererConnection();
  const picker=await require('./aster-renderer.cjs').connect();
  const result={host:{name:vscode.env.appName,version:vscode.version,platform:process.platform},installed:{id:extension.id,version:extension.packageJSON.version,path:extension.extensionPath},themes:[]};
  result.reopenedWithPriorSettings=!!previous;
  const registration=JSON.parse(fs.readFileSync(path.join(path.dirname(extension.extensionPath),'extensions.json'))).find(e=>e.identifier.id==='workstation.aster-appearance');
  assert.equal(registration.metadata.isApplicationScoped,true,'Host officially applies the extension to all profiles');
  result.applicationScoped=true;
  if(process.env.ASTER_UPGRADE_VERIFIED==='1')result.realCliVersionCycle={from:'0.9.0',to:extension.packageJSON.version,fixture:'0.9.0 is an explicitly synthetic prior-version package of the same code, not a historical product release. Actual CLI registration is checked before installing the current VSIX.'};
  try{
    for(const item of palettes){
      const expected=require(path.join(source,item.path));
      const selection=vscode.commands.executeCommand('workbench.action.selectTheme');
      await waitFor(async()=>await picker.evaluate("(()=>{const w=document.querySelector('.quick-input-widget'),i=w?.querySelector('input');return !!i&&getComputedStyle(w).display!=='none'&&document.activeElement===i})()"),'native color-theme picker focus');
      await connection.pressKey('a','KeyA',65,2);
      await connection.pressKey('Backspace','Backspace',8);
      await picker.call('Input.insertText',{text:item.label});
      let row;
      await waitFor(async()=>{row=await picker.evaluate(`(()=>{const row=Array.from(document.querySelectorAll('.quick-input-list .monaco-list-row')).find(e=>Array.from(e.querySelectorAll('.label-name')).some(n=>n.textContent===${JSON.stringify(item.label)}));if(!row)return null;const b=row.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);return row;},'contributed theme appears in standard picker: '+item.label);
      for(const type of ['mousePressed','mouseReleased'])await picker.call('Input.dispatchMouseEvent',{type,x:row.x,y:row.y,button:'left',clickCount:1});
      await selection;
      await waitFor(async()=>await picker.evaluate("getComputedStyle(document.querySelector('.quick-input-widget')).display==='none'"),'native picker closes after actual selection');
      const hex=expected.colors['editor.background'],rgb='rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
      let actual;
      await waitFor(async()=>{actual=await connection.evaluate("getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor");return actual===rgb;},'real renderer theme '+item.label,10000);
      result.themes.push({name:item.label,expected:rgb,actual,kind:vscode.window.activeColorTheme.kind,selectedThroughStandardPicker:true});
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
      if(process.env.ASTER_VERIFY_FONT_INSTALL==='1'){
        await config.update('editor.fontWeight','bold',vscode.ConfigurationTarget.Global);
        await waitFor(async()=>await evaluate("document.getElementById('weight').value==='700'"),'native bold is shown as real weight 700 in the panel');
      }
      for(const font of require('../extensions/aster-appearance/fonts.json')) {
        await evaluate(`document.getElementById('font').value=${JSON.stringify(font.id)};document.getElementById('font').dispatchEvent(new Event('change',{bubbles:true}));`);
        let preview;
        await waitFor(async()=>{preview=await evaluate(`({family:getComputedStyle(document.getElementById('preview')).fontFamily,loaded:Array.from(document.fonts).filter(f=>f.family===${JSON.stringify('AsterPreview-'+font.id)}&&f.status==='loaded').length,status:document.getElementById('availability').textContent})`);return preview.family.includes(font.family)||(preview.family.includes('AsterPreview-'+font.id)&&preview.loaded>0);},'real font preview '+font.family,15000);
        result.panel.fontPreviews.push({font:font.family,...preview});
        if(process.env.ASTER_VERIFY_FONT_INSTALL==='1') {
          await waitFor(()=>vscode.workspace.getConfiguration().get('editor.fontFamily').includes(font.family),'real font selection applies '+font.family,15000);
          if(font.id==='jetbrainsmono')await waitFor(()=>vscode.workspace.getConfiguration().get('editor.fontWeight')==='700','font selection finishes writing native bold as weight 700',15000);
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
      await vscode.window.showTextDocument(editor.document,vscode.ViewColumn.Two);
      await vscode.commands.executeCommand('asterAppearance.open');
      result.panel.fontControls=[];
      for(const values of [{size:17,weight:400,style:'italic'},{size:19,weight:600,style:'normal'}]) {
        await evaluate(`(()=>{for(const [id,value] of Object.entries(${JSON.stringify(values)})){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
        await waitFor(()=>{const current=vscode.workspace.getConfiguration();return current.get('editor.fontSize')===values.size&&current.get('editor.fontWeight')===String(values.weight)&&current.get('asterAppearance.fontStyle')===values.style;},'panel controls update native settings');
        let actual;
        await waitFor(async()=>{actual=await connection.evaluate("Array.from(document.querySelectorAll('.view-line span')).filter(e=>!e.children.length&&e.textContent.trim()).map(e=>({style:getComputedStyle(e).fontStyle,size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight}))");return actual.length&&actual.every(token=>token.style===values.style&&token.size===values.size+'px'&&token.weight===String(values.weight));},'panel controls change actual rendered code');
        result.panel.fontControls.push({requested:values,actual});
      }
      const workspaceLanguage=vscode.workspace.getConfiguration().inspect('[typescript]')?.workspaceValue;
      await vscode.workspace.getConfiguration().update('[typescript]',{...workspaceLanguage,'editor.fontSize':23},vscode.ConfigurationTarget.Workspace);
      try{
        await evaluate("document.getElementById('size').value=21;document.getElementById('size').dispatchEvent(new Event('change',{bubbles:true}));");
        await waitFor(async()=>await evaluate("document.getElementById('message').textContent.includes('override prevents application: editor.fontSize')"),'language override is reported instead of false application');
        assert.equal(vscode.workspace.getConfiguration(undefined,{uri:editor.document.uri,languageId:'typescript'}).get('editor.fontSize'),23);
        assert.equal(vscode.workspace.getConfiguration().inspect('editor.fontSize').globalValue,21);
        result.panel.languageOverridePreservedAndReported=true;
      }finally{await vscode.workspace.getConfiguration().update('[typescript]',workspaceLanguage,vscode.ConfigurationTarget.Workspace);}
      await evaluate("document.getElementById('size').value=19;document.getElementById('size').dispatchEvent(new Event('change',{bubbles:true}));");
      await waitFor(()=>vscode.workspace.getConfiguration().get('editor.fontSize')===19,'restored disposable fixture global size');
      await evaluate('document.getElementById("theme").value="git hab light";document.getElementById("theme").dispatchEvent(new Event("change",{bubbles:true}))');
      await waitFor(()=>vscode.workspace.getConfiguration().get('workbench.colorTheme')==='git hab light','theme selector changes actual editor settings');
      await vscode.commands.executeCommand('workbench.action.minimizeOtherEditors');
      await ui.screenshot(path.join(path.dirname(process.env.WORKSTATION_EDITOR_RESULT),'aster-light.png'));
      await evaluate('document.getElementById("theme").value="oceanic pro";document.getElementById("theme").dispatchEvent(new Event("change",{bubbles:true}))');
      await waitFor(()=>vscode.workspace.getConfiguration().get('workbench.colorTheme')==='oceanic pro','dark selector changes actual editor settings');
      await ui.screenshot(path.join(path.dirname(process.env.WORKSTATION_EDITOR_RESULT),'aster-dark.png'));
      result.panel.selectorChangesActualSettings=true;
    }finally{ui.close();}
    await vscode.commands.executeCommand('extension.open','workstation.aster-appearance');
    const details=await require('./aster-renderer.cjs').connect();
    try{
      await waitFor(async()=>await details.evaluate(`document.body.innerText.includes('Aster Atelier') && document.body.innerText.includes(${JSON.stringify(extension.packageJSON.description)}) && Array.from(document.images).some(image=>image.src.includes('workstation.aster-appearance')&&image.complete&&image.naturalWidth===256)`),'actual extension page name, description and packaged icon');
      let target;
      await waitFor(async()=>{target=await details.locate("document.body.innerText.includes('Twenty considered editor palettes.')");return target;},'actual installed extension Details markdown');
      const content=await details.evaluate('document.body.innerText',target.sessionId,target.contextId);
      for(const item of palettes)assert.ok(content.includes(item.label),'Details theme '+item.label);
      for(const font of require('../extensions/aster-appearance/fonts.json'))assert.ok(content.includes(font.family),'Details font '+font.family);
      result.extensionDetails={nameDescriptionIconVerified:true,themesListed:20,fontsListed:10};
      await details.screenshot(path.join(path.dirname(process.env.WORKSTATION_EDITOR_RESULT),'aster-details.png'));
    }finally{details.close();}
    result.scope='Real editor renderer and installed package. Panel selectors, OS font installation, restart and Antigravity-specific behavior are separate acceptance checks.';
    fs.writeFileSync(process.env.WORKSTATION_EDITOR_RESULT,JSON.stringify(result,null,2));
  }finally{
    result.savedSettings=Object.fromEntries(persistedKeys.map(key=>[key,vscode.workspace.getConfiguration(undefined,null).inspect(key)?.globalValue]));
    fs.writeFileSync(process.env.WORKSTATION_EDITOR_RESULT,JSON.stringify(result,null,2));connection.close();picker.close();
  }
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
    let recoveredFont;
    const recoveryFont=fonts.find(font=>font.id==='jetbrainsmono');
    if(!before[recoveryFont.id]){
      const payload=recoveryFont.files.find(item=>item.file.endsWith('.ttf')&&!item.italic);
      const filename='Aster-'+recoveryFont.id+'-'+payload.sha256.slice(0,12)+'.ttf';
      const directory=path.join(process.env.LOCALAPPDATA,'Microsoft/Windows/Fonts');fs.mkdirSync(directory,{recursive:true});
      const cached=path.join(directory,filename);fs.copyFileSync(path.resolve(__dirname,'../extensions/aster-appearance',payload.file),cached,fs.constants.COPYFILE_EXCL);
      const stage=path.join(base,'failed-font-install');fs.mkdirSync(stage);fs.copyFileSync(cached,path.join(stage,filename));fs.writeFileSync(path.join(stage,'Aster-zz-invalid.ttf'),'not a font');
      const failure=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../extensions/aster-appearance/install-font.ps1'),'-Stage',stage],{encoding:'utf8',windowsHide:true,timeout:60000});
      assert.notEqual(failure.status,0,'Invalid second font must fail, never pretend success');
      assert.match(failure.stderr,/AddFontFile|Invalid font payload|not a valid|Parameter is not valid/i,'The failure must reach the invalid second font, not an unrelated installation error:\n'+failure.stdout+'\n'+failure.stderr);
      assert.deepEqual(fs.readFileSync(cached),fs.readFileSync(path.resolve(__dirname,'../extensions/aster-appearance',payload.file)),'Rollback retains the pre-existing verified font file');
      const registryCommand=String.raw`$ErrorActionPreference='Stop'; $p=(Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts').PSObject.Properties['${path.basename(filename,'.ttf')} (TrueType)']; if($null -ne $p){exit 1}`;
      const registry=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',registryCommand],{encoding:'utf8',windowsHide:true,timeout:60000});
      assert.equal(registry.status,0,'Rollback removes only its newly created font registration: '+registry.stderr);
      recoveredFont=recoveryFont.id;
    }
    try{
      for(const font of fonts){
        if(!before[font.id])await service.install(path.resolve(__dirname,'../extensions/aster-appearance'),font,storage);
        const available=(await service.installed([font]))[font.id];assert.equal(available,true,font.family+' not registered by Windows');
        fontReport.push({family:font.family,alreadyInstalled:before[font.id],downloadedAndInstalled:!before[font.id],osReportsInstalled:available,verifiedInterruptedRegistrationRecovery:font.id===recoveredFont});
      }
    }finally{
      fs.writeFileSync(path.join(base,'font-install.json'),JSON.stringify(fontReport,null,2));
      if(process.env.ASTER_ARTIFACT_DIRECTORY){fs.mkdirSync(process.env.ASTER_ARTIFACT_DIRECTORY,{recursive:true});fs.copyFileSync(path.join(base,'font-install.json'),path.join(process.env.ASTER_ARTIFACT_DIRECTORY,'font-install.json'));}
    }
  }
  const artifact=path.resolve(__dirname,'../extensions/aster-appearance/aster-appearance-1.0.0.vsix');
  const cliArgs=path.basename(executable)==='code'||/\.exe$/i.test(executable)?[path.join(path.dirname(executable),'resources/app/out/cli.js')]:[];
  const expectedPackage=require('../extensions/aster-appearance/package.json'),pin=require('../extensions/aster-appearance/manifest.json');
  const install=(file,expectedPin,expected)=>installAsterFixture({executable,cliArgs,userDataDir:user,extensionsDir:extensions,artifact:file,pin:expectedPin,expectedPackage:expected,env,log:console.log});
  install(artifact,pin,expectedPackage);
  const driver=path.join(base,'driver');fs.mkdirSync(driver);fs.writeFileSync(path.join(driver,'package.json'),JSON.stringify({name:'aster-test-driver',publisher:'workstation',version:'1.0.0',engines:{vscode:'^1.107.0'}}));
  let display;
  try{
    if(process.platform==='linux'&&!env.DISPLAY){const n=400+process.pid%10000;env.DISPLAY=':'+n;display=spawn(process.env.WORKSTATION_XVFB_PATH||'Xvfb',[env.DISPLAY,'-screen','0','1440x1000x24','-nolisten','tcp','-ac'],{env,stdio:'ignore'});await waitFor(()=>fs.existsSync('/tmp/.X11-unix/X'+n),'Xvfb',5000);}
    const server=require('node:net').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));env.WORKSTATION_EDITOR_CDP_PORT=String(server.address().port);await new Promise(resolve=>server.close(resolve));
    for(const phase of ['fresh','restart-new-project','named-profile']) {
    let folder=workspace;
    if(phase!=='fresh') {
      const first=JSON.parse(fs.readFileSync(env.WORKSTATION_EDITOR_RESULT));
      const expected=path.join(base,'expected-settings.json');fs.writeFileSync(expected,JSON.stringify(first.savedSettings));env.ASTER_EXPECTED_SETTINGS_FILE=expected;
      folder=path.join(base,'Different project with spaces '+phase);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'existing.ts'),'export const existingProject = true;\n');
      if(phase==='restart-new-project') {
        const older=require('../scripts/package-aster.cjs').build({version:'0.9.0'}),fixture=path.join(base,'aster-fixture-0.9.0.vsix');fs.writeFileSync(fixture,older.bytes);
        install(fixture,older.pin,{...expectedPackage,version:'0.9.0'});
        const registered=spawnSync(executable,[...cliArgs,'--no-sandbox','--user-data-dir='+user,'--extensions-dir='+extensions,'--list-extensions','--show-versions'],{env:{...env,...(cliArgs.length?{ELECTRON_RUN_AS_NODE:'1'}:{})},encoding:'utf8',timeout:60000});
        assert.equal(registered.status,0,registered.stderr);assert.ok(registered.stdout.split(/\r?\n/).some(line=>line.trim()==='workstation.aster-appearance@0.9.0'),'Actual old-version fixture registration');
        env.ASTER_UPGRADE_VERIFIED='1';
      }
      install(artifact,pin,expectedPackage);
    }
    env.ASTER_NAMED_PROFILE=phase==='named-profile'?'1':'0';
    const child=spawn(executable,['--no-sandbox','--disable-gpu','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--user-data-dir='+user,'--extensions-dir='+extensions,'--extensionDevelopmentPath='+driver,'--extensionTestsPath='+__filename,'--remote-debugging-port='+env.WORKSTATION_EDITOR_CDP_PORT,'--remote-debugging-address=127.0.0.1',...(phase==='named-profile'?['--profile','Aster Separate Profile']:[]),folder],{env,stdio:['ignore','pipe','pipe']});
    let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Editor timeout: '+log.slice(-8000)));},180000);child.on('exit',code=>{clearTimeout(timer);resolve(code);});child.on('error',reject);});
    fs.writeFileSync(path.join(base,'editor.log'),log);
    if(process.env.ASTER_ARTIFACT_DIRECTORY){fs.mkdirSync(process.env.ASTER_ARTIFACT_DIRECTORY,{recursive:true});for(const name of ['result.json','editor.log','aster-light.png','aster-dark.png','aster-details.png'])if(fs.existsSync(path.join(base,name)))fs.copyFileSync(path.join(base,name),path.join(process.env.ASTER_ARTIFACT_DIRECTORY,name));}
    assert.equal(code,0,log.slice(-8000));assert.ok(fs.existsSync(env.WORKSTATION_EDITOR_RESULT),'No actual editor result');
    fs.copyFileSync(env.WORKSTATION_EDITOR_RESULT,path.join(base,'result-'+phase+'.json'));
    if(process.env.ASTER_ARTIFACT_DIRECTORY)fs.copyFileSync(env.WORKSTATION_EDITOR_RESULT,path.join(process.env.ASTER_ARTIFACT_DIRECTORY,'result-'+phase+'.json'));
    console.log('Evidence: '+env.WORKSTATION_EDITOR_RESULT);console.log(fs.readFileSync(env.WORKSTATION_EDITOR_RESULT,'utf8'));
    }
  }finally{display?.kill();console.log('Artifacts retained: '+base);}
}
module.exports={run};
if(require.main===module)launch().catch(error=>{console.error(error);process.exitCode=1;});
