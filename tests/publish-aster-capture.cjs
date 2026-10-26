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
      (phase !== 'fresh' && !result.reopenedWithPriorSettings)) throw new Error('Incomplete actual native capture evidence: ' + phase);
    return { phase, sha256: hash(read('result-' + phase + '.json')), host: result.host, installed: { id: result.installed.id, version: result.installed.version } };
  });
  const images = ['light', 'dark'].map(kind => {
    const bytes = read('aster-' + kind + '.png');
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || bytes.toString('ascii', 12, 16) !== 'IHDR' ||
      bytes.length < 30000 || bytes.length > 20 * 1024 * 1024) throw new Error('Invalid native PNG: ' + kind);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1000 || height < 700 || width > 8192 || height > 8192) throw new Error('Unreadable native viewport: ' + kind);
    return { kind, bytes, width, height, sha256: hash(bytes) };
  });
  return { phases, images };
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
  const result = verify(artifact), destination = path.join(root, 'extensions/aster-appearance/media');
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Linked capture destination');
  fs.mkdirSync(destination, { recursive: true });
  const files = result.images.map(image => {
    const name = 'appearance-' + image.kind + '.png', target = path.join(destination, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Linked PNG destination');
    fs.writeFileSync(target, image.bytes, { flag: 'wx' });
    return { file: 'extensions/aster-appearance/media/' + name, sha256: image.sha256, width: image.width, height: image.height };
  });
  const provenance = 'extensions/aster-appearance/media/source-evidence.json';
  fs.writeFileSync(path.join(root, provenance), JSON.stringify({ sourceCommit: expected,
    workflow: 'https://github.com/' + env.GITHUB_REPOSITORY + '/actions/runs/' + env.GITHUB_RUN_ID,
    method: 'Actual installed Antigravity Windows renderer capture; automated test host, not an authenticated normal user session. No visual reconstruction or OS reboot claim.',
    phases: result.phases, files }, null, 2) + '\n', { flag: 'wx' });
  git('add', '--', ...files.map(file => file.file), provenance);
  git('-c', 'user.name=Workstation capture', '-c', 'user.email=workstation-capture@users.noreply.github.com', 'commit', '-m', 'Preserve actual native Aster screenshots and immutable provenance');
  git('push', 'origin', 'HEAD:refs/heads/' + branch);
}
if (require.main === module) publish();
module.exports = { verify, publish };
