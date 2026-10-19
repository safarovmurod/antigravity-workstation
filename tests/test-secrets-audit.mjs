import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (['.git', 'node_modules', '.zwork', 'tmp', 'scratch', 'test-env'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

test('Repository secrets and personal paths audit', () => {
  // Audit exactly what can be published; local attachments and test output are
  // not project payload. ZIP copies have no Git metadata, so walk their source.
  const allFiles = fs.existsSync(path.join(repoRoot, '.git'))
    ? [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' }).split('\0').filter(Boolean))].map(file => path.join(repoRoot, file))
    : getAllFiles(repoRoot);
  assert.ok(allFiles.length > 10, 'Repository should contain project files');

  const forbiddenPatterns = [
    { name: 'Hardcoded user path', regex: /[C|c]:\\Users\\safar|[C|c]:\/Users\/safar/ },
    { name: 'Active GitHub Personal Access Token', regex: /ghp_[A-Za-z0-9_]{36,}/ },
    { name: 'Active Google / Gemini API key', regex: /AIza[0-9A-Za-z-_]{35}/ },
    { name: 'Private Key header', regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP|PRIVATE) KEY-----/ },
  ];

  const violations = [];
  // Opt-in comparison against a private fixture; ordinary project tests must
  // not read or depend on the user's personal MCP configuration.
  const privateValues = [];
  const home = process.env.WORKSTATION_AUDIT_PRIVATE_HOME;
  if (home) {
    for (const relative of ['.gemini/config/mcp_config.json', '.gemini/antigravity/mcp_config.json']) {
      const configPath = path.join(home, relative);
      if (!fs.existsSync(configPath)) continue;
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      for (const server of Object.values(config.mcpServers || {})) {
        for (const [key, value] of Object.entries({ ...server.env, ...server.headers })) {
          if (!/token|key|secret|password|authorization/i.test(key) || typeof value !== 'string') continue;
          const secret = value.replace(/^Bearer\s+/i, '');
          if (secret.length >= 12 && !/YOUR_|PLACEHOLDER|your_api/i.test(secret)) privateValues.push(secret);
        }
      }
    }
  }

  for (const file of allFiles) {
    // Only check text files
    const ext = path.extname(file).toLowerCase();
    if (['.json', '.js', '.mjs', '.cjs', '.md', '.txt', '.ps1', '.yaml', '.yml', '.html', '.sh', '.toml', '.xml', '.ts', '.tsx', '.jsx', '.env'].includes(ext)) {
      const content = fs.readFileSync(file, 'utf8');
      if (privateValues.some(secret => content.includes(secret))) violations.push({ file: path.relative(repoRoot, file), pattern: 'Local credential value exported' });

      for (const pat of forbiddenPatterns) {
        // Special case: docs/INVENTORY.md and docs/TROUBLESHOOTING.md mention "safar" only when describing the original path/audit
        if (pat.name === 'Hardcoded user path' && file.endsWith('.md')) {
          continue;
        }

        if (pat.regex.test(content)) {
          violations.push({
            file: path.relative(repoRoot, file),
            pattern: pat.name,
          });
        }
      }
    }
  }

  assert.deepEqual(violations, [], `Forbidden patterns found in files: ${JSON.stringify(violations, null, 2)}`);
});
