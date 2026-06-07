import fs from 'fs';
import path from 'path';
import { runAgent } from './agent.js';
import { loadEnvFile } from './env.js';

loadEnvFile();

const args = process.argv.slice(2);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith('--')) {
      parsed[item.slice(2)] = argv[index + 1];
      index += 1;
    } else if (!parsed.repoUrl) {
      parsed.repoUrl = item;
    }
  }
  return parsed;
}

function usage() {
  console.log('Usage: node src/cli.js --api-key <key> --base-url <url> --model-name <model> --repo-url <github-repo-url>');
  console.log('Mock mode: node src/cli.js --api-key mock --base-url mock --model-name mock --repo-url <repo-url>');
}

const parsed = parseArgs(args);
const repoUrl = parsed['repo-url'] || parsed.repoUrl;
const apiKey = parsed['api-key'] || process.env.AGENT_API_KEY || 'mock';
const baseUrl = parsed['base-url'] || process.env.AGENT_BASE_URL || 'mock';
const modelName = parsed['model-name'] || process.env.AGENT_MODEL_NAME || 'mock';
const verifyTimeoutMs = parsed['verify-timeout-ms'] ? Number(parsed['verify-timeout-ms']) : undefined;
const maxIterations = parsed['max-iterations'] ? Number(parsed['max-iterations']) : undefined;

if (!repoUrl) {
  usage();
  process.exit(1);
}

const baseDir = path.join(process.cwd(), 'runs');
fs.mkdirSync(baseDir, { recursive: true });

const result = await runAgent({ apiKey, baseUrl, modelName, repoUrl }, {
  baseDir,
  verifyTimeoutMs,
  maxIterations
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'success' ? 0 : 1);
