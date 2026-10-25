'use strict';
try {
  const result = require('../extensions/workstation-stability/gallery-updates.cjs').runUpdates(process.argv[2], { exclude: JSON.parse(process.argv[3] || '[]') });
  console.log('WORKSTATION_GALLERY_UPDATE_RESULT=' + JSON.stringify(result));
  if (result.state === 'failed') process.exitCode = 1;
} catch (error) {
  console.log('WORKSTATION_GALLERY_UPDATE_RESULT=' + JSON.stringify({ state: 'failed', updated: false, reason: error.message }));
  process.exitCode = 1;
}
