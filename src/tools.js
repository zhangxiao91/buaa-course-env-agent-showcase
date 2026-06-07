import fs from 'fs';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';

const ALLOWED_COMMANDS = new Set([
  'git',
  'node',
  'npm',
  'pnpm',
  'python',
  'pip',
  'yarn',
  'bun',
  'uvicorn',
  'vite'
]);

export function isAllowedCommand(command) {
  return ALLOWED_COMMANDS.has(command);
}

function isPackageInstallArgs(args) {
  if (args[0] !== 'install') return false;
  return args.slice(1).every((arg) => ['--no-fund', '--no-audit', '--frozen-lockfile'].includes(arg));
}

function isPackageRunArgs(args) {
  if (args[0] === 'run') return ['start', 'dev'].includes(args[1]) && args.length === 2;
  return ['start', 'dev'].includes(args[0]) && args.length === 1;
}

function isSafeScriptFile(file) {
  return ['app.js', 'main.js', 'server.js', 'index.js', 'app.py', 'main.py', 'server.py'].includes(file);
}

function isPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function isAllowedInvocation(command, args) {
  if (!ALLOWED_COMMANDS.has(command)) return false;

  if (command === 'git') {
    return (args.length === 1 && args[0] === '--version')
      || (args.length === 5 && args[0] === 'clone' && args[1] === '--depth' && args[2] === '1');
  }

  if (['node', 'python'].includes(command) && args.length === 1 && ['-v', '--version'].includes(args[0])) {
    return true;
  }

  if (command === 'node') {
    return args.length === 1 && isSafeScriptFile(args[0]);
  }

  if (command === 'python') {
    if (args.length === 1 && isSafeScriptFile(args[0])) return true;
    if (args.join(' ') === '-m venv .venv') return true;
    if (args.join(' ') === '-m pip install -r requirements.txt') return true;
    return args.length === 9
      && args[0] === '-m'
      && args[1] === 'flask'
      && args[2] === '--app'
      && /^[A-Za-z_][A-Za-z0-9_]*$/.test(args[3])
      && args[4] === 'run'
      && args[5] === '--host'
      && args[6] === '127.0.0.1'
      && args[7] === '--port'
      && isPort(args[8]);
  }

  if (command === 'pip') {
    return (args.length === 1 && args[0] === '--version')
      || args.join(' ') === 'install -r requirements.txt';
  }

  if (['npm', 'pnpm', 'yarn', 'bun'].includes(command)) {
    if (args.length === 1 && args[0] === '-v') return true;
    return isPackageInstallArgs(args) || isPackageRunArgs(args);
  }

  if (command === 'uvicorn') {
    return args.length >= 1
      && /^[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_]*$/.test(args[0])
      && args.every((arg) => !/[;&|<>]/.test(arg));
  }

  if (command === 'vite') {
    return args.every((arg) => ['--host', '127.0.0.1'].includes(arg));
  }

  return false;
}

function quoteArg(arg) {
  if (arg === '') return '""';
  if (/[\s"&<>|^]/.test(arg)) {
    return `"${arg.replace(/(["^&|<>])/g, '^$1')}"`;
  }
  return arg;
}

export function createTools(logger) {
  return {
    async readText(filePath) {
      return fs.promises.readFile(filePath, 'utf8');
    },

    async exists(filePath) {
      try {
        await fs.promises.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async list(dirPath) {
      return fs.promises.readdir(dirPath, { withFileTypes: true });
    },

    async exec(command, args = [], options = {}) {
      if (!isAllowedInvocation(command, args)) {
        return {
          code: -1,
          stdout: '',
          stderr: `Command blocked by allowlist: ${[command].concat(args).join(' ')}`,
          blocked: true
        };
      }

      const cwd = options.cwd || process.cwd();
      const label = options.label || [command].concat(args).join(' ');
      logger.write({ stage: 'act', type: 'command:start', message: label, cwd });
      const useCmd = process.platform === 'win32' && command === 'npm';
      const timeoutMs = options.timeoutMs || 120000;

      return await new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        const child = useCmd
          ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args.map(quoteArg)], {
              cwd,
              env: { ...process.env, ...(options.env || {}) },
              shell: false,
              windowsHide: true
            })
          : spawn(command, args, {
              cwd,
              env: { ...process.env, ...(options.env || {}) },
              shell: false,
              windowsHide: true
            });

        const timer = setTimeout(() => {
          logger.write({ stage: 'error', type: 'command:timeout', message: label, timeoutMs });
          child.kill();
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
          if (options.stream) process.stdout.write(chunk);
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
          if (options.stream) process.stderr.write(chunk);
        });

        child.on('error', (error) => {
          logger.write({
            stage: 'error',
            type: 'command:error',
            message: label,
            error: error.message
          });
          resolve({ code: -1, stdout, stderr, error });
        });

        child.on('close', (code, signal) => {
          clearTimeout(timer);
          logger.write({
            stage: code === 0 ? 'verify' : 'error',
            type: 'command:end',
            message: label,
            code,
            signal
          });
          resolve({ code, signal, stdout, stderr });
        });
      });
    },

    async startProcess(command, args = [], options = {}) {
      if (!isAllowedInvocation(command, args)) {
        throw new Error(`Command blocked by allowlist: ${[command].concat(args).join(' ')}`);
      }

      const cwd = options.cwd || process.cwd();
      const label = options.label || [command].concat(args).join(' ');
      const logPath = options.logPath;
      const out = logPath ? fs.openSync(logPath, 'a') : 'ignore';
      const err = logPath ? fs.openSync(logPath, 'a') : 'ignore';
      const useCmd = process.platform === 'win32' && command === 'npm';
      logger.write({ stage: 'act', type: 'process:start', message: label, cwd });

      const child = useCmd
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args.map(quoteArg)], {
            cwd,
            env: { ...process.env, ...(options.env || {}) },
            detached: true,
            stdio: ['ignore', out, err],
            windowsHide: true
          })
        : spawn(command, args, {
            cwd,
            env: { ...process.env, ...(options.env || {}) },
            detached: true,
            stdio: ['ignore', out, err],
            windowsHide: true
          });

      let earlyExit = null;
      child.once('exit', (code, signal) => {
        earlyExit = { code, signal };
      });

      await new Promise((resolve) => setTimeout(resolve, options.startupGraceMs || 1000));
      child.unref();

      return {
        pid: child.pid,
        command,
        args,
        logPath,
        earlyExit
      };
    },

    async clone(repoUrl, destPath) {
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      return await this.exec('git', ['clone', '--depth', '1', repoUrl, destPath], {
        cwd: path.dirname(destPath),
        label: `git clone ${repoUrl}`,
        timeoutMs: 120000
      });
    },

    async writeText(filePath, text) {
      await fs.promises.writeFile(filePath, text, 'utf8');
    },

    async waitForHttp(url, timeoutMs = 30000, intervalMs = 1000) {
      const deadline = Date.now() + timeoutMs;
      let lastError = null;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const text = await res.text();
          if (res.ok) {
            return {
              ok: true,
              status: res.status,
              bodyPreview: text.slice(0, 200)
            };
          }
          lastError = new Error(`HTTP ${res.status}`);
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      return {
        ok: false,
        error: lastError ? lastError.message : 'timeout'
      };
    },

    async findFreePort(startPort = 3000, endPort = 3999) {
      const span = endPort - startPort + 1;
      const first = startPort + Math.floor(Math.random() * span);
      const ports = [];
      for (let offset = 0; offset < span; offset += 1) {
        ports.push(startPort + ((first - startPort + offset) % span));
      }

      for (const port of ports) {
        const available = await new Promise((resolve) => {
          const server = net.createServer();
          server.unref();
          server.on('error', () => resolve(false));
          server.listen(port, '127.0.0.1', () => {
            server.close(() => resolve(true));
          });
        });
        if (available) return port;
      }
      throw new Error(`No free port found in range ${startPort}-${endPort}`);
    }
  };
}
