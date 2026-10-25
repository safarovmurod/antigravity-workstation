'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NATIVE_MAIN_SHA256 = '6f1a12099ac635d462bd7092357119ec1ec7516988cacb874b7e97691272b104';
const ADAPTERS = Object.freeze({
  'uss-int32-agent-tab-v1': Object.freeze({
    schemaName: 'exa/unified_state_sync_pb/unified_state_sync.proto',
    schemaSha256: 'b70f135c55d53617098087edd2da6ae2cbf306b923c8a699b0ee36b4a76c5149',
  }),
});
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function validateCatalog(catalog) {
  if (!object(catalog) || catalog.format !== 1 || !Array.isArray(catalog.builds) || !catalog.builds.length) {
    throw new Error('Invalid native compatibility catalog');
  }
  const ids = new Set(), identities = new Set();
  for (const build of catalog.builds) {
    const adapter = object(build) && typeof build.adapterId === 'string' && Object.hasOwn(ADAPTERS, build.adapterId)
      ? ADAPTERS[build.adapterId] : null;
    if (!object(build) || typeof build.id !== 'string' || !/^[a-z0-9][a-z0-9.-]+$/.test(build.id)
      || typeof build.ideVersion !== 'string' || !VERSION.test(build.ideVersion) || build.platform !== 'win32' || !['x64', 'arm64'].includes(build.architecture)
      || typeof build.mainSha256 !== 'string' || !SHA256.test(build.mainSha256) || !adapter || !object(build.schema)
      || build.schema.name !== adapter.schemaName || build.schema.sha256 !== adapter.schemaSha256
      || !object(build.source) || typeof build.source.installerSha256 !== 'string' || !SHA256.test(build.source.installerSha256)
      || typeof build.source.installerUrl !== 'string'
      || typeof build.evidence !== 'string' || !/^docs\/[a-zA-Z0-9_./-]+\.md(?:#[a-z0-9-]+)?$/.test(build.evidence)
      || build.evidence.split('/').some(part => part === '..' || part === '.')) {
      throw new Error('Invalid native compatibility catalog entry');
    }
    let source;
    try { source = new URL(build.source.installerUrl); } catch { throw new Error('Invalid native build source'); }
    if (source.protocol !== 'https:' || source.hostname !== 'dl.google.com' || source.port || source.username || source.password
      || !source.pathname.startsWith('/edgedl/') || source.search || source.hash) {
      throw new Error('Invalid native build source');
    }
    const identity = [build.platform, build.architecture, build.ideVersion, build.mainSha256].join(':');
    if (ids.has(build.id) || identities.has(identity)) throw new Error('Duplicate native compatibility catalog entry');
    ids.add(build.id); identities.add(identity);
  }
  return catalog;
}

function catalogPath(options = {}) {
  if (options.catalogPath) return options.catalogPath;
  if (options.repoRoot) return path.join(options.repoRoot, 'config', 'native-compatibility.json');
  const repositoryFile = path.join(__dirname, '..', 'config', 'native-compatibility.json');
  return fs.existsSync(repositoryFile) ? repositoryFile : path.join(__dirname, 'native-compatibility.json');
}

function loadCatalog(options = {}) {
  return validateCatalog(JSON.parse(fs.readFileSync(catalogPath(options), 'utf8')));
}

function embeddedSchemaMatches(bytes, build) {
  const name = Buffer.from(build.schema.name);
  let matches = 0;
  for (const match of bytes.toString('utf8').matchAll(/=Uo\("([A-Za-z0-9+/]+)"/g)) {
    const descriptor = Buffer.from(match[1], 'base64');
    if (descriptor.includes(name) && sha256(descriptor) === build.schema.sha256) matches++;
  }
  return matches === 1;
}

function installationArchitecture(ideRoot, fallback = process.arch) {
  for (const name of ['Antigravity IDE.exe', 'Antigravity.exe']) {
    const file = path.join(ideRoot || '', name);
    if (!fs.existsSync(file)) continue;
    const descriptor = fs.openSync(file, 'r');
    try {
      const header = Buffer.alloc(64);
      if (fs.readSync(descriptor, header, 0, 64, 0) !== 64 || header.readUInt16LE(0) !== 0x5a4d) return 'unknown';
      const pe = Buffer.alloc(6), offset = header.readUInt32LE(60);
      if (offset < 64 || fs.readSync(descriptor, pe, 0, 6, offset) !== 6 || pe.readUInt32LE(0) !== 0x4550) return 'unknown';
      return ({ 0x8664: 'x64', 0xaa64: 'arm64' })[pe.readUInt16LE(4)] || 'unsupported';
    } finally { fs.closeSync(descriptor); }
  }
  return fallback;
}

function inspectNativeCompatibility(env = {}, options = {}) {
  const platform = env.isWindows === false ? 'unsupported' : options.platform || 'win32';
  let architecture;
  try { architecture = options.architecture || installationArchitecture(env.ideRoot); }
  catch { architecture = 'unknown'; }
  const result = { supported: false, installedVersion: null, mainSha256: null, adapterId: null,
    buildId: null, platform, architecture, catalogFormat: null, reasonCode: null, reason: null };
  const failure = (reasonCode, reason) => ({ ...result, reasonCode, reason });
  if (platform !== 'win32' || !['x64', 'arm64'].includes(architecture)) {
    return failure('UNSUPPORTED_PLATFORM', 'Native automation requires a supported Windows x64 or ARM64 IDE; native settings not changed');
  }
  if (!env.ideRoot || typeof env.ideRoot !== 'string') return failure('INSTALLATION_NOT_FOUND', 'Antigravity installation not found');
  const app = path.join(env.ideRoot, 'resources', 'app');
  const productFile = path.join(app, 'product.json'), mainFile = path.join(app, 'out', 'main.js');
  if (!fs.existsSync(productFile) || !fs.existsSync(mainFile)) return failure('INSTALLATION_NOT_FOUND', 'Antigravity installation not found');
  let product, bytes;
  try { product = JSON.parse(fs.readFileSync(productFile, 'utf8')); }
  catch { return failure('INVALID_PRODUCT_METADATA', 'Antigravity product metadata could not be read; native settings not changed'); }
  if (!object(product) || typeof product.ideVersion !== 'string' || !VERSION.test(product.ideVersion)
    || (product.nameShort !== undefined && !/^Antigravity(?: IDE)?$/i.test(product.nameShort))) {
    return failure('INVALID_PRODUCT_METADATA', 'Antigravity product metadata is invalid; native settings not changed');
  }
  result.installedVersion = product.ideVersion;
  let catalog;
  try { catalog = loadCatalog(options); result.catalogFormat = catalog.format; }
  catch { return failure('INVALID_CATALOG', 'Native compatibility catalog is missing or invalid; native settings not changed'); }
  try { bytes = fs.readFileSync(mainFile); result.mainSha256 = sha256(bytes); }
  catch { return failure('BUNDLE_READ_FAILED', 'Antigravity native bundle could not be read; native settings not changed'); }
  const versions = catalog.builds.filter(build => build.platform === platform && build.architecture === architecture
    && build.ideVersion === product.ideVersion);
  if (!versions.length) return failure('UNSUPPORTED_VERSION', 'Unaudited Antigravity version ' + product.ideVersion + ': native settings not changed');
  const build = versions.find(candidate => candidate.mainSha256 === result.mainSha256);
  if (!build) return failure('BUNDLE_HASH_MISMATCH', 'Unaudited Antigravity build: native settings not changed');
  if (!embeddedSchemaMatches(bytes, build)) return failure('SCHEMA_MISMATCH', 'Unaudited Antigravity native schema: native settings not changed');
  return { ...result, supported: true, adapterId: build.adapterId, buildId: build.id, reasonCode: 'SUPPORTED', reason: null };
}

function validateNative(env, options = {}) {
  return inspectNativeCompatibility(env, options).reason;
}

module.exports = { NATIVE_MAIN_SHA256, ADAPTERS, validateCatalog, loadCatalog, inspectNativeCompatibility, validateNative, installationArchitecture };
