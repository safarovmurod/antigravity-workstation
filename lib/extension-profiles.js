'use strict';

const definitions = require('../config/extension-profiles.json');
const EXTENSION_PROFILES = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([name, profile]) => [
  name, Object.freeze({ ...profile, include: Array.isArray(profile.include) ? Object.freeze([...profile.include]) : profile.include }),
])));

// Select installation requirements only. Keep the catalog and its entries intact,
// including existing optional/version policies. This module never uninstalls.
function selectExtensions(catalog, profile = 'full') {
  if (typeof profile !== 'string' || !Object.hasOwn(EXTENSION_PROFILES, profile)) {
    throw new Error('Unknown extension profile: ' + String(profile) + '. Choose full or lite.');
  }
  if (!Array.isArray(catalog)) throw new TypeError('Extension catalog must be an array.');
  const identifiers = new Set();
  for (const extension of catalog) {
    if (!extension || typeof extension.id !== 'string' || !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(extension.id)) {
      throw new Error('Invalid extension identifier in catalog.');
    }
    const id = extension.id.toLowerCase();
    if (identifiers.has(id)) throw new Error('Duplicate extension identifier in catalog: ' + extension.id);
    identifiers.add(id);
  }
  const included = EXTENSION_PROFILES[profile].include;
  if (included === 'all') return [...catalog];
  if (!Array.isArray(included) || included.length === 0) throw new Error('Invalid extension profile: ' + profile);
  const wanted = new Set();
  for (const entry of included) {
    if (typeof entry !== 'string') throw new Error('Invalid extension identifier in profile: ' + profile);
    const id = entry.toLowerCase();
    if (wanted.has(id)) throw new Error('Duplicate extension identifier in profile ' + profile + ': ' + entry);
    if (!identifiers.has(id)) throw new Error('Extension profile ' + profile + ' references missing catalog entry: ' + entry);
    wanted.add(id);
  }
  return catalog.filter(extension => wanted.has(extension.id.toLowerCase()));
}

module.exports = { EXTENSION_PROFILES, selectExtensions };
