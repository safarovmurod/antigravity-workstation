'use strict';

const EVENTS = ['PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// The native Customizations screen uses home/.gemini/product.applicationName,
// separately from home/.gemini/config (MCP and shared configuration).
const nativeHooksPath = env => env.nativeHooksJson
  || require('node:path').join(env.geminiDir, env.applicationName || 'antigravity-ide', 'hooks.json');

// Antigravity 2.5.5 expects a list of { matcher?, hooks: [...] } groups for
// every event, including PreInvocation. A bare command invalidates the file.
function validateNativeHooks(config) {
  if (!object(config)) throw new Error('Native hooks must be a plugin object');
  for (const [plugin, definition] of Object.entries(config)) {
    if (!object(definition) || (definition.enabled !== undefined && typeof definition.enabled !== 'boolean')) {
      throw new Error('Invalid native hooks plugin: ' + plugin);
    }
    for (const event of EVENTS) {
      if (definition[event] === undefined) continue;
      if (!Array.isArray(definition[event])) throw new Error('Invalid native hooks event: ' + plugin + '.' + event);
      for (const group of definition[event]) {
        if (!object(group) || (group.matcher !== undefined && typeof group.matcher !== 'string') || !Array.isArray(group.hooks)) {
          throw new Error('Native hooks event requires a hooks array: ' + plugin + '.' + event);
        }
        for (const hook of group.hooks) {
          if (!object(hook) || typeof hook.command !== 'string' || !hook.command.trim()
            || (hook.type !== undefined && typeof hook.type !== 'string')
            || (hook.timeout !== undefined && (!Number.isFinite(hook.timeout) || hook.timeout < 0))) {
            throw new Error('Invalid native hook command: ' + plugin + '.' + event);
          }
        }
      }
    }
  }
  return config;
}

function mergeNativeHooks(current, managed) {
  if (!object(current)) throw new Error('Existing native hooks must be a plugin object');
  validateNativeHooks(managed);
  for (const event of ['PreToolUse', 'PostToolUse', 'PreInvocation']) {
    const groups = managed['gsd-antigravity']?.[event];
    if (!Array.isArray(groups) || !groups.some(group => group.hooks.length > 0)) {
      throw new Error('Managed GSD native hook is missing: ' + event);
    }
  }
  const result = structuredClone(current);
  for (const [plugin, definition] of Object.entries(managed)) {
    const previous = object(current[plugin]) ? current[plugin] : {};
    result[plugin] = { ...previous, ...structuredClone(definition) };
    // Keep an explicit user disable; updating commands is not permission to
    // reactivate a plugin the user disabled.
    if (typeof previous.enabled === 'boolean') result[plugin].enabled = previous.enabled;
  }
  return validateNativeHooks(result);
}

module.exports = { validateNativeHooks, mergeNativeHooks, nativeHooksPath };
