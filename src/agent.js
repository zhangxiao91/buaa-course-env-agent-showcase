import fs from 'fs';
import path from 'path';
import { RunLogger } from './logger.js';
import { Planner } from './planner.js';
import { createTools } from './tools.js';

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function actionKey(action) {
  if (!action) return 'none';
  return JSON.stringify({
    tool: action.tool,
    command: action.command,
    args: action.args || []
  });
}

function normalizeAction(action, { stage, stack }) {
  if (!action) return action;
  if (stage === 'install'
    && stack.stack === 'python'
    && action.tool === 'runCommand'
    && action.command === 'pip'
    && Array.isArray(action.args)
    && action.args.join(' ') === 'install -r requirements.txt') {
    return {
      ...action,
      command: 'python',
      args: ['-m', 'pip', 'install', '-r', 'requirements.txt'],
      reason: `${action.reason || 'Install Python dependencies.'} Normalized to python -m pip so the project venv is used.`
    };
  }
  return action;
}

async function safeRead(tools, filePath, limit = 6000) {
  if (!(await tools.exists(filePath))) return null;
  const text = await tools.readText(filePath);
  return text.slice(0, limit);
}

async function collectFiles(repoPath, tools) {
  const entries = await tools.list(repoPath);
  return entries
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function detectStack(repoPath, tools) {
  const packageJsonPath = path.join(repoPath, 'package.json');
  const requirementsPath = path.join(repoPath, 'requirements.txt');
  const pyprojectPath = path.join(repoPath, 'pyproject.toml');
  const packageJson = (await tools.exists(packageJsonPath))
    ? safeJsonParse(await tools.readText(packageJsonPath))
    : null;
  const hasRequirements = await tools.exists(requirementsPath);
  const hasPyproject = await tools.exists(pyprojectPath);

  if (packageJson) {
    return {
      stack: 'node',
      packageJson,
      packageJsonPath
    };
  }

  if (hasRequirements || hasPyproject) {
    return {
      stack: 'python',
      requirementsPath: hasRequirements ? requirementsPath : null,
      pyprojectPath: hasPyproject ? pyprojectPath : null
    };
  }

  return {
    stack: 'unknown'
  };
}

async function detectEnvironment(tools, stack) {
  const checks = stack.stack === 'node'
    ? [
        ['git', ['--version']],
        ['node', ['-v']],
        ['npm', ['-v']],
        ['pnpm', ['-v']],
        ['yarn', ['-v']]
      ]
    : [
        ['git', ['--version']],
        ['python', ['--version']],
        ['pip', ['--version']]
      ];

  const results = {};
  for (const [command, args] of checks) {
    const result = await tools.exec(command, args, {
      label: `${command} ${args.join(' ')}`,
      timeoutMs: 30000
    });
    results[command] = {
      ok: result.code === 0,
      output: (result.stdout || result.stderr || '').trim()
    };
  }

  const supported = stack.stack === 'node'
    ? results.git.ok && results.node.ok && results.npm.ok
    : stack.stack === 'python'
      ? results.git.ok && results.python.ok && results.pip.ok
      : false;

  return { checks: results, supported };
}

function targetUrl(port) {
  return `http://127.0.0.1:${port}/`;
}

function candidatePorts(stack, selectedPort) {
  return [selectedPort];
}

async function observe({ repoPath, tools, stack, env, stage, lastAction, port, iteration }) {
  const files = await collectFiles(repoPath, tools);
  return {
    iteration,
    stage,
    repoPath,
    stack: stack.stack,
    files,
    packageJson: stack.packageJson || null,
    environment: env,
    readme: await safeRead(tools, path.join(repoPath, 'README.md')),
    requirements: await safeRead(tools, path.join(repoPath, 'requirements.txt')),
    pyproject: await safeRead(tools, path.join(repoPath, 'pyproject.toml')),
    appPy: await safeRead(tools, path.join(repoPath, 'app.py')),
    envExample: await safeRead(tools, path.join(repoPath, '.env.example')),
    lastAction: lastAction
      ? {
          tool: lastAction.tool,
          command: lastAction.command,
          args: lastAction.args,
          code: lastAction.code,
          stdout: lastAction.stdout?.slice(-2000) || '',
          stderr: lastAction.stderr?.slice(-2000) || '',
          verification: lastAction.verification || null
        }
      : null,
    port,
    targetUrl: port ? targetUrl(port) : null
  };
}

async function executeAction(action, context) {
  const { repoPath, tools, runDir, port, toolEnv } = context;
  if (!action || !action.tool) {
    throw new Error('Planner returned action without tool');
  }

  if (action.tool === 'noop') {
    return { tool: 'noop', code: 0, stdout: action.reason || '', stderr: '' };
  }

  if (action.tool === 'stop') {
    return { tool: 'stop', code: 1, stdout: '', stderr: action.reason || 'Planner stopped' };
  }

  if (!Array.isArray(action.args)) {
    action.args = [];
  }

  if (action.tool === 'runCommand') {
    const result = await tools.exec(action.command, action.args, {
      cwd: repoPath,
      label: [action.command].concat(action.args).join(' '),
      timeoutMs: action.timeoutMs || 180000,
      env: toolEnv || {}
    });
    return { tool: action.tool, command: action.command, args: action.args, ...result };
  }

  if (action.tool === 'startProcess') {
    const logPath = path.join(runDir, 'app.log');
    const processInfo = await tools.startProcess(action.command, action.args, {
      cwd: repoPath,
      label: [action.command].concat(action.args).join(' '),
      logPath,
      env: {
        ...(toolEnv || {}),
        PORT: String(port),
        FLASK_RUN_PORT: String(port),
        PYTHONUNBUFFERED: '1'
      },
      startupGraceMs: 1000
    });
    const appLog = processInfo.earlyExit && await tools.exists(logPath)
      ? await tools.readText(logPath)
      : '';
    return {
      tool: action.tool,
      command: action.command,
      args: action.args,
      code: processInfo.earlyExit ? processInfo.earlyExit.code ?? 1 : 0,
      stdout: processInfo.earlyExit ? '' : `started pid ${processInfo.pid}`,
      stderr: processInfo.earlyExit
        ? `process exited early: ${JSON.stringify(processInfo.earlyExit)}\n${appLog.slice(-4000)}`
        : '',
      process: processInfo
    };
  }

  throw new Error(`Unsupported action tool: ${action.tool}`);
}

export async function runAgent(input, options = {}) {
  const repoUrl = typeof input === 'string' ? input : input.repoUrl;
  const apiKey = typeof input === 'string' ? options.apiKey : input.apiKey;
  const baseUrl = typeof input === 'string' ? options.baseUrl : input.baseUrl;
  const modelName = typeof input === 'string' ? options.modelName : input.modelName;

  if (!repoUrl) throw new Error('repoUrl is required');

  const baseDir = options.baseDir || path.join(process.cwd(), 'runs');
  const runId = options.runId || `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const runDir = path.join(baseDir, runId);
  const repoPath = path.join(runDir, 'repo');
  fs.mkdirSync(runDir, { recursive: true });

  const logger = new RunLogger(runDir);
  const log = logger.attachConsole();
  const tools = createTools(logger);
  const planner = new Planner({ apiKey, baseUrl, modelName, logger });
  const resultPath = path.join(runDir, 'result.json');
  const maxIterations = options.maxIterations || 6;

  const result = {
    runId,
    repoUrl,
    runDir,
    repoPath,
    status: 'running',
    model: {
      baseUrl: baseUrl || null,
      modelName: modelName || null,
      mode: apiKey && apiKey !== 'mock' ? 'llm' : 'mock'
    },
    phases: [],
    iterations: []
  };

  const recordPhase = (phase, status, details = {}) => {
    const entry = { phase, status, ...details };
    result.phases.push(entry);
    logger.write({ stage: phase, type: status, message: phase, details });
  };

  let stage = 'install';
  let lastAction = null;
  let lastActionKey = null;
  let repeatedActions = 0;
  let port = null;
  let toolEnv = {};

  try {
    log('observe', 'start run', { repoUrl, runId });
    recordPhase('observe', 'started', { repoUrl });

    const clone = await tools.clone(repoUrl, repoPath);
    if (clone.code !== 0) {
      throw new Error(`clone failed: ${clone.stderr || clone.stdout}`);
    }
    recordPhase('clone', 'success');

    const stack = await detectStack(repoPath, tools);
    result.stack = stack;
    recordPhase('detect', 'success', { stack: stack.stack });

    const env = await detectEnvironment(tools, stack);
    result.environment = env;
    if (!env.supported) {
      throw new Error('environment check failed');
    }
    recordPhase('environment', 'success');

    if (stack.stack === 'python') {
      const venv = await tools.exec('python', ['-m', 'venv', '.venv'], {
        cwd: repoPath,
        label: 'python -m venv .venv',
        timeoutMs: 120000
      });
      if (venv.code !== 0) {
        throw new Error(`venv creation failed: ${venv.stderr || venv.stdout}`);
      }
      const venvDir = path.join(repoPath, '.venv');
      const binDir = process.platform === 'win32'
        ? path.join(venvDir, 'Scripts')
        : path.join(venvDir, 'bin');
      toolEnv = {
        VIRTUAL_ENV: venvDir,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`
      };
      result.pythonVenv = venvDir;
      recordPhase('venv', 'success');
    }

    port = await tools.findFreePort(options.portStart || 4100, options.portEnd || 4999);
    result.port = port;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const observation = await observe({ repoPath, tools, stack, env, stage, lastAction, port, iteration });
      logger.write({ stage: 'observe', type: 'loop:observe', message: `iteration ${iteration}`, details: observation });

      const plan = await planner.plan(observation);
      plan.action = normalizeAction(plan.action, { stage, stack });
      logger.write({ stage: 'think', type: 'loop:think', message: plan.thought || 'planner returned action', details: plan });

      const currentActionKey = actionKey(plan.action);
      repeatedActions = currentActionKey === lastActionKey ? repeatedActions + 1 : 0;
      lastActionKey = currentActionKey;
      if (repeatedActions >= 2) {
        throw new Error(`stopping retry loop after repeated action: ${currentActionKey}`);
      }

      const actionResult = await executeAction(plan.action, { repoPath, tools, runDir, port, toolEnv });

      const iterationResult = {
        iteration,
        stage,
        thought: plan.thought,
        action: plan.action,
        actionResult: {
          ...actionResult,
          stdout: actionResult.stdout?.slice(-2000) || '',
          stderr: actionResult.stderr?.slice(-2000) || ''
        }
      };

      if (actionResult.tool === 'stop') {
        throw new Error(actionResult.stderr || 'planner stopped');
      }

      if (stage === 'install') {
        if (actionResult.code === 0) {
          recordPhase('install', 'success', { iteration });
          stage = 'start';
        } else {
          recordPhase('install', 'retry', { iteration, code: actionResult.code });
        }
      } else if (stage === 'start') {
        if (actionResult.code !== 0) {
          recordPhase('start', 'retry', { iteration, code: actionResult.code });
        } else {
          recordPhase('start', 'success', {
            iteration,
            port,
            pid: actionResult.process?.pid,
            command: {
              command: actionResult.command,
              args: actionResult.args
            }
          });
          let verification = null;
          for (const candidatePort of candidatePorts(stack, port)) {
            verification = await tools.waitForHttp(targetUrl(candidatePort), options.verifyTimeoutMs || 45000, 1000);
            if (verification.ok) {
              verification.port = candidatePort;
              break;
            }
          }
          actionResult.verification = verification;
          if (!verification.ok && actionResult.process?.logPath && await tools.exists(actionResult.process.logPath)) {
            const appLog = await tools.readText(actionResult.process.logPath);
            actionResult.stderr = appLog.slice(-4000);
            iterationResult.actionResult.stderr = actionResult.stderr;
          }
          iterationResult.verification = verification;
          result.verification = verification;
          if (verification.ok) result.verifiedPort = verification.port || port;
          logger.write({ stage: 'verify', type: 'loop:verify', message: `iteration ${iteration}`, details: verification });
          if (verification.ok) {
            recordPhase('verify', 'success', { httpStatus: verification.status });
            result.status = 'success';
            result.app = actionResult.process;
            result.completedAt = new Date().toISOString();
            result.iterations.push(iterationResult);
            log('verify', 'run success', { runId, port, pid: actionResult.process?.pid });
            break;
          }
          recordPhase('verify', 'retry', { iteration, error: verification.error });
        }
      }

      lastAction = {
        ...actionResult,
        thought: plan.thought
      };

      result.iterations.push(iterationResult);
    }

    if (result.status !== 'success') {
      throw new Error(`agent did not reach success within ${maxIterations} iterations`);
    }
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    result.completedAt = new Date().toISOString();
    log('error', 'run failed', { error: error.message });
    recordPhase('failed', 'error', { error: error.message });
  } finally {
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}

export async function readRunResult(runDir) {
  const file = path.join(runDir, 'result.json');
  return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}
