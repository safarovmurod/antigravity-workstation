import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === '.git' || file === 'node_modules') continue;
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
  const allFiles = getAllFiles(repoRoot);
  assert.ok(allFiles.length > 10, 'Repository should contain project files');

  const forbiddenPatterns = [
    { name: 'Hardcoded user path', regex: /[C|c]:\\Users\\safar|[C|c]:\/Users\/safar/ },
    { name: 'Active GitHub Personal Access Token', regex: /ghp_[A-Za-z0-9_]{36,}/ },
    { name: 'Active Google / Gemini API key', regex: /AIza[0-9A-Za-z-_]{35}/ },
    { name: 'Private Key header', regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP|PRIVATE) KEY-----/ },
  ];

  const violations = [];
  // Compare with actual local MCP credentials without displaying their values.
  const privateValues = [];
  const home = process.env.USERPROFILE;
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
