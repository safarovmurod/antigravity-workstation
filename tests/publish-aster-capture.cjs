'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const branch = 'codex/repair-media-acceptance-20261026';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function verify(directory) {
  const read = name => {
    const file = path.join(directory, name);
    if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('Not a regular capture file: ' + name);
    return fs.readFileSync(file);
  };
  const phases = ['fresh', 'restart-new-project', 'named-profile'].map(phase => {
    const result = JSON.parse(read('result-' + phase + '.json'));
    if (!/Antigravity/.test(result.host?.name) || result.host.platform !== 'win32' ||
      result.installed?.id !== 'workstation.aster-appearance' || result.themes?.length !== 20 ||
      !result.themes.every(theme => theme.selectedThroughStandardPicker && theme.actual === theme.expected) ||
      new Set(result.themes.map(theme => theme.name)).size !== 20 || result.panel?.fonts !== 10 ||
      result.panel?.fontPreviews?.length !== 10 || !result.panel.fontPreviews.every(font => font.actualEditorFonts?.some(face => face.glyphCount > 0)) ||
      !result.panel.selectorChangesActualSettings || !result.extensionDetails?.nameDescriptionIconVerified || !result.applicationScoped ||
      result.panel.captureStates?.length !== 2 || !result.panel.captureStates.every(state => state.previewVisible && state.theme === (state.kind === 'light' ? 'git hab light' : state.kind === 'dark' ? 'oceanic pro' : null)) ||
      (phase !== 'fresh' && !result.reopenedWithPriorSettings)) throw new Error('Incomplete actual native capture evidence: ' + phase);
    return { phase, sha256: hash(read('result-' + phase + '.json')), host: result.host, installed: { id: result.installed.id, version: result.installed.version } };
  });
  const images = ['light', 'dark'].map(kind => {
    const bytes = read('aster-' + kind + '.png');
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || bytes.toString('ascii', 12, 16) !== 'IHDR' ||
      bytes.length < 30000 || bytes.length > 20 * 1024 * 1024) throw new Error('Invalid native PNG: ' + kind);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1440 || height < 1000 || width > 8192 || height > 8192) throw new Error('Unreadable native viewport: ' + kind);
    return { kind, bytes, width, height, sha256: hash(bytes) };
  });
  return { phases, images };
}
function stageGuides(directory, expected, runId) {
  const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
  if (!result.passed || result.commit !== expected || result.recordingScope !== 'calm-stability-recording-only' ||
    result.allEightRecorded !== false || !result.normalHostDetails?.startsWith('NOT TESTED') || result.recordings?.length !== 2 ||
    result.recordings.map(item => item.name).sort().join(',') !== 'calm-typescript,stability') throw new Error('Incomplete explicitly scoped two-guide capture');
  const output = [];
  for (const recording of result.recordings) {
    if (recording.codeCommit !== expected || recording.frames < 10 || recording.frames > 900 ||
      recording.viewport.width !== 1440 || recording.viewport.height !== 1000 || recording.encodedDurationSeconds !== recording.frames / 5 ||
      recording.media?.length !== 2 || recording.media.map(item => item.name).sort().join(',') !== recording.name + '.gif,' + recording.name + '.mp4') throw new Error('Invalid captured recording metadata');
    for (const [id, folder, entries] of [['workstation.calm-typescript', 'calm-typescript', { 'dist/extension.cjs': 'extension.cjs' }],
      ['workstation.stability-helper', 'workstation-stability', { 'extension.js': 'extension.js', 'profile.cjs': 'profile.cjs', 'gallery-updates.cjs': 'gallery-updates.cjs' }]]) {
      const metadata = recording.installed?.[id], source = path.join(root, 'extensions', folder);
      if (metadata?.version !== JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version) throw new Error('Wrong installed capture version: ' + id);
      for (const [installed, file] of Object.entries(entries)) if (metadata.logic?.[installed] !== hash(fs.readFileSync(path.join(source, file)))) throw new Error('Capture runtime differs from source: ' + id + '/' + file);
    }
    for (const media of recording.media) {
      const file = path.join(directory, media.name);
      if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('Linked or missing captured media');
      const bytes = fs.readFileSync(file);
      if (bytes.length !== media.bytes || hash(bytes) !== media.sha256 || bytes.length > 100 * 1024 * 1024 ||
        (media.name.endsWith('.gif') ? !/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) : bytes.toString('ascii', 4, 8) !== 'ftyp')) throw new Error('Captured media integrity failure');
      output.push({ file: 'docs/feature-guides/' + media.name, bytes });
    }
  }
  output.push({ file: 'docs/feature-guides/real-recordings.json', bytes: Buffer.from(JSON.stringify({ sourceCommit: expected, runId,
    recordingScope: result.recordingScope, allEightRecorded: false, installedDetailsPlayback: 'NOT TESTED by capture-only publication; separate native playback workflow required',
    normalHostDetails: result.normalHostDetails, recordings: result.recordings,
    caveat: 'Two actual official Antigravity extension-test-host recordings only. No authenticated normal-host session, Git video, Gemini behavior or OS reboot is implied.' }, null, 2) + '\n') });
  for (const item of output) {
    const file = path.join(root, item.file);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Linked media destination');
    fs.writeFileSync(file, item.bytes);
  }
  return output.map(item => item.file);
}
function publish(env = process.env) {
  const expected = env.ASTER_CAPTURE_EXPECTED_HEAD;
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REPOSITORY !== 'safarovmurod/antigravity-workstation' || env.GITHUB_REF !== 'refs/heads/' + branch ||
    !/^[a-f0-9]{40}$/.test(expected || '') || expected !== env.GITHUB_SHA) throw new Error('Explicit hosted capture publication is required');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git('rev-parse', 'HEAD') !== expected || git('status', '--porcelain')) throw new Error('Capture checkout must be exact and clean');
  if (git('ls-remote', '--heads', 'origin', 'refs/heads/' + branch).split(/\s/)[0] !== expected) throw new Error('Repair branch advanced; no overwrite permitted');
  const artifact = path.resolve(env.ASTER_CAPTURE_ARTIFACT || '');
  const temporary = path.resolve(env.RUNNER_TEMP || '');
  if (!artifact.startsWith(temporary + path.sep) || fs.lstatSync(artifact).isSymbolicLink() || fs.realpathSync(artifact) !== artifact) throw new Error('Capture must be a private runner artifact directory');
  if (env.WORKSTATION_CAPTURE_KIND === 'guides') {
    const files = stageGuides(artifact, expected, env.GITHUB_RUN_ID);
    git('add', '--', ...files);
    git('-c', 'user.name=Workstation capture', '-c', 'user.email=workstation-capture@users.noreply.github.com', 'commit', '-m', 'Preserve two current actual native recordings with scoped provenance');
    git('push', 'origin', 'HEAD:refs/heads/' + branch); return;
  }
  if (env.WORKSTATION_CAPTURE_KIND) throw new Error('Unknown capture publication kind');
  const result = verify(artifact), destination = path.join(root, 'extensions/aster-appearance/media');
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Linked capture destination');
  fs.mkdirSync(destination, { recursive: true });
  const priorFile = path.join(destination, 'source-evidence.json');
  const prior = fs.existsSync(priorFile) ? JSON.parse(fs.readFileSync(priorFile)) : null;
  if (prior) {
    if (fs.lstatSync(priorFile).isSymbolicLink() || prior.files?.length !== 2) throw new Error('Unowned prior capture provenance');
    for (const file of prior.files) {
      if (!['extensions/aster-appearance/media/appearance-light.png', 'extensions/aster-appearance/media/appearance-dark.png'].includes(file.file) ||
        fs.lstatSync(path.join(root, file.file)).isSymbolicLink() || hash(fs.readFileSync(path.join(root, file.file))) !== file.sha256) throw new Error('Prior capture differs; no overwrite');
    }
  }
  const files = result.images.map(image => {
    const name = 'appearance-' + image.kind + '.png', target = path.join(destination, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Linked PNG destination');
    fs.writeFileSync(target, image.bytes, { flag: prior ? 'w' : 'wx' });
    return { file: 'extensions/aster-appearance/media/' + name, sha256: image.sha256, width: image.width, height: image.height };
  });
  const provenance = 'extensions/aster-appearance/media/source-evidence.json';
  fs.writeFileSync(path.join(root, provenance), JSON.stringify({ sourceCommit: expected,
    workflow: 'https://github.com/' + env.GITHUB_REPOSITORY + '/actions/runs/' + env.GITHUB_RUN_ID,
    method: 'Actual installed Antigravity Windows renderer capture; automated test host, not an authenticated normal user session. No visual reconstruction or OS reboot claim.',
    phases: result.phases, files }, null, 2) + '\n', { flag: prior ? 'w' : 'wx' });
  git('add', '--', ...files.map(file => file.file), provenance);
  git('-c', 'user.name=Workstation capture', '-c', 'user.email=workstation-capture@users.noreply.github.com', 'commit', '-m', 'Preserve actual native Aster screenshots and immutable provenance');
  git('push', 'origin', 'HEAD:refs/heads/' + branch);
}
if (require.main === module) publish();
module.exports = { verify, publish, stageGuides };
