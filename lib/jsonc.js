'use strict';

const fs = require('node:fs');

function stripJsonComments(str) {
  let insideString = false;
  let stringChar = '';
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (insideString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === stringChar) {
        insideString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      insideString = true;
      stringChar = char;
      result += char;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      const lineEnd = str.indexOf('\n', i + 2);
      if (lineEnd === -1) break;
      i = lineEnd - 1;
      result += ' ';
      continue;
    }

    if (char === '/' && nextChar === '*') {
      const commentEnd = str.indexOf('*/', i + 2);
      if (commentEnd === -1) break;
      i = commentEnd + 1;
      result += ' ';
      continue;
    }

    result += char;
  }

  let cleaned = '', quoted = false, escaped = false;
  for (let index = 0; index < result.length; index++) {
    const character = result[index];
    if (quoted) {
      cleaned += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    if (character === ',') {
      let next = index + 1;
      while (/\s/.test(result[next] || '') && next < result.length) next++;
      if (result[next] === '}' || result[next] === ']') continue;
    }
    cleaned += character;
  }
  return cleaned.replace(/^\uFEFF/, '');
}

function parseJsonc(content, fallback = {}) {
  if (!content || !content.trim()) return fallback;
  try {
    const cleaned = stripJsonComments(content);
    return JSON.parse(cleaned);
  } catch (err) {
    try {
      return JSON.parse(content);
    } catch (_) {
      throw new Error(`JSONC parse error: ${err.message}`);
    }
  }
}

function readJsonFile(file, options = {}) {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!content.trim() && Object.hasOwn(options, 'emptyValue')) return options.emptyValue;
  try {
    return options.jsonc ? parseJsonc(content) : JSON.parse(content);
  } catch {
    const label = options.jsonc ? 'JSONC parse error' : 'Invalid JSON';
    const reason = content.trim() ? 'incomplete or malformed content' : 'file is empty';
    throw new Error(`${label} in "${file}": ${reason}. Existing file preserved.`);
  }
}

function deepMerge(target, source) {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) target = {};
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      key in target &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

module.exports = { stripJsonComments, parseJsonc, readJsonFile, deepMerge };
