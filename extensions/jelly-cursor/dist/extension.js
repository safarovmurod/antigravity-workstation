"use strict";var st=Object.create;var R=Object.defineProperty;var it=Object.getOwnPropertyDescriptor;var at=Object.getOwnPropertyNames;var ct=Object.getPrototypeOf,lt=Object.prototype.hasOwnProperty;var dt=(t,e)=>{for(var n in e)R(t,n,{get:e[n],enumerable:!0})},Q=(t,e,n,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of at(e))!lt.call(t,o)&&o!==n&&R(t,o,{get:()=>e[o],enumerable:!(i=it(e,o))||i.enumerable});return t};var k=(t,e,n)=>(n=t!=null?st(ct(t)):{},Q(e||!t||!t.__esModule?R(n,"default",{value:t,enumerable:!0}):n,t)),ut=t=>Q(R({},"__esModule",{value:!0}),t);var Nt={};dt(Nt,{activate:()=>ht,deactivate:()=>ft});module.exports=ut(Nt);var Y=k(require("child_process")),c=k(require("fs")),V=k(require("os")),s=k(require("path")),a=k(require("vscode")),P="<!-- jelly-cursor:start -->",W="<!-- jelly-cursor:end -->",B="<!-- new-neovide-cursor:start -->",q="<!-- new-neovide-cursor:end -->",M="jelly-cursor.js",F="new-neovide-cursor.js",$=".jelly-cursor-backup",C,x,E;function pt(){return a.env.language.toLowerCase().startsWith("zh")}function r(t,e){return pt()?e:t}function ht(t){C=a.window.createOutputChannel("Jelly Cursor"),t.subscriptions.push(C),t.subscriptions.push(a.commands.registerCommand("jellyCursor.installDomPatch",async()=>{await J()}),a.commands.registerCommand("jellyCursor.uninstallDomPatch",async()=>{await bt()}),a.commands.registerCommand("jellyCursor.showStatus",async()=>{await At()}),a.commands.registerCommand("jellyCursor.restoreBackup",async()=>{await Lt()})),x=a.window.createStatusBarItem(a.StatusBarAlignment.Right,100),x.command="jellyCursor.showStatus",t.subscriptions.push(x),t.subscriptions.push(a.workspace.onDidChangeConfiguration(e=>{!e.affectsConfiguration("jellyCursor")&&!e.affectsConfiguration("newNeovideCursor")||(A(),gt(e)&&(E&&clearTimeout(E),E=setTimeout(()=>{yt()},800)))})),A(),t.extensionMode===a.ExtensionMode.Production&&mt()}function ft(){E&&clearTimeout(E)}function f(t){if(C)try{C.appendLine(`[${new Date().toISOString()}] ${t}`)}catch{try{C=a.window.createOutputChannel("Jelly Cursor"),C.appendLine(`[${new Date().toISOString()}] ${t}`)}catch{C=void 0}}}function A(){try{if(!x)return;if(!a.workspace.getConfiguration("jellyCursor").get("statusBar",!0)){x.hide();return}let t=N(),e=t?I(t):void 0;x.text=e?.patched?"$(check) Jelly Cursor":e?"$(circle-outline) Jelly Cursor":"$(question) Jelly Cursor",x.tooltip=e?r(`Jelly Cursor ${e.patched?"patch is installed":"patch is not installed"}
${e.filePath}`,`Jelly Cursor \u8865\u4E01${e.patched?"\u5DF2\u5B89\u88C5":"\u672A\u5B89\u88C5"}
${e.filePath}`):r("Jelly Cursor patch status is unknown.","Jelly Cursor \u8865\u4E01\u72B6\u6001\u672A\u77E5\u3002"),x.show()}catch(t){f(`status bar update failed: ${m(t)}`),x=void 0}}function gt(t){return["fastSpeed","midSpeed","slowSpeed","axisBias","twistBoost","minAlpha","cursorColor","glowColor","glowEnabled","glowOpacity","glowIntensity","glowSize","animationMode","maxJumpAnimationDistance"].some(n=>t.affectsConfiguration(`jellyCursor.${n}`))||t.affectsConfiguration("newNeovideCursor")}async function mt(){if(!a.workspace.getConfiguration("jellyCursor").get("reminders",!0))return;let t=N();if(!t)return;let e=I(t);if(f(`startup check: ${t} -> ${e.patched?"patched":"not patched"}`),e.patched)return;let n=r("Install Patch","\u5B89\u88C5\u8865\u4E01");await a.window.showInformationMessage(r("Jelly Cursor patch is not installed. VS Code may have updated and removed it.","Jelly Cursor \u8865\u4E01\u672A\u5B89\u88C5\uFF0CVS Code \u53EF\u80FD\u5DF2\u66F4\u65B0\u5E76\u79FB\u9664\u4E86\u8865\u4E01\u3002"),{modal:!1,detail:t},n,r("Not Now","\u6682\u4E0D"))===n&&await J()}async function yt(){if(!a.workspace.getConfiguration("jellyCursor").get("reminders",!0))return;let t=N();if(!t||!I(t).patched)return;let e=r("Reinstall Patch","\u91CD\u65B0\u5B89\u88C5\u8865\u4E01");await a.window.showInformationMessage(r("Jelly Cursor settings changed. Reinstall the DOM patch and restart VS Code to apply them.","Jelly Cursor \u8BBE\u7F6E\u5DF2\u4FEE\u6539\uFF0C\u9700\u8981\u91CD\u65B0\u5B89\u88C5\u8865\u4E01\u5E76\u91CD\u542F VS Code \u624D\u80FD\u751F\u6548\u3002"),e,r("Later","\u7A0D\u540E"))===e&&await J()}function N(){let t=H();return t&&v(t)?t:Z()}async function G(){try{await a.commands.executeCommand("workbench.action.reloadWindow")}catch(t){f(`reload window failed: ${m(t)}`)}}async function O(t){try{let e=r("Restart Now","\u7ACB\u5373\u91CD\u542F");await a.window.showInformationMessage(t,e)===e&&await G()}catch(e){f(`restart prompt failed: ${m(e)}`)}}async function J(){let t;try{t=await z()}catch(u){w("finding workbench.html",u);return}if(!t){a.window.showErrorMessage(r("Cannot find VS Code workbench.html.","\u627E\u4E0D\u5230 VS Code \u7684 workbench.html\u3002"));return}f(`install: using ${t}`);let e=s.dirname(t),n=s.join(e,M),i=s.join(e,F),o=c.existsSync(n),l,d;if(o)try{l=c.readFileSync(n,"utf8")}catch{}try{d=c.readFileSync(t,"utf8")}catch(u){w("reading workbench.html",u,t);return}try{$t(t,d);let u=`${P}<script src="./${M}"></script>${W}`,h=T(d,B,q),y=h.includes(P)?h.replace(new RegExp(`${D(P)}[\\s\\S]*?${D(W)}`),u):h.replace("</html>",`${u}
</html>`);if(S(n,Bt(It())),S(t,y),c.existsSync(i))try{c.unlinkSync(i)}catch{}}catch(u){try{S(t,d)}catch{}if(!o&&c.existsSync(n))try{c.unlinkSync(n)}catch{}else if(o&&l!==void 0)try{S(n,l)}catch{}f(`install failed: ${m(u)}`),w("installing the DOM patch",u,t);return}f(`install: patched ${t}`),A(),await O(r(`Jelly Cursor DOM patch installed in ${t}. Restart VS Code to load it.`,`Jelly Cursor \u8865\u4E01\u5DF2\u5B89\u88C5\u5230 ${t}\u3002\u91CD\u542F VS Code \u540E\u751F\u6548\u3002`))}async function bt(){let t;try{t=await z()}catch(e){w("finding workbench.html",e);return}if(!t){a.window.showErrorMessage(r("Cannot find VS Code workbench.html.","\u627E\u4E0D\u5230 VS Code \u7684 workbench.html\u3002"));return}await X(t)}async function X(t){f(`uninstall: using ${t}`);let e=s.dirname(t),n=s.join(e,M),i=s.join(e,F),o;try{o=c.readFileSync(t,"utf8")}catch(u){w("reading workbench.html",u,t);return}let l=T(T(o,P,W),B,q),d;try{o!==l&&S(t,l);for(let u of[n,i])if(c.existsSync(u))try{c.unlinkSync(u)}catch(h){d=`${u}: ${m(h)}`}}catch(u){f(`uninstall failed: ${m(u)}`),w("removing the DOM patch",u,t);return}if(f(`uninstall: removed patch from ${t}`),A(),d){let u=r("Restart Now","\u7ACB\u5373\u91CD\u542F");await a.window.showWarningMessage(r(`Jelly Cursor patch removed, but a script file could not be deleted.
${d}`,`Jelly Cursor \u8865\u4E01\u5DF2\u79FB\u9664\uFF0C\u4F46\u6709\u4E00\u4E2A\u811A\u672C\u6587\u4EF6\u65E0\u6CD5\u5220\u9664\u3002
${d}`),u)===u&&await G()}else await O(r(`Jelly Cursor DOM patch removed from ${t}. Restart VS Code to finish.`,`Jelly Cursor \u8865\u4E01\u5DF2\u4ECE ${t} \u79FB\u9664\u3002\u91CD\u542F VS Code \u5B8C\u6210\u5378\u8F7D\u3002`))}async function z(){let t=H();if(t){if(v(t))return t;let n=r("Choose File...","\u9009\u62E9\u6587\u4EF6\u2026");return await a.window.showWarningMessage(r("The configured workbench.html path is invalid.","\u914D\u7F6E\u7684 workbench.html \u8DEF\u5F84\u65E0\u6548\u3002"),{modal:!0,detail:K(t)},n,r("Cancel","\u53D6\u6D88"))!==n?void 0:await U()}let e=Z();return e?(f(`detected workbench.html: ${e}`),e):await U()}function Z(){for(let t of L()){let e=kt(t);if(e)return e}}function L(){let t=[a.env.appRoot,s.dirname(process.execPath),s.resolve(s.dirname(process.execPath),"..")].filter(Boolean);return process.platform==="win32"?wt(t):process.platform==="darwin"?xt(t):Ct(t),St(t),vt(t)}function wt(t){let e=process.env.LOCALAPPDATA,n=process.env.ProgramFiles,i=process.env["ProgramFiles(x86)"],o=process.env.USERPROFILE,l=["Microsoft VS Code","Microsoft VS Code Insiders","Cursor","VSCodium","Windsurf"];if(e)for(let d of l)j(t,s.join(e,"Programs",d));if(n)for(let d of l)j(t,s.join(n,d));if(i)for(let d of l)j(t,s.join(i,d));o&&t.push(s.join(o,"scoop","apps","vscode","current"),s.join(o,"scoop","apps","vscodium","current"),s.join(o,"scoop","apps","cursor","current"))}function j(t,e){if(t.push(e),!c.existsSync(e))return;let n;try{n=c.readdirSync(e,{withFileTypes:!0})}catch{return}for(let i of n)i.isDirectory()&&t.push(s.join(e,i.name))}function xt(t){let e=["Visual Studio Code.app","Visual Studio Code - Insiders.app","Cursor.app","VSCodium.app","Windsurf.app"];for(let n of e)t.push(s.join("/Applications",n,"Contents","Resources","app"),s.join(V.homedir(),"Applications",n,"Contents","Resources","app"))}function Ct(t){t.push("/usr/share/code/resources/app","/usr/lib/code/resources/app","/opt/visual-studio-code/resources/app","/opt/vscode/resources/app","/opt/vscodium/resources/app","/usr/share/vscodium/resources/app","/usr/share/code-insiders/resources/app","/opt/cursor/resources/app")}function St(t){let e=["code","code-insiders","cursor","codium","windsurf"],n=process.platform==="win32"?"where":"which";for(let i of e){let o="";try{o=Y.execFileSync(n,[i],{encoding:"utf8",stdio:["ignore","pipe","ignore"]})}catch{continue}for(let l of o.split(/\r?\n/)){let d=l.trim();if(!d)continue;let u=d;try{u=c.realpathSync(d)}catch{}if(!c.existsSync(u))continue;let h=s.dirname(u);t.push(h,s.resolve(h,"..")),process.platform==="darwin"&&h.endsWith(s.join("Contents","MacOS"))&&t.push(s.join(h,"..","..","Resources","app"))}}}function vt(t){let e=new Set,n=[];for(let i of t){if(!i||!c.existsSync(i))continue;let o=s.normalize(i),l=ot(o);e.has(l)||(e.add(l),n.push(o))}return n}function kt(t){for(let e of _(t))if(v(e))return e;for(let e of nt(t)){if(!c.existsSync(e))continue;let n=tt(e);if(n.length>0)return n[0]}}function _(t){return[s.join(t,"resources","app","out","vs","code","electron-browser","workbench","workbench.html"),s.join(t,"out","vs","code","electron-browser","workbench","workbench.html"),s.join(t,"resources","app","out","vs","workbench","workbench.html"),s.join(t,"out","vs","workbench","workbench.html")]}function Pt(t){let e=[],n;try{n=c.readdirSync(t,{withFileTypes:!0})}catch{return e}for(let i of n){if(!i.isDirectory())continue;let o=s.join(t,i.name);for(let l of[s.join(o,"resources","app","out","vs"),s.join(o,"out","vs")])c.existsSync(l)&&e.push(l)}return e}function tt(t){let e=[],n=[{directory:t,depth:0}],i=new Set(["node_modules",".git","extensions","locales"]),o=8e3,l=8,d=0;for(;n.length>0&&d<o;){let u=n.shift(),h;try{h=c.readdirSync(u.directory,{withFileTypes:!0})}catch{continue}for(let y of h){if(++d>o)break;let b=s.join(u.directory,y.name);y.isDirectory()?u.depth<l&&!i.has(y.name.toLowerCase())&&n.push({directory:b,depth:u.depth+1}):y.isFile()&&y.name.toLowerCase()==="workbench.html"&&e.push(b)}}return e.sort((u,h)=>c.statSync(h).mtimeMs-c.statSync(u).mtimeMs)}function v(t){try{return c.statSync(t).isFile()&&s.basename(t).toLowerCase()==="workbench.html"}catch{return!1}}function H(){let t=a.workspace.getConfiguration("jellyCursor").get("workbenchHtmlPath");if(!t||!t.trim())return;let e=Et(t.trim());return s.isAbsolute(e)?e:void 0}function Et(t){return t==="~"?V.homedir():t.startsWith("~/")||t.startsWith("~\\")?s.join(V.homedir(),t.slice(2)):t.replace(/%([^%]+)%/g,(e,n)=>process.env[n]??e)}async function U(){let t=K(),e=Mt(),n=r("Choose File...","\u9009\u62E9\u6587\u4EF6\u2026");if(await a.window.showWarningMessage(r("Jelly Cursor could not find workbench.html automatically.","Jelly Cursor \u672A\u80FD\u81EA\u52A8\u627E\u5230 workbench.html\u3002"),{modal:!0,detail:t},n,r("Cancel","\u53D6\u6D88"))===n)for(;;){let l=(await a.window.showOpenDialog({canSelectFiles:!0,canSelectFolders:!1,canSelectMany:!1,defaultUri:e?a.Uri.file(e):void 0,filters:{"workbench.html":["html"]},openLabel:r("Select workbench.html","\u9009\u62E9 workbench.html"),title:r("Select the FILE workbench.html (not its folder)","\u8BF7\u9009\u62E9 workbench.html \u6587\u4EF6\uFF08\u4E0D\u662F\u6587\u4EF6\u5939\uFF09")}))?.[0]?.fsPath;if(!l)return;if(v(l))return l;let d=r("Try Again","\u91CD\u8BD5");if(await a.window.showWarningMessage(r(`Invalid selection: ${l}`,`\u9009\u62E9\u65E0\u6548\uFF1A${l}`),{modal:!0,detail:t},d,r("Cancel","\u53D6\u6D88"))!==d)return}}function Mt(){for(let t of L()){let e=[s.join(t,"out","vs","code","electron-browser","workbench"),s.join(t,"resources","app","out","vs","code","electron-browser","workbench")];for(let n of e)if(c.existsSync(n))return n}return L()[0]}function K(t){let e=process.env.LOCALAPPDATA,n=process.env.ProgramFiles,i=e?`${e}\\Programs\\Microsoft VS Code\\resources\\app\\out\\vs\\code\\electron-browser\\workbench\\workbench.html`:"%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\resources\\app\\out\\vs\\code\\electron-browser\\workbench\\workbench.html",o=n?`${n}\\Microsoft VS Code\\resources\\app\\out\\vs\\code\\electron-browser\\workbench\\workbench.html`:"C:\\Program Files\\Microsoft VS Code\\resources\\app\\out\\vs\\code\\electron-browser\\workbench\\workbench.html",l=['Please choose the FILE named "workbench.html" (not its folder).',"","Inside the VS Code installation, navigate to:","resources > app > out > vs > code > electron-browser > workbench","","Typical paths:",`- Windows (user install): ${i}`,`- Windows (system install): ${o}`,"- macOS: /Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html","- Linux: /usr/share/code/resources/app/out/vs/code/electron-browser/workbench/workbench.html","",'Note: some installs add a version-number folder between "Microsoft VS Code" and "resources".',"","\u4E2D\u6587\u8BF4\u660E\uFF1A","1. \u9009\u62E9\u540D\u4E3A workbench.html \u7684\u6587\u4EF6\uFF08\u4E0D\u662F\u9009\u62E9\u6587\u4EF6\u5939\uFF09\u3002","2. \u4F9D\u6B21\u8FDB\u5165 resources \u2192 app \u2192 out \u2192 vs \u2192 code \u2192 electron-browser \u2192 workbench\u3002","3. \u4E5F\u53EF\u4EE5\u5728\u8BBE\u7F6E\u4E2D\u628A jellyCursor.workbenchHtmlPath \u914D\u7F6E\u4E3A workbench.html \u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u4E4B\u540E\u4E0D\u4F1A\u518D\u5F39\u51FA\u6B64\u7A97\u53E3\u3002"];return t&&l.unshift(`The configured path does not point to a valid workbench.html file: ${t}`,""),l.join(`
`)}function D(t){return t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function T(t,e,n){return t.replace(new RegExp(`${D(e)}[\\s\\S]*?${D(n)}\\s*`),"")}function $t(t,e){let n=`${t}${$}`;c.existsSync(n)||S(n,e)}function S(t,e,n="utf8"){let i=s.dirname(t),o=s.join(i,`.${s.basename(t)}.jelly-cursor-tmp-${process.pid}-${Date.now()}`);try{c.writeFileSync(o,e,{encoding:n,flag:"w"}),c.renameSync(o,t)}catch(l){try{c.existsSync(o)&&c.unlinkSync(o)}catch{}throw l}}function m(t){return t instanceof Error?t.message:String(t)}function w(t,e,n){let i=e.code,o=[];i==="EACCES"||i==="EPERM"?(o.push(r("You do not have write permission for the VS Code installation directory.","\u4F60\u6CA1\u6709 VS Code \u5B89\u88C5\u76EE\u5F55\u7684\u5199\u5165\u6743\u9650\u3002")),o.push(r("Run VS Code as administrator once, or switch to a per-user VS Code installation.","\u8BF7\u4EE5\u7BA1\u7406\u5458\u8EAB\u4EFD\u8FD0\u884C\u4E00\u6B21 VS Code\uFF0C\u6216\u6539\u7528\u7528\u6237\u7EA7\u5B89\u88C5\u7684 VS Code\u3002"))):i==="ENOENT"?(o.push(r("The file or directory no longer exists. VS Code may have been updated or moved.","\u6587\u4EF6\u6216\u76EE\u5F55\u4E0D\u5B58\u5728\uFF0CVS Code \u53EF\u80FD\u5DF2\u66F4\u65B0\u6216\u79FB\u52A8\u3002")),o.push(r("Run the command again and select the current workbench.html when prompted.","\u8BF7\u91CD\u65B0\u6267\u884C\u547D\u4EE4\uFF0C\u5E76\u5728\u63D0\u793A\u65F6\u9009\u62E9\u5F53\u524D\u7684 workbench.html\u3002"))):i==="EBUSY"&&(o.push(r("The file is locked by another process.","\u6587\u4EF6\u88AB\u5176\u4ED6\u8FDB\u7A0B\u5360\u7528\u3002")),o.push(r("Close other VS Code windows and try again.","\u8BF7\u5173\u95ED\u5176\u4ED6 VS Code \u7A97\u53E3\u540E\u91CD\u8BD5\u3002")));let l=[r(`Failed while ${t}.`,`\u6267\u884C ${t} \u65F6\u5931\u8D25\u3002`),n?r(`File: ${n}`,`\u6587\u4EF6\uFF1A${n}`):"",r(`Error: ${m(e)}`,`\u9519\u8BEF\uFF1A${m(e)}`),i?r(`Code: ${i}`,`\u4EE3\u7801\uFF1A${i}`):"","",...o,r('If workbench.html appears damaged, use "Jelly Cursor: Restore workbench.html Backup".',"\u5982\u679C workbench.html \u770B\u8D77\u6765\u5DF2\u635F\u574F\uFF0C\u8BF7\u4F7F\u7528\u201CJelly Cursor: Restore workbench.html Backup\u201D\u6062\u590D\u3002")].filter(Boolean);f(`operation failed (${t}): ${m(e)}`),a.window.showErrorMessage(r("Jelly Cursor operation failed.","Jelly Cursor \u64CD\u4F5C\u5931\u8D25\u3002"),{modal:!0,detail:l.join(`
`)},"OK")}async function At(){let t;try{t=Dt()}catch(b){w("scanning for workbench.html files",b);return}if(t.length===0){a.window.showErrorMessage(r("No workbench.html files were found on this machine.","\u5728\u8FD9\u53F0\u673A\u5668\u4E0A\u6CA1\u6709\u627E\u5230 workbench.html\u3002"),{modal:!0,detail:K()},"OK");return}f(`status: found ${t.length} workbench.html file(s)`);let e=t.map(b=>I(b)),n=e.map(b=>({label:`${b.patched?"$(check)":"$(circle-outline)"} ${b.filePath}`,description:Rt(b)})),i=await a.window.showQuickPick(n,{title:r("Jelly Cursor: workbench.html status","Jelly Cursor\uFF1Aworkbench.html \u72B6\u6001"),placeHolder:r("Select a workbench.html file to see details","\u9009\u62E9\u4E00\u4E2A workbench.html \u67E5\u770B\u8BE6\u60C5"),matchOnDescription:!0});if(!i)return;let o=e[n.indexOf(i)];if(!o)return;let l=r("Copy Path","\u590D\u5236\u8DEF\u5F84"),d=r("Uninstall Patch","\u5378\u8F7D\u8865\u4E01"),u=r("Restore Backup","\u6062\u590D\u5907\u4EFD"),h=[l];o.patched&&h.unshift(d),o.backupExists&&h.unshift(u);let y=await a.window.showInformationMessage(o.filePath,{modal:!0,detail:Vt(o)},...h);y===l?(await a.env.clipboard.writeText(o.filePath),a.window.showInformationMessage(r("Path copied to clipboard.","\u8DEF\u5F84\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\u3002"))):y===u?await et(o.filePath):y===d&&await X(o.filePath)}function I(t){let e=s.dirname(t),n=s.join(e,M),i=s.join(e,F),o="",l;try{o=c.readFileSync(t,"utf8")}catch(h){l=m(h)}let d=o.includes(P),u=o.includes(B);return{filePath:t,jellyPatched:d,legacyPatched:u,patched:d||u,scriptExists:c.existsSync(n),legacyScriptExists:c.existsSync(i),backupExists:c.existsSync(`${t}${$}`),readError:l}}function Rt(t){let e=[t.readError?r("unreadable","\u4E0D\u53EF\u8BFB"):t.patched?r("patched","\u5DF2\u6253\u8865\u4E01"):r("clean","\u5E72\u51C0")];return(t.scriptExists||t.legacyScriptExists)&&e.push(r("script present","\u811A\u672C\u5B58\u5728")),t.backupExists&&e.push(r("backup present","\u5907\u4EFD\u5B58\u5728")),e.join(" \xB7 ")}function Vt(t){return[r(`Status: ${t.readError?`unreadable (${t.readError})`:t.patched?"patched":"clean"}`,`\u72B6\u6001\uFF1A${t.readError?`\u4E0D\u53EF\u8BFB\uFF08${t.readError}\uFF09`:t.patched?"\u5DF2\u6253\u8865\u4E01":"\u5E72\u51C0"}`),r(`Jelly Cursor markers: ${t.jellyPatched?"present":"none"}`,`Jelly Cursor \u6807\u8BB0\uFF1A${t.jellyPatched?"\u5B58\u5728":"\u65E0"}`),r(`Legacy markers: ${t.legacyPatched?"present":"none"}`,`\u65E7\u7248\u6807\u8BB0\uFF1A${t.legacyPatched?"\u5B58\u5728":"\u65E0"}`),r(`Injected script: ${t.scriptExists?"present":"none"}`,`\u6CE8\u5165\u811A\u672C\uFF1A${t.scriptExists?"\u5B58\u5728":"\u65E0"}`),r(`Legacy script: ${t.legacyScriptExists?"present":"none"}`,`\u65E7\u7248\u811A\u672C\uFF1A${t.legacyScriptExists?"\u5B58\u5728":"\u65E0"}`),r(`Backup: ${t.backupExists?`${t.filePath}${$}`:"not created"}`,`\u5907\u4EFD\uFF1A${t.backupExists?`${t.filePath}${$}`:"\u672A\u521B\u5EFA"}`),"",r("Restart VS Code after install, uninstall, or restore for changes to take effect.","\u5B89\u88C5\u3001\u5378\u8F7D\u6216\u6062\u590D\u540E\u9700\u8981\u91CD\u542F VS Code \u624D\u80FD\u751F\u6548\u3002")].join(`
`)}async function Lt(){let t;try{t=await z()}catch(e){w("finding workbench.html",e);return}if(!t){a.window.showErrorMessage(r("Cannot find VS Code workbench.html.","\u627E\u4E0D\u5230 VS Code \u7684 workbench.html\u3002"));return}await et(t)}async function et(t){let e=`${t}${$}`;if(f(`restore: checking backup for ${t}`),!c.existsSync(e)){a.window.showErrorMessage(r("No Jelly Cursor backup exists for this workbench.html.","\u8FD9\u4E2A workbench.html \u6CA1\u6709 Jelly Cursor \u5907\u4EFD\u3002"),{modal:!0,detail:r(`The backup is only created the first time the patch is installed.

File: ${t}
Expected backup: ${e}`,`\u5907\u4EFD\u53EA\u5728\u7B2C\u4E00\u6B21\u5B89\u88C5\u8865\u4E01\u65F6\u521B\u5EFA\u3002

\u6587\u4EF6\uFF1A${t}
\u5E94\u6709\u5907\u4EFD\uFF1A${e}`)},"OK");return}let n;try{n=c.readFileSync(e,"utf8")}catch(d){f(`restore: cannot read backup: ${m(d)}`),w("reading the workbench.html backup",d,e);return}let i=r("Restore","\u6062\u590D");if(await a.window.showWarningMessage(r("Restore workbench.html from the Jelly Cursor backup?","\u8981\u7528 Jelly Cursor \u5907\u4EFD\u6062\u590D workbench.html \u5417\uFF1F"),{modal:!0,detail:r(`This replaces:
${t}

with the backup:
${e}

Injected script files next to it will be removed. Restart VS Code afterwards.`,`\u5C06\u7528\u5907\u4EFD\uFF1A
${e}

\u66FF\u6362\uFF1A
${t}

\u5E76\u5220\u9664\u65C1\u8FB9\u7684\u6CE8\u5165\u811A\u672C\u3002\u4E4B\u540E\u9700\u8981\u91CD\u542F VS Code\u3002`)},i,r("Cancel","\u53D6\u6D88"))!==i)return;let l=s.dirname(t);try{S(t,n);for(let d of[s.join(l,M),s.join(l,F)])if(c.existsSync(d))try{c.unlinkSync(d)}catch{}}catch(d){f(`restore failed: ${m(d)}`),w("restoring the workbench.html backup",d,t);return}f(`restore: restored ${t}`),A(),await O(r(`workbench.html restored from ${e}. Restart VS Code to finish.`,`\u5DF2\u4ECE ${e} \u6062\u590D workbench.html\u3002\u91CD\u542F VS Code \u5B8C\u6210\u6062\u590D\u3002`))}function Dt(){let t=[],e=H();e&&t.push(e);for(let n of L())t.push(...Ft(n));return rt(t.filter(n=>v(n)))}function Ft(t){let e=_(t).filter(n=>v(n));for(let n of nt(t))c.existsSync(n)&&e.push(...tt(n));return rt(e)}function nt(t){let e=[s.join(t,"resources","app","out","vs"),s.join(t,"out","vs")];if(!e.some(n=>c.existsSync(n))){let n=Pt(t);n.length>0?e.push(...n):e.push(t)}return e}function rt(t){let e=new Set,n=[];for(let i of t){if(!i)continue;let o=ot(i);e.has(o)||(e.add(o),n.push(s.normalize(i)))}return n}function ot(t){let e=s.normalize(t);return process.platform==="win32"?e.toLowerCase():e}function It(){let t=a.workspace.getConfiguration("jellyCursor"),e=a.workspace.getConfiguration("newNeovideCursor");return{fastSpeed:g(p(t,e,"fastSpeed",.42),.01,1),midSpeed:g(p(t,e,"midSpeed",.24),.01,1),slowSpeed:g(p(t,e,"slowSpeed",.1),.01,1),axisBias:g(p(t,e,"axisBias",.45),0,1),twistBoost:g(p(t,e,"twistBoost",p(t,e,"topEdgeBoost",.16)),0,.6),minAlpha:g(p(t,e,"minAlpha",.03),0,1),cursorColor:p(t,e,"cursorColor","#ffffff"),glowColor:p(t,e,"glowColor","#ffffff"),glowEnabled:p(t,e,"glowEnabled",!0),glowOpacity:g(p(t,e,"glowOpacity",.9),0,1),glowIntensity:g(p(t,e,"glowIntensity",1.8),0,5),glowSize:g(p(t,e,"glowSize",18),0,40),animationMode:jt(p(t,e,"animationMode","full")),maxJumpAnimationDistance:g(p(t,e,"maxJumpAnimationDistance",0),0,1e4),effectPreset:Wt(p(t,e,"effectPreset","custom")),shapeStyle:Tt(p(t,e,"shapeStyle","native")),trailEnabled:p(t,e,"trailEnabled",!1),trailLength:Math.round(g(p(t,e,"trailLength",5),0,12)),trailOpacity:g(p(t,e,"trailOpacity",.35),0,1),springEnabled:p(t,e,"springEnabled",!1),springStiffness:g(p(t,e,"springStiffness",.16),.05,.4),springDamping:g(p(t,e,"springDamping",.78),.5,.95),rainbowEnabled:p(t,e,"rainbowEnabled",!1),gradientEnabled:p(t,e,"gradientEnabled",!1),rippleEnabled:p(t,e,"rippleEnabled",!0),landingPulseEnabled:p(t,e,"landingPulseEnabled",!0),sparkEnabled:p(t,e,"sparkEnabled",!0),sparkAmount:g(p(t,e,"sparkAmount",.5),0,1)}}function jt(t){return t==="smooth"||t==="off"?t:"full"}function Wt(t){return t==="minimal"||t==="neon"||t==="aurora"||t==="matrix"||t==="comet"?t:"custom"}function Tt(t){return t==="rounded"||t==="capsule"?t:"native"}function p(t,e,n,i){return t.get(n,e.get(n,i))}function g(t,e,n){return Math.min(n,Math.max(e,t))}function Bt(t){return String.raw`
(() => {
	const rawConfig = {
		fallbackColor: '#8fd3ff',
		fastSpeed: ${t.fastSpeed},
		midSpeed: ${t.midSpeed},
		slowSpeed: ${t.slowSpeed},
		axisBias: ${t.axisBias},
		twistBoost: ${t.twistBoost},
		minAlpha: ${t.minAlpha},
		cursorColor: ${JSON.stringify(t.cursorColor)},
		glowColor: ${JSON.stringify(t.glowColor)},
		glowEnabled: ${t.glowEnabled},
		glowOpacity: ${t.glowOpacity},
		glowIntensity: ${t.glowIntensity},
		glowSize: ${t.glowSize},
		animationMode: ${JSON.stringify(t.animationMode)},
		maxJumpAnimationDistance: ${t.maxJumpAnimationDistance},
		effectPreset: ${JSON.stringify(t.effectPreset)},
		shapeStyle: ${JSON.stringify(t.shapeStyle)},
		trailEnabled: ${t.trailEnabled},
		trailLength: ${t.trailLength},
		trailOpacity: ${t.trailOpacity},
		springEnabled: ${t.springEnabled},
		springStiffness: ${t.springStiffness},
		springDamping: ${t.springDamping},
		rainbowEnabled: ${t.rainbowEnabled},
		gradientEnabled: ${t.gradientEnabled},
		rippleEnabled: ${t.rippleEnabled},
		landingPulseEnabled: ${t.landingPulseEnabled},
		sparkEnabled: ${t.sparkEnabled},
		sparkAmount: ${t.sparkAmount},
	};

	const presetEffects = {
		minimal: {
			trailEnabled: false,
			trailLength: 0,
			springEnabled: false,
			glowEnabled: false,
			rainbowEnabled: false,
			gradientEnabled: false,
			rippleEnabled: false,
			landingPulseEnabled: false,
			sparkEnabled: false,
		},
		neon: {
			trailEnabled: true,
			trailLength: 5,
			trailOpacity: 0.38,
			springEnabled: true,
			springStiffness: 0.18,
			springDamping: 0.74,
			glowEnabled: true,
			glowIntensity: 2.3,
			glowSize: 26,
			glowOpacity: 1,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 0.5,
			gradientEnabled: true,
		},
		aurora: {
			trailEnabled: true,
			trailLength: 8,
			trailOpacity: 0.32,
			springEnabled: true,
			springStiffness: 0.15,
			springDamping: 0.8,
			glowEnabled: true,
			glowIntensity: 2,
			glowSize: 30,
			rainbowEnabled: true,
			gradientEnabled: true,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 0.5,
		},
		matrix: {
			cursorColor: '#00ff41',
			glowColor: '#00ff41',
			trailEnabled: false,
			trailLength: 0,
			glowEnabled: true,
			glowIntensity: 2.6,
			glowSize: 22,
			gradientEnabled: true,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 0.7,
			shapeStyle: 'native',
		},
		comet: {
			trailEnabled: true,
			trailLength: 12,
			trailOpacity: 0.55,
			springEnabled: true,
			springStiffness: 0.2,
			springDamping: 0.7,
			glowEnabled: true,
			glowIntensity: 1.8,
			glowSize: 24,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 1,
		},
	};

	const config = {
		...rawConfig,
		...(presetEffects[rawConfig.effectPreset] || {}),
	};

	const style = document.createElement('style');
	style.textContent = [
		'.jelly-cursor-layer {',
		'	position: fixed;',
		'	inset: 0;',
		'	pointer-events: none;',
		'	z-index: 2147483647;',
		'	overflow: visible;',
		'}',
		'.jelly-cursor-svg {',
		'	position: absolute;',
		'	inset: 0;',
		'	width: 100%;',
		'	height: 100%;',
		'	overflow: visible;',
		'	pointer-events: none;',
		'}',
		'html body .monaco-editor .cursors-layer .cursor {',
		'	filter: opacity(0) !important;',
		'	pointer-events: none !important;',
		'}',
	].join('\n');
	document.head.appendChild(style);

	const overlay = createOverlay();
	const states = [];
	const stateByCursor = new Map();
	const effects = [];
	let frameId = 0;
	let nextCursorId = 0;

	function createOverlay() {
		const layer = document.createElement('div');
		layer.className = 'jelly-cursor-layer';
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.classList.add('jelly-cursor-svg');
		layer.appendChild(svg);

		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
		gradient.setAttribute('id', 'jellyCursorCursorGradient');
		gradient.setAttribute('x1', '0');
		gradient.setAttribute('y1', '0');
		gradient.setAttribute('x2', '0');
		gradient.setAttribute('y2', '1');
		const topStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		topStop.setAttribute('offset', '0%');
		const bottomStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		bottomStop.setAttribute('offset', '100%');
		gradient.appendChild(topStop);
		gradient.appendChild(bottomStop);
		defs.appendChild(gradient);
		svg.appendChild(defs);
		document.body.appendChild(layer);

		return {
			layer,
			svg,
			gradient,
			topStop,
			bottomStop,
		};
	}

	function getOrCreateCursorState(cursor, targetPoints, seen) {
		let cursorKey = cursor.dataset.jellyCursorId;

		if (!cursorKey) {
			cursorKey = 'jelly-cursor-' + (++nextCursorId);
			cursor.dataset.jellyCursorId = cursorKey;
		}

		let state = stateByCursor.get(cursorKey);

		if (!state) {
			state = createCursorState();
			states.push(state);
			state.cursorKey = cursorKey;
			stateByCursor.set(cursorKey, state);

			const nearestState = findNearestStartedState(targetPoints, seen);
			state.points = nearestState ? clonePoints(nearestState.points) : clonePoints(targetPoints);
			state.started = true;
		} else if (state.missedFrames > 0 && state.lastVisiblePoints.length === 4) {
			state.points = clonePoints(state.lastVisiblePoints);
			state.velocity = [];
			state.trail = [];
			state.trailFade = 0;
			state.lastTrailCenter = null;
			state.justLanded = true;
		}

		return state;
	}

	function createCursorState() {
		const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		shape.setAttribute('vector-effect', 'non-scaling-stroke');
		shape.setAttribute('fill-rule', 'nonzero');
		overlay.svg.appendChild(shape);

		return {
			shape,
			cursorKey: null,
			editor: null,
			targetX: 0,
			targetY: 0,
			width: 2,
			height: 18,
			visual: null,
			movement: 0,
			started: false,
			points: [],
			lastVisiblePoints: [],
			velocity: [],
			trail: [],
			trailPaths: [],
			trailFade: 0,
			lastTrailCenter: null,
			justLanded: false,
			missedFrames: 0,
			seen: 0,
		};
	}

	function updateTargets() {
		const seen = ++frameId;
		const cursors = Array.from(document.querySelectorAll('.monaco-editor .cursors-layer .cursor'))
			.filter((cursor) => {
				const editor = cursor.closest('.monaco-editor');
				const rect = cursor.getBoundingClientRect();

				return editor && isVisible(editor) && isInsideViewport(rect) && rect.width > 0 && rect.height > 0;
			})
			.sort(compareCursors);

		for (const cursor of cursors) {
			const editor = cursor.closest('.monaco-editor');

			if (!editor) {
				continue;
			}

			const cursorRect = cursor.getBoundingClientRect();
			const x = cursorRect.left;
			const y = cursorRect.top;
			const width = cursorRect.width;
			const height = cursorRect.height;

			if (!Number.isFinite(x) || !Number.isFinite(y) || height <= 0) {
				continue;
			}

			const targetPoints = getBoxPoints(x, y, width, height);
			const state = getOrCreateCursorState(cursor, targetPoints, seen);

			state.editor = editor;
			state.targetX = x;
			state.targetY = y;
			state.width = width;
			state.height = height;
			state.visual = readCursorVisual(cursor);
			state.seen = seen;
			state.missedFrames = 0;
		}
	}

	function compareCursors(left, right) {
		const leftEditor = left.closest('.monaco-editor');
		const rightEditor = right.closest('.monaco-editor');
		const activeEditor = document.querySelector('.monaco-editor.focused') || document.activeElement?.closest?.('.monaco-editor');

		if (leftEditor === activeEditor && rightEditor !== activeEditor) {
			return -1;
		}

		if (rightEditor === activeEditor && leftEditor !== activeEditor) {
			return 1;
		}

		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();

		return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
	}

	let lastFrameTimestamp = 0;

	function tick(timestamp) {
		const now = typeof timestamp === 'number' ? timestamp : Date.now();
		const dt = clampValue(lastFrameTimestamp ? now - lastFrameTimestamp : 16, 0, 50);
		lastFrameTimestamp = now;

		updateTargets();

		for (const state of states) {
			if (!state.started || state.seen !== frameId || !state.editor || !isVisible(state.editor)) {
				hideCursorState(state);
				continue;
			}

			const targetPoints = getTargetPoints(state);
			let currentPoints = state.points.length === 4 ? state.points : targetPoints;
			currentPoints = clampJumpDistance(currentPoints, targetPoints);
			const currentCenter = getCenter(currentPoints);
			const targetCenter = getCenter(targetPoints);
			const distance = Math.hypot(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y);

			if (config.animationMode === 'off') {
				state.points = clonePoints(targetPoints);
				state.movement = 0;
				place(state);
				continue;
			}

			if (config.trailEnabled && config.trailLength > 0) {
				if (distance > 1) {
					pushCursorTrail(state, currentPoints);
					state.trailFade = Math.min(1, state.trailFade + dt * 0.004);
				} else {
					state.trailFade = Math.max(0, state.trailFade - dt * 0.0035);

					if (state.trailFade <= 0) {
						state.trail = [];
						state.lastTrailCenter = null;
					}
				}
			}

			if (isSettled(currentPoints, targetPoints)) {
				state.points = clonePoints(targetPoints);
				state.movement = distance;
				place(state);
				continue;
			}

			const baseSpeed = getBaseSpeed(distance);
			const maxCornerStep = getMaxCornerStep(state, baseSpeed);
			const speeds = config.animationMode === 'smooth'
				? currentPoints.map(() => baseSpeed)
				: getCornerSpeeds(currentPoints, targetPoints);

			const nextPoints = config.springEnabled && config.animationMode === 'full'
				? springStep(state, currentPoints, targetPoints)
				: currentPoints.map((point, index) => {
					const target = targetPoints[index];
					const dx = target.x - point.x;
					const dy = target.y - point.y;
					const cornerDistance = Math.hypot(dx, dy);

					if (cornerDistance < 0.01) {
						return { x: target.x, y: target.y };
					}

					const speedDifference = speeds[index] - baseSpeed;
					const speedOffset = cornerDistance * speedDifference;
					const extraStep = clampValue(speedOffset, -maxCornerStep, maxCornerStep);
					const rawStep = cornerDistance * baseSpeed + extraStep;
					const minStep = cornerDistance * 0.02;
					const step = Math.min(
						cornerDistance,
						Math.abs(speedOffset) > maxCornerStep ? Math.max(rawStep, minStep) : rawStep
					);

					return {
						x: point.x + (dx / cornerDistance) * step,
						y: point.y + (dy / cornerDistance) * step,
					};
				});

			state.points = keepSimpleQuad(nextPoints, currentPoints, targetPoints);
			state.movement = distance;

			place(state);

			if (state.justLanded) {
				state.justLanded = false;

				if (config.landingPulseEnabled) {
					spawnLandingPulse(getCenter(targetPoints));
				}
			}

			if (config.sparkEnabled && config.sparkAmount > 0 && distance > 6) {
				spawnSparks(state, currentCenter, targetCenter, dt);
			}
		}

		updateEffects(dt);

		if (frameId % 30 === 0) {
			document.head.appendChild(style);
		}

		requestAnimationFrame(tick);
	}

	function pushCursorTrail(state, points) {
		const center = getCenter(points);

		if (state.lastTrailCenter && Math.hypot(center.x - state.lastTrailCenter.x, center.y - state.lastTrailCenter.y) < 1.5) {
			return;
		}

		state.trail.unshift(clonePoints(points));

		if (state.trail.length > config.trailLength) {
			state.trail.pop();
		}

		state.lastTrailCenter = center;
	}

	function getCornerLeadFactors(currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const dx = targetCenter.x - currentCenter.x;
		const dy = targetCenter.y - currentCenter.y;
		const distance = Math.hypot(dx, dy);

		if (distance < 0.01) {
			return currentPoints.map(() => 0);
		}

		const direction = { x: dx / distance, y: dy / distance };
		const tangent = { x: -direction.y, y: direction.x };
		const twistScale = Math.min(1, distance / 30);

		return currentPoints.map((point) => {
			const cornerVector = getCornerVector(point, currentCenter);
			const diagonalLead = dot(cornerVector, direction);
			const axisLead = getAxisLead(cornerVector, direction);
			const lead = clampValue(diagonalLead * (1 - config.axisBias) + axisLead * config.axisBias, -1, 1);
			const twist = -dot(cornerVector, tangent) * config.twistBoost * 0.45 * twistScale;

			return clampValue(lead + twist, -1, 1);
		});
	}

	function springStep(state, currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const dx = targetCenter.x - currentCenter.x;
		const dy = targetCenter.y - currentCenter.y;
		const distance = Math.hypot(dx, dy);
		const direction = distance < 0.01 ? { x: 0, y: 0 } : { x: dx / distance, y: dy / distance };
		const leadFactors = getCornerLeadFactors(currentPoints, targetPoints);
		const maxStretch = clampValue(Math.max(state.width, state.height, 8) * 0.9, 6, 30);
		const stretch = Math.min(distance * 0.25, maxStretch);
		const velocity = state.velocity.length === 4
			? state.velocity
			: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

		const nextPoints = currentPoints.map((point, index) => {
			const shiftedTarget = {
				x: targetPoints[index].x + direction.x * leadFactors[index] * stretch,
				y: targetPoints[index].y + direction.y * leadFactors[index] * stretch,
			};
			const currentVelocity = velocity[index];
			const nextVelocity = {
				x: (currentVelocity.x + (shiftedTarget.x - point.x) * config.springStiffness) * config.springDamping,
				y: (currentVelocity.y + (shiftedTarget.y - point.y) * config.springStiffness) * config.springDamping,
			};

			return {
				x: point.x + nextVelocity.x,
				y: point.y + nextVelocity.y,
			};
		});

		state.velocity = nextPoints.map((point, index) => ({
			x: point.x - currentPoints[index].x,
			y: point.y - currentPoints[index].y,
		}));

		return nextPoints;
	}

	function createEffectCircle(x, y, radius) {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(x));
		circle.setAttribute('cy', String(y));
		circle.setAttribute('r', String(radius));
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', config.fallbackColor);
		circle.setAttribute('stroke-width', '2');
		circle.setAttribute('pointer-events', 'none');
		overlay.svg.appendChild(circle);

		return circle;
	}

	function spawnRipple(x, y) {
		if (!config.rippleEnabled || config.animationMode === 'off') {
			return;
		}

		const circle = createEffectCircle(x, y, 4);
		effects.push({
			kind: 'ripple',
			element: circle,
			x,
			y,
			radius: 4,
			speed: 1.4,
			life: 1,
		});
	}

	function spawnLandingPulse(center) {
		if (config.animationMode === 'off') {
			return;
		}

		const circle = createEffectCircle(center.x, center.y, 6);
		circle.setAttribute('fill', withAlpha(config.glowColor || config.fallbackColor, 0.16));
		effects.push({
			kind: 'pulse',
			element: circle,
			x: center.x,
			y: center.y,
			radius: 6,
			speed: 2.2,
			life: 1,
		});
	}

	function spawnSparks(state, currentCenter, targetCenter, dt) {
		const amount = config.sparkAmount;
		const direction = normalize({ x: targetCenter.x - currentCenter.x, y: targetCenter.y - currentCenter.y });
		const count = Math.min(3, Math.max(1, Math.round(amount * 3)));
		const base = dt / 16.7;

		for (let index = 0; index < count; index++) {
			if (Math.random() > amount) {
				continue;
			}

			const behind = 4 + Math.random() * 10;
			const jitter = 3 + Math.random() * 5;
			const x = currentCenter.x - direction.x * behind + (Math.random() - 0.5) * jitter * 2;
			const y = currentCenter.y - direction.y * behind + (Math.random() - 0.5) * jitter * 2;
			const circle = createEffectCircle(x, y, 0.8 + Math.random() * 1.6);
			circle.setAttribute('fill', withAlpha(config.glowColor || config.fallbackColor, 0.95));

			effects.push({
				kind: 'spark',
				element: circle,
				x,
				y,
				vx: (-direction.x * (1 + Math.random() * 2) + (Math.random() - 0.5) * 1.5) * base,
				vy: (-direction.y * (1 + Math.random() * 2) + (Math.random() - 0.5) * 1.5) * base,
				life: 1,
			});
		}
	}

	function updateEffects(dt) {
		const timeScale = dt / 16.7;

		for (let index = effects.length - 1; index >= 0; index--) {
			const effect = effects[index];

			effect.life -= timeScale / (effect.kind === 'spark' ? 34 : 28);

			if (effect.kind === 'spark') {
				effect.x += effect.vx;
				effect.y += effect.vy;
				effect.vx *= 0.94;
				effect.vy *= 0.94;
				effect.element.setAttribute('cx', effect.x.toFixed(2));
				effect.element.setAttribute('cy', effect.y.toFixed(2));
			} else {
				effect.radius += effect.speed * timeScale;
				effect.element.setAttribute('r', effect.radius.toFixed(2));
			}

			const opacity = clampValue(effect.life, 0, 1) * (effect.kind === 'spark' ? 0.95 : 0.85);
			effect.element.setAttribute('opacity', String(opacity));

			if (effect.life <= 0) {
				effect.element.remove();
				effects.splice(index, 1);
			}
		}
	}

	function isVisible(element) {
		const rect = element.getBoundingClientRect();

		return rect.width > 0 && rect.height > 0;
	}

	function isInsideViewport(rect) {
		const margin = 1;

		return rect.bottom >= -margin && rect.right >= -margin && rect.top <= window.innerHeight + margin && rect.left <= window.innerWidth + margin;
	}

	function isSettled(currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);

		if (Math.hypot(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y) >= 0.5) {
			return false;
		}

		return currentPoints.every((point, index) => {
			const target = targetPoints[index];

			return Math.hypot(target.x - point.x, target.y - point.y) < 0.5;
		});
	}

	function clampJumpDistance(currentPoints, targetPoints) {
		const maxDistance = config.maxJumpAnimationDistance;

		if (!maxDistance || maxDistance <= 0 || currentPoints.length !== 4) {
			return currentPoints;
		}

		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const jumpDistance = Math.hypot(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y);

		if (jumpDistance <= maxDistance) {
			return currentPoints;
		}

		const scale = maxDistance / jumpDistance;

		return currentPoints.map((point, index) => {
			const target = targetPoints[index];

			return {
				x: target.x + (point.x - target.x) * scale,
				y: target.y + (point.y - target.y) * scale,
			};
		});
	}

	function getBaseSpeed(distance) {
		return clampValue(config.midSpeed + Math.min(0.16, distance / 900), 0.01, 1);
	}

	function getMaxCornerStep(state, baseSpeed) {
		const maxSideLag = clampValue(Math.max(state.width, state.height, 8) * 1.5, 8, 48);

		return maxSideLag * baseSpeed;
	}

	function hideCursorState(state) {
		state.missedFrames++;
		state.trail = [];
		state.trailFade = 0;
		state.lastTrailCenter = null;
		state.shape.setAttribute('visibility', 'hidden');
		state.shape.style.filter = 'none';

		for (const trailPath of state.trailPaths) {
			trailPath.setAttribute('visibility', 'hidden');
		}
	}

	function findNearestStartedState(targetPoints, seen) {
		let nearest = null;
		let nearestDistance = Number.POSITIVE_INFINITY;
		const targetCenter = getCenter(targetPoints);

		for (const state of states) {
			if (!state.started || state.points.length !== 4 || state.seen === 0 || seen - state.seen > 1) {
				continue;
			}

			const center = getCenter(state.points);
			const distance = Math.hypot(targetCenter.x - center.x, targetCenter.y - center.y);

			if (distance < nearestDistance) {
				nearest = state;
				nearestDistance = distance;
			}
		}

		return nearest;
	}

	function clonePoints(points) {
		return points.map((point) => ({ x: point.x, y: point.y }));
	}

	function readCursorVisual(cursor) {
		const style = getComputedStyle(cursor);
		const nativeBackgroundColor = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
			? style.backgroundColor
			: config.fallbackColor;
		const backgroundColor = config.cursorColor || nativeBackgroundColor;

		return {
			opacity: Number.parseFloat(style.opacity || '1'),
			visibility: style.visibility,
			backgroundColor,
			border: style.border,
			borderColor: style.borderColor,
			borderRadius: style.borderRadius,
			outline: style.outline,
			boxShadow: style.boxShadow && style.boxShadow !== 'none' ? style.boxShadow : '0 0 10px ' + backgroundColor,
		};
	}

	function getTargetPoints(state) {
		const x = state.targetX;
		const y = state.targetY;
		const width = Math.max(1, state.width);
		const height = Math.max(1, state.height);

		return getBoxPoints(x, y, width, height);
	}

	function getBoxPoints(x, y, width, height) {
		return [
			{ x, y },
			{ x: x + width, y },
			{ x: x + width, y: y + height },
			{ x, y: y + height },
		];
	}

	function getCornerSpeeds(currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const dx = targetCenter.x - currentCenter.x;
		const dy = targetCenter.y - currentCenter.y;
		const distance = Math.hypot(dx, dy);

		if (distance < 0.01) {
			return currentPoints.map(() => config.midSpeed);
		}

		const direction = {
			x: dx / distance,
			y: dy / distance,
		};
		const tangent = {
			x: -direction.y,
			y: direction.x,
		};
		const twistScale = Math.min(1, distance / 30);
		const distanceBoost = Math.min(0.16, distance / 900);

		return currentPoints.map((point) => {
			const cornerVector = getCornerVector(point, currentCenter);
			const diagonalLead = dot(cornerVector, direction);
			const axisLead = getAxisLead(cornerVector, direction);
			const lead = clampValue(diagonalLead * (1 - config.axisBias) + axisLead * config.axisBias, -1, 1);
			const twist = -dot(cornerVector, tangent) * config.twistBoost * 0.45 * twistScale;
			const directionalSpeed = lead >= 0
				? config.midSpeed + (config.fastSpeed - config.midSpeed) * lead
				: config.midSpeed + (config.slowSpeed - config.midSpeed) * -lead;

			return clampValue(directionalSpeed + twist + distanceBoost, 0.01, 1);
		});
	}

	function getCornerVector(point, center) {
		return normalize({
			x: Math.sign(point.x - center.x),
			y: Math.sign(point.y - center.y),
		});
	}

	function getAxisLead(cornerVector, direction) {
		const horizontalWeight = Math.abs(direction.x);
		const verticalWeight = Math.abs(direction.y);
		const total = horizontalWeight + verticalWeight || 1;
		const horizontalLead = horizontalWeight === 0 ? 0 : Math.sign(cornerVector.x) * Math.sign(direction.x) * horizontalWeight;
		const verticalLead = verticalWeight === 0 ? 0 : Math.sign(cornerVector.y) * Math.sign(direction.y) * verticalWeight;

		return (horizontalLead + verticalLead) / total;
	}

	function keepSimpleQuad(nextPoints, currentPoints, targetPoints) {
		if (isSimpleConvexQuad(nextPoints)) {
			return nextPoints;
		}

		for (const factor of [0.9, 0.75, 0.5, 0.25, 0]) {
			const candidate = currentPoints.map((point, index) => ({
				x: targetPoints[index].x + (point.x - targetPoints[index].x) * factor,
				y: targetPoints[index].y + (point.y - targetPoints[index].y) * factor,
			}));

			if (isSimpleConvexQuad(candidate)) {
				return candidate;
			}
		}

		return targetPoints;
	}

	function isSimpleConvexQuad(points) {
		if (!points || points.length !== 4) {
			return false;
		}

		const area = Math.abs(cross(
			{ x: points[1].x - points[0].x, y: points[1].y - points[0].y },
			{ x: points[2].x - points[0].x, y: points[2].y - points[0].y }
		)) / 2;

		if (area < 0.5) {
			return false;
		}

		const signs = [];

		for (let index = 0; index < 4; index++) {
			const previous = points[index];
			const current = points[(index + 1) % 4];
			const next = points[(index + 2) % 4];
			const crossValue = cross(
				{ x: current.x - previous.x, y: current.y - previous.y },
				{ x: next.x - current.x, y: next.y - current.y }
			);

			if (Math.abs(crossValue) < 0.001) {
				continue;
			}

			signs.push(Math.sign(crossValue));
		}

		return signs.length > 0 && signs.every((sign) => sign === signs[0]);
	}

	function getCenter(points) {
		return points.reduce((sum, point) => ({
			x: sum.x + point.x / points.length,
			y: sum.y + point.y / points.length,
		}), { x: 0, y: 0 });
	}

	function normalize(vector) {
		const length = Math.hypot(vector.x, vector.y) || 1;

		return {
			x: vector.x / length,
			y: vector.y / length,
		};
	}

	function dot(left, right) {
		return left.x * right.x + left.y * right.y;
	}

	function distance(left, right) {
		return Math.hypot(right.x - left.x, right.y - left.y);
	}

	function cross(left, right) {
		return left.x * right.y - left.y * right.x;
	}

	function clampValue(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function place(state) {
		const fallbackVisual = {
			opacity: 1,
			visibility: 'visible',
			backgroundColor: config.fallbackColor,
			border: '0',
			borderColor: config.fallbackColor,
			borderRadius: '0',
			outline: '0',
			boxShadow: '0 0 10px ' + config.fallbackColor,
		};
		const visual = state.visual || fallbackVisual;
		const colors = getCursorColors(state, visual);
		const radius = getShapeRadius(state, visual.borderRadius);
		const pathData = getCursorPath(state.points, state.width, state.height, radius);
		const borderWidth = getBorderWidth(visual.border);
		const opacity = Math.max(config.minAlpha, visual.opacity);
		const glowColor = colors.glow;
		const movementOpacity = Math.min(1, state.movement / 18) * config.glowOpacity * config.glowIntensity * opacity;
		const glowSize = Math.max(0, config.glowSize);
		const glowAlpha = Math.max(0, Math.min(1, movementOpacity));
		const glowFilter = config.glowEnabled && config.animationMode !== 'off' && glowAlpha > 0 && glowSize > 0
			? [
				'drop-shadow(0 0 ' + Math.max(2, glowSize * 0.45) + 'px ' + withAlpha(glowColor, glowAlpha) + ')',
				'drop-shadow(0 0 ' + glowSize + 'px ' + withAlpha(glowColor, glowAlpha * 0.72) + ')',
			].join(' ')
			: 'none';

		state.shape.setAttribute('d', pathData);
		state.shape.setAttribute('fill', applyGradient(colors.fill, state));
		state.shape.setAttribute('opacity', String(opacity));
		state.shape.setAttribute('visibility', visual.visibility);

		if (borderWidth > 0) {
			state.shape.setAttribute('stroke', visual.borderColor || colors.fill);
			state.shape.setAttribute('stroke-width', String(borderWidth));
			state.shape.setAttribute('stroke-linejoin', 'round');
		} else {
			state.shape.setAttribute('stroke', 'none');
		}

		state.shape.style.filter = glowFilter;
		state.lastVisiblePoints = clonePoints(state.points);

		renderTrail(state, visual, opacity, colors);
	}

	function getCursorColors(state, visual) {
		if (config.rainbowEnabled) {
			const hue = (Date.now() * 0.08 + state.seen * 12) % 360;
			const fill = hslToHex(hue, 90, 62);

			return {
				fill,
				glow: config.glowColor || fill,
				hue,
			};
		}

		const fill = config.cursorColor || visual.backgroundColor;

		return {
			fill,
			glow: config.glowColor || fill,
			hue: 200,
		};
	}

	function applyGradient(fill, state) {
		if (!config.gradientEnabled && !config.rainbowEnabled) {
			return fill;
		}

		const colors = config.rainbowEnabled
			? getCursorColors(state, { backgroundColor: fill })
			: { fill, hue: 0 };
		const topColor = config.rainbowEnabled ? colors.fill : lighten(fill, 0.3);
		const bottomColor = config.rainbowEnabled ? hslToHex((colors.hue + 55) % 360, 85, 55) : darken(fill, 0.3);

		overlay.topStop.setAttribute('stop-color', topColor);
		overlay.bottomStop.setAttribute('stop-color', bottomColor);

		return 'url(#jellyCursorCursorGradient)';
	}

	function renderTrail(state, visual, opacity, colors) {
		while (state.trailPaths.length < config.trailLength) {
			const trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			trailPath.setAttribute('fill-rule', 'nonzero');
			trailPath.setAttribute('stroke', 'none');
			overlay.svg.appendChild(trailPath);
			state.trailPaths.push(trailPath);
		}

		if (!config.trailEnabled || config.trailLength <= 0 || state.trail.length === 0 || config.animationMode === 'off') {
			for (const trailPath of state.trailPaths) {
				trailPath.setAttribute('visibility', 'hidden');
			}

			return;
		}

		for (let index = 0; index < config.trailLength; index++) {
			const trailPath = state.trailPaths[index];
			const history = state.trail[index];

			if (!history || history.length !== 4) {
				trailPath.setAttribute('visibility', 'hidden');
				continue;
			}

			const fade = 1 - index / config.trailLength;
			const scale = Math.max(0.4, fade * 0.9);
			const center = getCenter(history);
			const scaledPoints = history.map((point) => ({
				x: center.x + (point.x - center.x) * scale,
				y: center.y + (point.y - center.y) * scale,
			}));
			const scaledWidth = Math.max(1, state.width * scale);
			const scaledHeight = Math.max(1, state.height * scale);
			const trailRadius = getShapeRadius({ width: scaledWidth, height: scaledHeight }, visual.borderRadius);

			trailPath.setAttribute('d', getCursorPath(scaledPoints, scaledWidth, scaledHeight, trailRadius));
			trailPath.setAttribute('fill', config.rainbowEnabled ? hslToHex((colors.hue - index * 14 + 360) % 360, 85, 60) : colors.fill);
			trailPath.setAttribute('opacity', String(clampValue(opacity * config.trailOpacity * fade * state.trailFade, 0, 1)));
			trailPath.setAttribute('visibility', visual.visibility);
		}
	}

	function getShapeRadius(state, nativeBorderRadius) {
		if (config.shapeStyle === 'capsule') {
			return clampValue(Math.min(state.width, state.height) / 2, 0, 12);
		}

		if (config.shapeStyle === 'rounded') {
			const parsed = parseCssPixels(nativeBorderRadius) || 3;

			return clampValue(parsed, 0, Math.min(state.width, state.height) / 2, 8);
		}

		return clampValue(parseCssPixels(nativeBorderRadius) || 0, 0, 12);
	}

	function getCursorPath(points, width, height, radius) {
		if (points.length !== 4) {
			return '';
		}

		const safeRadius = clampValue(radius, 0, Math.max(0, Math.min(width, height) / 2));

		if (safeRadius <= 0) {
			return 'M ' + points.map((point) => formatPoint(point)).join(' L ') + ' Z';
		}

		const [topLeft, topRight, bottomRight, bottomLeft] = points;
		const topRadius = Math.min(safeRadius, distance(topLeft, topRight) / 2, distance(topLeft, bottomLeft) / 2);
		const rightRadius = Math.min(safeRadius, distance(topRight, topLeft) / 2, distance(topRight, bottomRight) / 2);
		const bottomRadius = Math.min(safeRadius, distance(bottomRight, topRight) / 2, distance(bottomRight, bottomLeft) / 2);
		const leftRadius = Math.min(safeRadius, distance(bottomLeft, bottomRight) / 2, distance(bottomLeft, topLeft) / 2);

		return [
			'M ' + (topLeft.x + leftRadius) + ' ' + topLeft.y,
			'L ' + (topRight.x - rightRadius) + ' ' + topRight.y,
			'Q ' + topRight.x + ' ' + topRight.y + ' ' + topRight.x + ' ' + (topRight.y + rightRadius),
			'L ' + bottomRight.x + ' ' + (bottomRight.y - bottomRadius),
			'Q ' + bottomRight.x + ' ' + bottomRight.y + ' ' + (bottomRight.x - bottomRadius) + ' ' + bottomRight.y,
			'L ' + (bottomLeft.x + leftRadius) + ' ' + bottomLeft.y,
			'Q ' + bottomLeft.x + ' ' + bottomLeft.y + ' ' + bottomLeft.x + ' ' + (bottomLeft.y - leftRadius),
			'L ' + topLeft.x + ' ' + (topLeft.y + topRadius),
			'Q ' + topLeft.x + ' ' + topLeft.y + ' ' + (topLeft.x + topRadius) + ' ' + topLeft.y,
			'Z',
		].join(' ');
	}

	function formatPoint(point) {
		return point.x.toFixed(2) + ' ' + point.y.toFixed(2);
	}

	function getBorderWidth(border) {
		const match = String(border || '0').match(/([\d.]+)px/);

		return match ? Number.parseFloat(match[1]) : 0;
	}

	function parseCssPixels(value) {
		const match = String(value || '').match(/([\d.]+)px/);

		return match ? Number.parseFloat(match[1]) : 0;
	}

	function hslToHex(hue, saturation, lightness) {
		const s = saturation / 100;
		const l = lightness / 100;
		const chroma = (1 - Math.abs(2 * l - 1)) * s;
		const section = hue / 60;
		const x = chroma * (1 - Math.abs(section % 2 - 1));
		let red = 0;
		let green = 0;
		let blue = 0;

		if (section < 1) {
			red = chroma; green = x;
		} else if (section < 2) {
			red = x; green = chroma;
		} else if (section < 3) {
			green = chroma; blue = x;
		} else if (section < 4) {
			green = x; blue = chroma;
		} else if (section < 5) {
			red = x; blue = chroma;
		} else {
			red = chroma; blue = x;
		}

		const match = l - chroma / 2;

		return '#' + [red, green, blue]
			.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
			.join('');
	}

	function lighten(color, amount) {
		return mixHex(color, '#ffffff', amount);
	}

	function darken(color, amount) {
		return mixHex(color, '#000000', amount);
	}

	function mixHex(color, target, amount) {
		const rgb = parseHexColor(color);

		if (!rgb) {
			return color;
		}

		const targetRgb = parseHexColor(target) || rgb;

		return '#' + rgb
			.map((channel, index) => Math.round(channel + (targetRgb[index] - channel) * amount))
			.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
			.join('');
	}

	function parseHexColor(color) {
		if (/^#[0-9a-f]{6}$/i.test(color)) {
			return [
				Number.parseInt(color.slice(1, 3), 16),
				Number.parseInt(color.slice(3, 5), 16),
				Number.parseInt(color.slice(5, 7), 16),
			];
		}

		if (/^#[0-9a-f]{3}$/i.test(color)) {
			return [
				Number.parseInt(color[1] + color[1], 16),
				Number.parseInt(color[2] + color[2], 16),
				Number.parseInt(color[3] + color[3], 16),
			];
		}

		return null;
	}

	function withAlpha(color, alpha) {
		const safeAlpha = Math.max(0, Math.min(1, alpha));

		if (/^#[0-9a-f]{6}$/i.test(color)) {
			const value = color.slice(1);
			const red = Number.parseInt(value.slice(0, 2), 16);
			const green = Number.parseInt(value.slice(2, 4), 16);
			const blue = Number.parseInt(value.slice(4, 6), 16);

			return 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + safeAlpha + ')';
		}

		if (/^#[0-9a-f]{3}$/i.test(color)) {
			const red = Number.parseInt(color[1] + color[1], 16);
			const green = Number.parseInt(color[2] + color[2], 16);
			const blue = Number.parseInt(color[3] + color[3], 16);

			return 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + safeAlpha + ')';
		}

		if (color.startsWith('rgb(')) {
			return color.replace('rgb(', 'rgba(').replace(')', ', ' + safeAlpha + ')');
		}

		return color;
	}

	if (config.rippleEnabled) {
		window.addEventListener('pointerdown', function (event) {
			const target = event.target;

			if (target && target.closest && target.closest('.monaco-editor')) {
				spawnRipple(event.clientX, event.clientY);
			}
		}, true);
	}

	requestAnimationFrame(tick);
})();
`}0&&(module.exports={activate,deactivate});
