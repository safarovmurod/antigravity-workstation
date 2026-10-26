'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const repository = path.resolve(__dirname, '../..');
const { assertHosted, ownedDirectory } = require('./full-catalog.cjs');
const { until, installArtifactWithRetry } = require('./controller.cjs');
async function main(ideRoot, executable, directory, artifactDirectory) {
  assertHosted();
  const fixture = ownedDirectory(path.join(directory, 'Full catalog fixture'), process.env.RUNNER_TEMP);
  ownedDirectory(artifactDirectory, process.env.RUNNER_TEMP);
  const home = path.join(fixture, 'User with spaces');
  const extensionsDir = path.join(home, '.antigravity-ide/extensions');
  const userData = path.join(home, 'AppData/Roaming/Antigravity IDE');
  const signals = path.join(fixture, 'gallery-update-signals');
  const workspace = path.join(fixture, 'Gallery workspace');
  const newProject = path.join(fixture, 'New project fixture');
  const multiRoot = path.join(fixture, 'Theme multi-root.code-workspace');
  const wrapper = path.join(fixture, 'owned editor wrapper.cmd');
  const profileFile = path.join(home, '.gemini/config/workstation-setup/editor-profile.json');
  const statusFile = path.join(path.dirname(profileFile), 'gallery-update-status.json');
  const target = require('../../lib/extensions').galleryTarget({ ideRoot });
  const isIdeRunning = require('../../lib/mcp-permissions').isIdeRunning;
  assert.equal(isIdeRunning(), false, 'Previous smoke must close normally');
  fs.mkdirSync(signals, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(newProject, { recursive: true });
  fs.writeFileSync(multiRoot, JSON.stringify({ folders: [{ path: workspace }, { path: newProject }] }));
  fs.mkdirSync(path.dirname(profileFile), { recursive: true });
  const artifact = path.join(fixture, 'errorlens-old-3.29.0.vsix');
  await require('../../scripts/install-gallery-extension.cjs').downloadExtension('usernamehw.errorlens', '3.29.0', artifact, fetch, target);
  installArtifactWithRetry(executable, [path.join(ideRoot, 'resources/app/out/cli.js'), '--user-data-dir', userData,
    '--extensions-dir', extensionsDir], artifact, { id: 'usernamehw.errorlens', version: '3.29.0' });
  const galleryUpdates = require('../../extensions/workstation-stability/gallery-updates.cjs').createPlan(repository,
    { nodeExe: process.execPath, cliPath: wrapper, extensionsDir, ideRoot }, [{ id: 'usernamehw.errorlens', source: 'gallery' }], target);
  const managed = require('../../config/settings.json');
  const profile = { schema: 1, requestId: crypto.randomUUID(), locale: 'ru',
    setupVersion: require('../../package.json').version, settings: Object.fromEntries(
      ['workbench.colorTheme', 'editor.tokenColorCustomizations', 'workbench.colorCustomizations'].map(key => [key, managed[key]])), galleryUpdates };
  fs.writeFileSync(profileFile, JSON.stringify(profile));
  const results = {};
  try {
    for (const phase of ['initial', 'restart', 'profile-update', 'multi-root']) {
      if (phase === 'profile-update') { profile.requestId = crypto.randomUUID(); fs.writeFileSync(profileFile, JSON.stringify(profile)); }
      const folder = phase === 'multi-root' ? multiRoot : phase === 'profile-update' ? newProject : workspace;
      const output = fs.openSync(path.join(artifactDirectory, 'gallery-' + phase + '-ide.log'), 'a');
      const child = spawn(executable, ['--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        '--user-data-dir', userData, '--extensions-dir', extensionsDir,
        '--extensionDevelopmentPath=' + path.join(repository, 'tests/windows-gallery-update'), '--new-window', folder], {
        windowsHide: true, stdio: ['ignore', output, output],
        env: { ...process.env, USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'),
          LOCALAPPDATA: path.join(home, 'AppData/Local'), WORKSTATION_GALLERY_PHASE: phase,
          WORKSTATION_GALLERY_SIGNALS: signals, WORKSTATION_GALLERY_STATUS: statusFile },
      });
      fs.closeSync(output);
      let launchError; child.on('error', error => { launchError = error; });
      await until(() => {
        if (launchError) throw launchError;
        const fatal = path.join(signals, phase + '-fatal.json');
        if (fs.existsSync(fatal)) throw new Error(fs.readFileSync(fatal, 'utf8'));
        return fs.existsSync(path.join(signals, phase + '-ready.json'));
      }, 'actual installed helper automatically updates old Error Lens: ' + phase, 20 * 60 * 1000);
      results[phase] = JSON.parse(fs.readFileSync(path.join(signals, phase + '-ready.json'), 'utf8'));
      fs.writeFileSync(path.join(signals, phase + '-quit'), 'quit normally');
      await until(() => !isIdeRunning(), 'gallery fixture IDE closes normally', 60000);
    }
    assert.equal(results.initial.status.attemptedAt, results.restart.status.attemptedAt);
    assert.equal(results['profile-update'].status.attemptedAt, results['multi-root'].status.attemptedAt);
    fs.writeFileSync(path.join(artifactDirectory, 'gallery-update-roundtrip.json'), JSON.stringify({ passed: true,
      setupVersion: require('../../package.json').version, engine: target,
      themeUpdateScope: 'Actual editor profile-plan refresh, new project and multi-root; full historical installer migration is a separate suite', results }, null, 2));
  } finally {
    for (const phase of ['initial', 'restart', 'profile-update', 'multi-root']) fs.writeFileSync(path.join(signals, phase + '-quit'), 'cleanup requests normal quit');
    for (const file of fs.readdirSync(signals).filter(name => name.endsWith('.json')))
      fs.copyFileSync(path.join(signals, file), path.join(artifactDirectory, 'gallery-' + file));
  }
}
if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
