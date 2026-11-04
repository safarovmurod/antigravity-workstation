'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const commit = '4a448749e552a29ff2cabbf7722a6c6e3e7a0786';
const stabilityCommit = '4195fb788b36fc5353e9610aff7fb00cdd90d333';
function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/feature-guides/instructional-animations.json')));
  const expected = ['current-branch', 'new-branch', 'switch-branch', 'get-changes', 'pull-request', 'delete-branch', 'aster-appearance'];
  if (manifest.type !== 'instructional animation, not IDE recording' || manifest.guides.map(item => item.id).join(',') !== expected.join(',')) throw new Error('Unexpected instructional media manifest');
  const stability = JSON.parse(fs.readFileSync(path.join(root, 'docs/feature-guides/stability-instructional.json')));
  if (stability.id !== 'stability-instructional' || stability.type !== manifest.type) throw new Error('Unexpected Stability animation');
  return [...manifest.guides, stability].map(guide => {
    const folder = guide.id === 'aster-appearance' ? 'aster-appearance' : guide.id === 'stability-instructional' ? 'workstation-stability' : 'git-branch-panel';
    const expectedPaths = ['gif', 'mp4'].map(type => `extensions/${folder}/media/${guide.id}.${type}`);
    if (guide.media.map(item => item.path).sort().join(',') !== expectedPaths.join(',')) throw new Error('Unexpected instructional asset paths: ' + guide.id);
    for (const asset of guide.media) {
      const bytes = fs.readFileSync(path.join(root, asset.path));
      if (bytes.length !== asset.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Instructional media hash mismatch: ' + asset.path);
    }
    const gif = guide.media.find(item => item.path.endsWith('.gif')), mp4 = guide.media.find(item => item.path.endsWith('.mp4'));
    const revision = guide.id === 'stability-instructional' ? stabilityCommit : commit;
    return { id: guide.id, label: 'Анимация · ' + guide.title, kind: 'instructional', sha256: mp4.sha256, source: mp4.path, gifSha256: gif.sha256, gifSource: gif.path,
      detailsExtension: guide.id === 'aster-appearance' ? 'workstation.aster-appearance' : guide.id === 'stability-instructional' ? 'workstation.stability-helper' : 'workstation.git-branch-panel',
      gifUrl: `https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/${revision}/${gif.path}`,
      mp4Url: `https://raw.githubusercontent.com/safarovmurod/antigravity-workstation/${revision}/${mp4.path}` };
  });
}
if (require.main === module) {
  fs.writeFileSync(path.join(root, 'extensions/workstation-stability/instructional-guides.json'), JSON.stringify(build(), null, 2) + '\n');
  console.log('Built verified instructional guide catalog.');
}
module.exports = { build, commit, stabilityCommit };
