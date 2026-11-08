'use strict';

// Audits every managed setting against the IDE it runs in: each key must be
// registered (by the IDE itself or by an installed extension), an extension
// setting must match its declared schema (type, enum, range, items), and a key
// inside a language block must be one the owner lets a language override.
// Deprecated extension settings are listed as warnings. The audit only reads.

function validate(value, schema, label, errors = []) {
  if (!schema || typeof schema !== 'object') return errors;
  const types = [schema.type].flat().filter(Boolean);
  const is = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value)
    : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type;
  if (types.length && !types.some(is)) {
    errors.push(label + ': ' + JSON.stringify(value) + ' is not ' + types.join(' or '));
    return errors;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(label + ': ' + JSON.stringify(value) + ' is not one of ' + schema.enum.map(item => JSON.stringify(item)).join(', '));
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(label + ': ' + value + ' is below ' + schema.minimum);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(label + ': ' + value + ' is above ' + schema.maximum);
  }
  if (Array.isArray(value) && schema.items && !Array.isArray(schema.items)) value.forEach((item, index) => validate(item, schema.items, label + '[' + index + ']', errors));
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const [name, item] of Object.entries(value)) if (schema.properties[name]) validate(item, schema.properties[name], label + '.' + name, errors);
  }
  return errors;
}

function contributedSchemas(extensions) {
  const schemas = new Map();
  for (const extension of extensions) {
    for (const section of [extension.packageJSON?.contributes?.configuration].flat().filter(Boolean)) {
      for (const [key, schema] of Object.entries(section.properties || {})) if (!schemas.has(key)) schemas.set(key, { schema, extension: extension.id });
    }
  }
  return schemas;
}

function auditManagedSettings(vscode, managed) {
  const schemas = contributedSchemas(vscode.extensions.all);
  const config = vscode.workspace.getConfiguration(undefined, null);
  const report = { checked: 0, core: 0, extension: 0, languageBlocks: 0, unregistered: [], invalid: [], notOverridable: [], deprecated: [], owners: {} };
  const check = (key, value, label, language) => {
    report.checked++;
    const entry = schemas.get(key);
    if (!entry && config.inspect(key)?.defaultValue === undefined) { report.unregistered.push(label); return; }
    // The IDE's own settings have no schema in the extension API: registration is what can be checked.
    if (!entry) { report.core++; return; }
    report.extension++;
    report.owners[entry.extension] = (report.owners[entry.extension] || 0) + 1;
    report.invalid.push(...validate(value, entry.schema, label));
    const deprecated = entry.schema.deprecationMessage || entry.schema.markdownDeprecationMessage;
    if (deprecated) report.deprecated.push({ key: label, message: String(deprecated) });
    if (language && entry.schema.scope !== 'language-overridable' && entry.schema.overridable !== true) report.notOverridable.push(label);
  };
  for (const [key, value] of Object.entries(managed)) {
    const block = /^\[(.+)\]$/.exec(key);
    if (!block) { check(key, value, key); continue; }
    report.languageBlocks++;
    if (!value || typeof value !== 'object' || Array.isArray(value)) { report.invalid.push(key + ': a language block must be an object'); continue; }
    for (const [inner, innerValue] of Object.entries(value)) check(inner, innerValue, key + '.' + inner, block[1]);
  }
  report.passed = !report.unregistered.length && !report.invalid.length && !report.notOverridable.length;
  return report;
}

module.exports = { auditManagedSettings, validate, contributedSchemas };
