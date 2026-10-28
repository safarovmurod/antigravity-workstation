#!/usr/bin/env node
'use strict';

const { runInstaller } = require('../lib/installer');
const { runDoctor } = require('../lib/doctor');
const { createBackup, restoreBackup, listBackups } = require('../lib/backup');
const { getEnvironmentPaths } = require('../lib/paths');

function parseArgs(args) {
  const result = {
    command: 'install',
    displayName: 'Разработчик',
    dryRun: false,
    skipExtensions: false,
    cleanExtensions: false,
    skipAgentBrowser: false,
    skipFont: false,
    skipPermissions: false,
    autoApprove: false,
    quietCompletion: false,
    applyProfile: false,
    rulesOnly: false,
    extensionProfile: null,
    json: false,
    home: null,
    backupDir: null,
    help: false,
    version: false,
  };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      result.dryRun = true;
    } else if (arg === '--skip-extensions') {
      result.skipExtensions = true;
    } else if (arg === '--clean-extensions') {
      result.cleanExtensions = true;
    } else if (arg === '--skip-agent-browser') {
      result.skipAgentBrowser = true;
    } else if (arg === '--skip-font') {
      result.skipFont = true;
    } else if (arg === '--skip-permissions') {
      result.skipPermissions = true;
    } else if (arg === '--auto-approve') {
      result.autoApprove = true;
    } else if (arg === '--quiet-completion') {
      result.quietCompletion = true;
    } else if (arg === '--apply-profile') {
      result.applyProfile = true;
    } else if (arg === '--rules-only') {
      result.rulesOnly = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--extension-profile') {
      if (!['full', 'lite'].includes(args[i + 1])) throw new Error('--extension-profile must be full or lite');
      result.extensionProfile = args[++i];
    } else if (arg === '--home') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error('--home needs a path');
      result.home = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.displayName = args[++i];
      }
    } else if (arg.startsWith('--name=')) {
      result.displayName = arg.slice(7);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error('Unknown option: ' + arg);
    }
  }

  if (positional.length > 0) {
    result.command = positional[0].toLowerCase();
    if (positional.length > 1) {
      result.backupDir = positional[1];
    }
  }

  return result;
}

function showHelp() {
  console.log(`
Workstation Antigravity Setup CLI

USAGE:
  npx.cmd --yes github:safarovmurod/antigravity-workstation [command] [options]
  node bin/workstation-setup.js [command] [options]
  Windows PowerShell: use npx.cmd; macOS/Linux rules-only: use npx.

COMMANDS:
  install             Apply the complete Antigravity setup (default)
  permissions         Apply global MCP auto-allow with Antigravity closed
  permissions-restore [dir] Restore only MCP preferences from a private backup
  automation          Enable native terminal/artifact Always Proceed and MCP Allow;
                      disable native AI Tab; wait for a normal IDE shutdown when needed
  quiet-completion    Disable AI Tab/next-edit and transparent inline suggestions;
                      preserve ordinary IntelliSense and existing chat approvals
  extensions-restore <dir> Restore packages/index from an interrupted clean installation
  automation-restore [dir] Restore only automation preferences from a private backup
  doctor              Diagnose prerequisites, paths, and settings health
  status              Show whether native settings are waiting, applied or interrupted
  resume              Resume an interrupted authorized native setup request
  backup              Create a manual backup of current settings & rules
  restore [dir]       Restore previous settings from backup
  help                Show this help message

OPTIONS:
  --apply-profile     Explicitly replace existing managed editor preferences with project defaults
  --quiet-completion  Explicitly disable AI completion during install; preserve agent approvals
  --name, -n <name>   Set your preferred display name (default: "Разработчик")
  --dry-run, -d       Preview changes without writing any files
  --skip-extensions   Configure settings & rules without downloading extensions
  --clean-extensions  Archive extra/old extensions, reuse valid required packages and install the full catalog;
                      requires every IDE window closed; failure restores the old packages
  --skip-agent-browser Skip browser CLI/runtime installation
  --skip-font         Skip Windows font installation/registration
  --skip-permissions  Preserve approvals; recommended inside Antigravity terminal
  --auto-approve      Apply native automation, or queue it until the IDE closes
  --rules-only        Install/update current rules and guides without settings, MCP or extensions
  --extension-profile <full|lite> Select extensions to install (default full); existing extensions stay installed
  --json              Print machine-readable status
  --home <path>       Explicit user home for isolated rules-only operations
  --help, -h          Show help message
  --version, -v       Show package version

EXAMPLES:
  npx.cmd --yes github:safarovmurod/antigravity-workstation install --skip-permissions --name "Разработчик"
  npx.cmd --yes github:safarovmurod/antigravity-workstation install --skip-permissions --dry-run
  npx.cmd --yes github:safarovmurod/antigravity-workstation install --rules-only --dry-run
  npx.cmd --yes github:safarovmurod/antigravity-workstation doctor
`);
}

function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);
  if (opts.autoApprove && (opts.skipPermissions || opts.rulesOnly)) throw new Error('--auto-approve cannot be combined with --skip-permissions or --rules-only');
  if (opts.home && !(opts.command === 'install' && opts.rulesOnly)) {
    throw new Error('--home is supported only with install --rules-only');
  }
  if (opts.rulesOnly && opts.command !== 'install') throw new Error('--rules-only needs install');
  if (opts.cleanExtensions && (opts.command !== 'install' || opts.rulesOnly || opts.skipExtensions || (opts.extensionProfile && opts.extensionProfile !== 'full'))) {
    throw new Error('--clean-extensions requires a full extension installation');
  }

  if (opts.version) {
    const pkg = require('../package.json');
    console.log(`antigravity-workstation-setup v${pkg.version}`);
    process.exit(0);
  }

  if (opts.help || opts.command === 'help') {
    showHelp();
    process.exit(0);
  }

  const envPaths = getEnvironmentPaths();

  switch (opts.command) {
    case 'extensions-restore': {
      try {
        if (!opts.backupDir) throw new Error('extensions-restore requires an explicit extension-reset backup directory');
        const result = require('../lib/extension-reset').restoreExtensionReset(envPaths, opts.backupDir, { dryRun: opts.dryRun });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.restored || result.dryRun ? 0 : 1);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'status': {
      try {
        const result = require('../lib/setup-status').getSetupStatus(envPaths);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(require('../lib/setup-status').formatSetupStatus(result));
        process.exit(result.state === 'failed' ? 1 : 0);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'resume': {
      try {
        const result = require('../lib/setup-status').recoverPending(envPaths, { dryRun: opts.dryRun });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.state === 'invalid' || result.state === 'failed' ? 1 : 0);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'quiet-completion': {
      try {
        const result = require('../lib/quiet-completion').applyQuietCompletion(envPaths, { dryRun: opts.dryRun });
        console.log(JSON.stringify(result, null, 2));
        if (!result.success) console.error('Quiet completion incomplete: ' + (result.native?.reason || 'Native completion settings were not applied or queued'));
        process.exit(result.success ? 0 : 1);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'automation': {
      try {
        const result = require('../lib/agent-automation').queueAutomation(envPaths, { dryRun: opts.dryRun });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.applied || result.queued || result.dryRun ? 0 : 1);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'automation-restore': {
      try {
        if (opts.dryRun) throw new Error('automation-restore requires a closed IDE and an explicit backup directory');
        const result = require('../lib/agent-automation').restoreAutomation(envPaths, opts.backupDir);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.applied ? 0 : 1);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'permissions-restore': {
      try {
        if (opts.dryRun) throw new Error('Use permissions --dry-run for preview; restore requires an explicit backup directory');
        const result = require('../lib/mcp-permissions').restoreMcpPermissions(envPaths, opts.backupDir);
        console.log(JSON.stringify(result, null, 2)); process.exit(0);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'permissions': {
      try {
        const result = require('../lib/mcp-permissions').applyMcpPermissions(envPaths, { dryRun: opts.dryRun });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.applied || result.dryRun ? 0 : 1);
      } catch (error) { console.error(error.message); process.exit(1); }
      break;
    }
    case 'doctor': {
      const docRes = runDoctor({ ...(opts.extensionProfile ? { extensionProfile: opts.extensionProfile } : {}) });
      process.exit(docRes.ok ? 0 : 1);
      break;
    }

    case 'backup': {
      if (opts.dryRun) {
        console.log(`[DRY-RUN] Would create a manual setup backup under ${envPaths.backupsDir}; no files written.`);
        process.exit(0);
      }
      console.log('Creating manual backup of Antigravity settings...');
      const bRes = createBackup(envPaths, 'manual');
      console.log(`✓ Backup saved to: ${bRes.backupDir}`);
      console.log(`  Files included: ${bRes.backedUp.join(', ')}`);
      process.exit(0);
      break;
    }

    case 'restore': {
      let targetBackup = opts.backupDir;
      if (!targetBackup) {
        const all = listBackups(envPaths);
        const backups = all.filter(item => item.manifest !== null);
        if (backups.length === 0) {
          console.error(all.length
            ? 'No restorable backups found in ' + envPaths.backupsDir + ' (' + all.length + ' incomplete manifest-less copies skipped)'
            : 'No previous backups found in ' + envPaths.backupsDir);
          process.exit(1);
        }
        targetBackup = backups[0].path;
        console.log(`Restoring most recent restorable backup: ${backups[0].name}`);
      }
      try {
        const rRes = require('../lib/rollback').restoreSetup(targetBackup, envPaths, { dryRun: opts.dryRun });
        console.log(JSON.stringify(rRes, null, 2));
        if (rRes.success && !opts.dryRun) console.log('Save work and fully reopen Antigravity to load restored settings.');
        process.exit(rRes.success ? 0 : 1);
      } catch (err) {
        console.error(`Restore failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'install': {
      try {
        const res = runInstaller({
          displayName: opts.displayName,
          dryRun: opts.dryRun,
          skipExtensions: opts.skipExtensions,
          cleanExtensions: opts.cleanExtensions,
          skipAgentBrowser: opts.skipAgentBrowser,
          skipFont: opts.skipFont,
          skipPermissions: opts.skipPermissions,
          autoApprove: opts.autoApprove,
          quietCompletion: opts.quietCompletion,
          applyProfile: opts.applyProfile,
          rulesOnly: opts.rulesOnly,
          extensionProfile: opts.extensionProfile || 'full',
          home: opts.home,
          log: opts.rulesOnly ? console.error : console.log,
        });
        if (opts.rulesOnly) console.log(JSON.stringify(res, null, 2));
        process.exit(res.success ? 0 : 1);
      } catch (err) {
        console.error(`\nInstallation failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error('Unknown command: ' + opts.command);
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}
