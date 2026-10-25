'use strict';
const { isDeepStrictEqual: same } = require('node:util');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function mergeConfiguration(current, managed, keys = []) {
  if (Array.isArray(managed)) {
    if (current !== undefined && !Array.isArray(current)) throw new Error('Invalid array at ' + keys.join('.'));
    const previous = Array.isArray(current) ? current : [];
    if (keys.join('.') === 'permissions.allow') {
      const result = structuredClone(previous);
      for (const value of managed) if (!result.some(item => same(item, value))) result.push(structuredClone(value));
      return result;
    }
    if (keys[0] === 'hooks') {
      const result = structuredClone(previous);
      for (const entry of managed) {
        const commands = entry.hooks?.map(hook => hook.command) || [];
        const index = result.findIndex(item => item.matcher === entry.matcher && item.hooks?.some(hook => commands.includes(hook.command)));
        if (index < 0) result.push(structuredClone(entry));
        else result[index] = mergeConfiguration(result[index], entry, [...keys, 'entry']);
      }
      return result;
    }
    throw new Error('No managed array policy for ' + keys.join('.'));
  }
  if (!object(managed)) return managed;
  const result = object(current) ? structuredClone(current) : {};
  for (const [key, value] of Object.entries(managed)) {
    if (key === 'hooks' && Array.isArray(value) && keys[0] === 'hooks') {
      const hooks = Array.isArray(result[key]) ? result[key] : [];
      result[key] = hooks.map(hook => {
        const desired = value.find(item => item.command === hook.command);
        return desired ? mergeConfiguration(hook, desired, [...keys, key]) : hook;
      });
      for (const hook of value) if (!hooks.some(item => item.command === hook.command)) result[key].push(structuredClone(hook));
    } else result[key] = mergeConfiguration(result[key], value, [...keys, key]);
  }
  return result;
}
function retireOwnedHooks(current, retired, managed) {
  const result = structuredClone(current);
  for (const [event, previousGroups] of Object.entries(retired.hooks || {})) {
    if (!Array.isArray(result.hooks?.[event])) continue;
    result.hooks[event] = result.hooks[event].flatMap(group => {
      if (!Array.isArray(group.hooks)) return [group];
      const candidates = previousGroups.filter(previous => previous.matcher === group.matcher);
      const hooks = group.hooks.filter(hook => !candidates.some(previous => previous.hooks.some(old => same(old, hook)))
        || managed.hooks?.[event]?.some(next => next.matcher === group.matcher && next.hooks?.some(value => same(value, hook))));
      if (hooks.length === group.hooks.length) return [group];
      const bareManagedGroup = candidates.some(previous => Object.keys(group).filter(key => key !== 'hooks')
        .every(key => same(group[key], previous[key])));
      return !hooks.length && bareManagedGroup ? [] : [{ ...group, hooks }];
    });
  }
  return result;
}
module.exports = { mergeConfiguration, retireOwnedHooks };
