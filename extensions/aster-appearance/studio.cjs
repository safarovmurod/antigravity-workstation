'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const uiStyle = require('./ui-style.cjs');
const { FONT_STYLES, updateGlobal, validate } = require('./appearance.cjs');

// The preview shows the coding ligatures every bundled font carries; keywords,
// the comment and the declared name are marked so each role style shows.
const k = word => `<span class="kw">${word}</span>`;
const PREVIEW = `<span class="cm">// Счётчик: === !== =&gt; &lt;= &gt;= -&gt; != &amp;&amp; ||</span>
${k('import')} { useState } ${k('from')} 'react';

${k('export')} ${k('function')} <span class="fn">Counter</span>({ label }: { label: string }) {
  ${k('const')} [count, setCount] = useState(42);
  ${k('const')} ready = count !== 0 &amp;&amp; count &lt;= 99 || label === '';
  ${k('return')} &lt;button onClick={() =&gt; setCount(count + 1)}&gt;
    {label}: {count} — 0O 1lI -&gt; =&gt; &gt;= !=
  &lt;/button&gt;;
}`;

// The studio is one webview. Its page is written once; afterwards the
// extension only posts state, so a click never reloads the page, its scroll
// position or its focus.
function createStudio(host) {
  const { vscode, context, enqueue, read, fonts, service } = host;
  const root = context.extensionPath, storage = () => context.globalStorageUri.fsPath;
  let panel, disposables = [], detection;
  const probes = new Map();
  const post = message => panel ? Promise.resolve(panel.webview.postMessage(message)).catch(() => false) : Promise.resolve(false);
  const warn = error => console.warn('Aster Atelier studio: ' + error.message);

  // The OS font list is read once per opened studio and again after an install.
  function availability() {
    detection ||= service.installed(fonts).then(found => ({ found }), error => ({ found: {}, error: error.message }));
    return detection.then(({ found, error }) => {
      const recorded = new Set(service.recorded(storage(), fonts));
      return { availability: Object.fromEntries(fonts.map(font => [font.id, found[font.id] === true || recorded.has(font.id)])), detectionError: error };
    });
  }
  // Settings are read after the font check, so the state is never older than it.
  async function state() {
    const found = await availability(), theme = host.currentTheme();
    const listed = host.gallery().some(option => option.value === theme);
    return { ...found, theme, current: listed || !theme ? null : { label: theme, value: theme, swatch: host.builtinSwatch({ value: theme, kind: 'dark' }) },
      family: read('editor.fontFamily'), size: read('editor.fontSize'), weight: read('editor.fontWeight'), style: read('asterAppearance.fontStyle'),
      brightness: host.themes.tuning({ brightness: read('asterAppearance.brightness') }).brightness,
      contrast: host.themes.tuning({ contrast: read('asterAppearance.contrast') }).contrast,
      uiFont: read('asterAppearance.uiFont') === true, profileScope: context.globalState.get('applicationScopeVerification') };
  }
  const fontList = () => fonts.map(font => ({ ...font, files: undefined, preview: font.files.filter(file => file.file.endsWith('.ttf'))
    .map(file => ({ uri: panel.webview.asWebviewUri(vscode.Uri.file(path.join(root, file.file))).toString(), italic: file.italic, weight: file.weight })) }));
  async function init() {
    if (!panel) return;
    const current = await state();
    await post({ type: 'init', themes: host.gallery(), sections: host.sections, fonts: fontList(), styles: FONT_STYLES, state: current });
  }
  async function update() {
    if (panel) await post({ type: 'state', ...await state() });
  }

  function probe(font) {
    const id = crypto.randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { probes.delete(id); resolve(false); }, 15000);
      probes.set(id, { resolve: value => { clearTimeout(timer); resolve(value); } });
      void post({ type: 'probe', id, family: font.family, localNames: font.localNames });
    });
  }
  async function applyFont(message) {
    const changes = { ...validate({ key: 'size', value: message.size }, [], fonts), ...validate({ key: 'style', value: message.style }, [], fonts) };
    validate({ key: 'weight', value: message.weight }, [], fonts);
    const style = FONT_STYLES.find(item => item.value === message.style);
    if (style.weight && message.weight !== style.weight) throw new Error('Толщина не соответствует выбранному начертанию.');
    let note = 'Шрифт применён.';
    if (message.font) {
      const font = validate({ key: 'font', value: message.font }, [], fonts);
      if (style.weight && (style.weight < font.minWeight || style.weight > font.maxWeight || (style.weight - font.minWeight) % font.weightStep !== 0))
        throw new Error('Это начертание недоступно для ' + font.family + '.');
      if (!(await availability()).availability[font.id]) {
        await post({ type: 'result', message: 'Устанавливаю ' + font.family + ' из расширения…' });
        await service.install(root, font, storage());
        detection = undefined;
      }
      if (!await probe(font)) note = 'Сохранено. ' + font.family + ' установлен, но редактор увидит его после полного перезапуска IDE.';
      Object.assign(changes, host.fontChanges(font, message.weight));
    } else Object.assign(changes, { 'editor.fontWeight': String(message.weight), 'terminal.integrated.fontWeight': message.weight });
    Object.assign(changes, host.styleChanges(style.value), validate({ key: 'uiFont', value: message.uiFont }, [], fonts));
    await updateGlobal(vscode, changes);
    const ui = host.writeUiStyle();
    if (ui.error || ui.skipped) note += ' Шрифт интерфейса не записан: ' + (ui.error || ui.skipped);
    else if (message.uiFont) note += uiStyle.addonReady(vscode.env.appRoot) ? ' Весь интерфейс сменит шрифт через секунду.' : ' Шрифт интерфейса включится после перезапуска IDE.';
    return note;
  }
  // A workspace or language value still wins over the saved global one.
  function overrides() {
    const scopes = vscode.window.visibleTextEditors.map(editor => ({ uri: editor.document.uri, languageId: editor.document.languageId }));
    const keys = ['editor.fontSize', 'editor.fontWeight', 'editor.fontFamily']
      .filter(key => scopes.some(scope => JSON.stringify(vscode.workspace.getConfiguration(undefined, scope).get(key)) !== JSON.stringify(read(key))));
    return keys.length ? ' Настройка проекта или языка перекрывает: ' + keys.join(', ') + '.' : '';
  }
  const actions = {
    'apply-theme': async message => { await host.applyTheme(message.value); return 'Тема применена.'; },
    'apply-tune': async message => { await host.applyTune({ brightness: message.brightness, contrast: message.contrast }); return 'Яркость и контраст применены.'; },
    'apply-font': applyFont,
  };
  function receive(message) {
    if (message?.type === 'probe-result' && typeof message.id === 'string') {
      const request = probes.get(message.id);
      if (request) { probes.delete(message.id); request.resolve(message.loaded === true); }
      return;
    }
    if (message?.type === 'ready') { enqueue(init).catch(warn); return; }
    const action = actions[message?.type];
    if (!action) return;
    enqueue(async () => {
      const note = await action(message) + overrides();
      await update();
      await post({ type: 'result', action: message.type, message: note });
    }).catch(error => post({ type: 'result', action: message.type, error: error.message }));
  }

  function closed() {
    for (const item of disposables) item?.dispose?.();
    for (const request of probes.values()) request.resolve(false);
    disposables = []; probes.clear(); panel = undefined; detection = undefined;
  }
  // A hidden studio is rebuilt by the IDE when shown again; the page then asks
  // for its state and restores its own scroll position.
  function open() {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel('asterAtelier', 'Aster Atelier', vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [vscode.Uri.file(root)] });
    disposables = [panel.webview.onDidReceiveMessage(receive), panel.onDidDispose(closed)];
    panel.webview.html = page(vscode, panel.webview, root);
  }
  return { open, update, dispose() { panel?.dispose?.(); } };
}

function page(vscode, webview, root) {
  const nonce = crypto.randomBytes(24).toString('hex');
  const uri = name => webview.asWebviewUri(vscode.Uri.file(path.join(root, name))).toString();
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${uri('panel.css')}"><title>Aster Atelier</title></head><body><main>
<header><img src="${uri('icon.png')}" width="44" height="44" alt=""><div><h1>Aster Atelier</h1><p>Темы и шрифты для Antigravity</p></div></header>
<section><h2>Тема</h2><p class="hint lead">Щелчок по карточке сразу применяет тему. Стрелки переходят между карточками, Enter применяет.</p>
<div id="gallery" role="group" aria-label="Темы"></div>
<h3 class="tune-title">Цвета кода темы Aster</h3>
<div class="controls tune"><label>Яркость цветов кода <output id="brightnessValue"></output><input id="brightness" type="range" min="-30" max="30" step="5"></label><label>Контраст кода <output id="contrastValue"></output><input id="contrast" type="range" min="-20" max="30" step="5"></label></div>
<p id="tuneHint" class="hint" role="status"></p><div class="actions"><button id="applyTune" type="button" disabled>Применить яркость и контраст</button><button id="cancelTune" class="secondary" type="button" disabled>Отмена</button></div></section>
<section><h2>Шрифт</h2><select id="font" aria-label="Шрифт"></select><p id="availability" class="hint" role="status"></p>
<div class="controls"><label>Размер<input id="size" type="number" min="8" max="40" step="1"></label><label>Толщина <output id="weightValue"></output><input id="weight" type="range" min="100" max="900" step="100"></label><label>Начертание<select id="style">${FONT_STYLES.map(style => `<option value="${style.value}">${style.label}</option>`).join('')}</select></label></div>
<pre id="preview" tabindex="0">${PREVIEW}</pre>
<label class="check"><input id="uiFont" type="checkbox"> Этот шрифт — для всего интерфейса Antigravity (меню, панели, вкладки)</label>
<div class="actions"><button id="applyFont" type="button" disabled>Применить шрифт</button><button id="cancelFont" class="secondary" type="button" disabled>Отмена</button></div></section>
<p id="message" role="status" aria-live="polite"></p><footer>Тема меняется сразу; яркость, контраст и шрифт сохраняются по кнопке «Применить».</footer></main><script nonce="${nonce}" src="${uri('panel.js')}"></script></body></html>`;
}

module.exports = { createStudio };
