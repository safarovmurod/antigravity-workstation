'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const hooksRoot = __dirname;
const stateRoot = path.resolve(hooksRoot, '..', '..', 'antigravity-ide', 'hook-state');
const toolNames = {
  view_file: 'Read', write_to_file: 'Write', replace_file_content: 'Edit',
  multi_replace_file_content: 'Edit', run_command: 'Bash',
  grep_search: 'Grep', invoke_subagent: 'Agent'
};
function normalize(input, subagent) {
  const call = input.toolCall || {};
  const args = call.args || {};
  const translated = {
    tool_name: toolNames[call.name] || call.name,
    tool_input: {
      file_path: args.TargetFile || args.AbsolutePath || args.SearchPath,
      command: args.CommandLine,
      content: args.CodeContent,
      old_string: args.TargetContent,
      new_string: args.ReplacementContent,
      glob: Array.isArray(args.Includes) ? args.Includes.join(',') : args.Includes,
      prompt: subagent?.Prompt,
      subagent_type: subagent?.TypeName,
      description: subagent?.Role
    },
    cwd: args.Cwd || input.workspacePaths?.[0] || process.cwd(),
    transcript_path: input.transcriptPath,
    tool_response: input.toolResponse,
    conversation_id: input.conversationId,
    hook_event_name: input.eventName
  };
  if (Array.isArray(args.ReplacementChunks)) {
    translated.tool_input.old_string = args.ReplacementChunks.map(chunk => chunk.TargetContent || '').join('\n');
    translated.tool_input.new_string = args.ReplacementChunks.map(chunk => chunk.ReplacementContent || '').join('\n');
  }
  // GSD's read guard treats session_id as proof of Claude Code. Do not supply it.
  return translated;
}
function runLegacy(name, payload) {
  const file = path.join(hooksRoot, name);
  const shell = name.endsWith('.sh');
  const executable = shell ? process.argv[3] : process.execPath;
  if (!executable) throw new Error('Git Bash path missing; rerun setup to refresh hook commands.');
  const result = spawnSync(executable, [file], {
    input: JSON.stringify(name === 'gsd-read-guard.js' ? payload : { ...payload, session_id: payload.conversation_id }), encoding: 'utf8', cwd: payload.cwd,
    timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true
  });
  if (result.error) throw new Error(name + ': ' + result.error.message);
  let output = {};
  const text = (result.stdout || '').trim();
  if (text) {
    try { output = JSON.parse(text); }
    catch {
      if (result.status === 2) output = { decision: 'block', reason: text };
      else throw new Error(name + ': invalid hook JSON');
    }
  }
  if (result.status !== 0 && result.status !== 2) throw new Error(name + ': exit ' + result.status);
  const specific = output.hookSpecificOutput || {};
  return {
    blocked: result.status === 2 || output.decision === 'block' || output.decision === 'deny' || specific.permissionDecision === 'deny',
    reason: output.reason || specific.permissionDecisionReason || specific.additionalContext || '',
    context: specific.additionalContext || output.additionalContext || ''
  };
}
function stateFile(input) {
  const id = String(input.conversationId || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_').slice(0,100);
  return path.join(stateRoot, id + '.json');
}
function readState(input) {
  try { return JSON.parse(fs.readFileSync(stateFile(input), 'utf8')); }
  catch { return { started: false, pending: [] }; }
}
function saveState(input, state) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(stateFile(input), JSON.stringify(state));
}
function preHooks(tool) {
  const list = [];
  if (tool === 'Write') list.push('gsd-write-guard.js');
  if (['Write','Edit','MultiEdit'].includes(tool)) list.push('gsd-prompt-guard.js','gsd-read-guard.js');
  if (['Bash','Write','Edit','MultiEdit'].includes(tool)) list.push('gsd-workflow-guard.js');
  if (['Write','Edit','MultiEdit'].includes(tool)) list.push('gsd-worktree-path-guard.js');
  if (tool === 'Agent') list.push('gsd-agent-isolation-guard.js');
  if (['Read','Grep','Bash'].includes(tool)) list.push('gsd-secret-read-guard.js');
  if (tool === 'Bash') list.push('gsd-validate-commit.sh');
  return list;
}
function handle(event, input, run = runLegacy) {
  input.eventName = event;
  const payload = normalize(input);
  if (event === 'PreToolUse') {
    const reasons = [];
    for (const name of preHooks(payload.tool_name)) {
      const specs = payload.tool_name === 'Agent' ? input.toolCall.args.Subagents || [] : [null];
      for (const spec of specs) {
        const result = run(name, normalize(input, spec));
        if (result.blocked) return { decision: 'deny', reason: result.reason || 'GSD guard blocked this action.' };
        if (result.reason) reasons.push(result.reason);
      }
    }
    // Keep Antigravity's approval grants. Passing a guard must not globally auto-approve tools.
    const output = { decision: 'ask' };
    if (reasons.length) output.reason = [...new Set(reasons)].join('\n');
    return output;
  }
  if (event === 'PostToolUse') {
    const names = [];
    if (['Bash','Write','Edit','MultiEdit','Agent'].includes(payload.tool_name)) names.push('gsd-context-monitor.js');
    if (payload.tool_name === 'Read') names.push('gsd-read-injection-scanner.js');
    if (payload.tool_name === 'Bash') names.push('gsd-graphify-update.sh');
    if (['Write','Edit','MultiEdit'].includes(payload.tool_name)) names.push('gsd-phase-boundary.sh');
    const contexts = [];
    for (const name of names) {
      const result = run(name, payload);
      if (result.context) contexts.push(result.context);
    }
    if (contexts.length) {
      const state = readState(input);
      state.pending = [...new Set([...(state.pending || []), ...contexts])].slice(-10);
      saveState(input, state);
    }
    return {};
  }
  if (event === 'PreInvocation') {
    const state = readState(input);
    const contexts = state.pending || [];
    if (!state.started) {
      run('gsd-check-update.js', payload);
      const result = run('gsd-session-state.sh', payload);
      if (result.context) contexts.push(result.context);
      state.started = true;
    }
    state.pending = [];
    saveState(input, state);
    if (contexts.length) return { injectSteps: contexts.map(message => ({ ephemeralMessage: message })) };
    return {};
  }
  throw new Error('Unsupported hook event');
}
function main() {
  const event = process.argv[2];
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => text += chunk);
  process.stdin.on('end', () => {
    try { process.stdout.write(JSON.stringify(handle(event, JSON.parse(text)))); }
    catch (error) {
      // Keep failed safety checks visible; do not report an unverified action as safe.
      const output = event === 'PreToolUse'
        ? { decision: 'ask', reason: 'GSD hook could not verify this action: ' + error.message }
        : {};
      process.stdout.write(JSON.stringify(output));
      process.stderr.write(error.message + '\n');
    }
  });
}
if (require.main === module) main();
module.exports = { normalize, handle, runLegacy, preHooks };
