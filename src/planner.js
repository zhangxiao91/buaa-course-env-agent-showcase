function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM did not return JSON');
  return JSON.parse(match[0]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function fallbackPlan(observation) {
  const { stage, stack, packageJson, files, lastAction } = observation;

  if (stage === 'start'
    && lastAction?.command === 'npm'
    && (lastAction?.code !== 0 || lastAction?.verification?.ok === false)
    && stack === 'node'
    && files.includes('app.js')) {
    return {
      thought: 'The configured npm start command failed; retry the visible app.js entry directly.',
      action: { tool: 'startProcess', command: 'node', args: ['app.js'] }
    };
  }

  if (stage === 'start'
    && stack === 'python'
    && files.includes('app.py')
    && (observation.requirements?.includes('Flask') || observation.appPy?.includes('from flask'))) {
    return {
      thought: 'This looks like a Flask app module; run it with the Flask CLI on the selected port.',
      action: {
        tool: 'startProcess',
        command: 'python',
        args: ['-m', 'flask', '--app', 'app', 'run', '--host', '127.0.0.1', '--port', String(observation.port)]
      }
    };
  }

  if (stage === 'install') {
    if (stack === 'node') {
      if (files.includes('pnpm-lock.yaml') && observation.environment?.checks?.pnpm?.ok) {
        return {
          thought: 'Node project has pnpm lockfile, install with pnpm.',
          action: { tool: 'runCommand', command: 'pnpm', args: ['install'] }
        };
      }
      if (files.includes('yarn.lock') && observation.environment?.checks?.yarn?.ok) {
        return {
          thought: 'Node project has yarn lockfile, install with yarn.',
          action: { tool: 'runCommand', command: 'yarn', args: ['install'] }
        };
      }
      return {
        thought: 'Node project has package.json, install dependencies with npm.',
        action: { tool: 'runCommand', command: 'npm', args: ['install', '--no-fund', '--no-audit'] }
      };
    }

    if (stack === 'python') {
      if (files.includes('requirements.txt')) {
        return {
          thought: 'Python project has requirements.txt, install with pip.',
          action: { tool: 'runCommand', command: 'python', args: ['-m', 'pip', 'install', '-r', 'requirements.txt'] }
        };
      }
      return {
        thought: 'Python project has no requirements.txt; no install action is needed.',
        action: { tool: 'noop', reason: 'No dependency manifest found' }
      };
    }
  }

  if (stage === 'start') {
    const scripts = packageJson?.scripts || {};
    if (stack === 'node' && scripts.start) {
      return {
        thought: 'package.json exposes start script.',
        action: { tool: 'startProcess', command: 'npm', args: ['run', 'start'] }
      };
    }
    if (stack === 'node' && scripts.dev) {
      return {
        thought: 'package.json exposes dev script.',
        action: { tool: 'startProcess', command: 'npm', args: ['run', 'dev'] }
      };
    }
    if (stack === 'node' && files.includes('app.js')) {
      return {
        thought: 'No npm start script, app.js is a likely Node entry.',
        action: { tool: 'startProcess', command: 'node', args: ['app.js'] }
      };
    }
    if (stack === 'python' && files.includes('app.py')) {
      return {
        thought: 'app.py is a likely Python entry.',
        action: { tool: 'startProcess', command: 'python', args: ['app.py'] }
      };
    }
    if (stack === 'python' && files.includes('main.py')) {
      return {
        thought: 'main.py is a likely Python entry.',
        action: { tool: 'startProcess', command: 'python', args: ['main.py'] }
      };
    }
  }

  if (lastAction?.stderr?.includes('Cannot find module')) {
    return {
      thought: 'Node runtime reports missing modules, retry dependency install.',
      action: { tool: 'runCommand', command: 'npm', args: ['install', '--no-fund', '--no-audit'] }
    };
  }

  return {
    thought: 'No safe next action is available from the current observation.',
    action: { tool: 'stop', reason: 'No supported next action' }
  };
}

export class Planner {
  constructor({ apiKey, baseUrl, modelName, logger }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
    this.logger = logger;
  }

  async plan(observation) {
    if (!this.apiKey || this.apiKey === 'mock' || !this.baseUrl || this.baseUrl === 'mock') {
      return fallbackPlan(observation);
    }

    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.modelName,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'You are a local repo setup agent.',
            'Return only JSON with shape {"thought":"...","action":{"tool":"runCommand|startProcess|noop|stop","command":"npm","args":["install"],"reason":"..."}}.',
            'Allowed commands: git,node,npm,pnpm,python,pip,yarn,bun,uvicorn,vite.',
            'Choose exactly one minimal safe action. Do not use shell syntax.'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify(observation, null, 2)
        }
      ]
    };

    this.logger.write({
      stage: 'think',
      type: 'llm:request',
      message: `planning with ${this.modelName}`,
      details: {
        baseUrl: this.baseUrl,
        modelName: this.modelName
      }
    });

    let text = '';
    let payload = null;
    let lastError = null;
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000)
        });

        text = await res.text();
        if (res.ok) {
          payload = JSON.parse(text);
          break;
        }

        lastError = new Error(`LLM request failed: HTTP ${res.status} ${text.slice(0, 300)}`);
        if (!isRetryableStatus(res.status) || attempt === maxAttempts) {
          throw lastError;
        }
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) {
          throw error;
        }
      }

      const delayMs = Math.min(8000, 750 * 2 ** (attempt - 1));
      this.logger.write({
        stage: 'think',
        type: 'llm:retry',
        message: `LLM request retry ${attempt + 1}/${maxAttempts}`,
        details: {
          delayMs,
          error: lastError?.message || 'unknown'
        }
      });
      await sleep(delayMs);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM response missing choices[0].message.content');
    }

    return extractJson(content);
  }
}
