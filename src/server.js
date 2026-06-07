import http from 'http';
import fs from 'fs';
import path from 'path';
import { runAgent } from './agent.js';
import { loadEnvFile } from './env.js';

loadEnvFile();

const port = Number(process.env.PORT || 8787);
const baseDir = path.join(process.cwd(), 'runs');
fs.mkdirSync(baseDir, { recursive: true });

const jobs = new Map();

function html(res, body) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8'
  });
  res.end(body);
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(body, null, 2));
}

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function appHtml() {
  const defaultBaseUrl = escapeAttr(process.env.AGENT_BASE_URL || 'mock');
  const defaultModelName = escapeAttr(process.env.AGENT_MODEL_NAME || 'mock');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>北航课程项目 AI 启动助手</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #161514;
      --muted: #6b6761;
      --line: #d8d0c2;
      --paper: #f7f3ea;
      --panel: #fffaf0;
      --accent: #0f766e;
      --accent-2: #b45309;
      --bad: #b91c1c;
      --good: #047857;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--paper);
      color: var(--ink);
      font-family: "Aptos", "Segoe UI", sans-serif;
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0;
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 24px;
    }
    h1 {
      margin: 0 0 6px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .lede {
      margin: 0 0 22px;
      color: var(--muted);
      line-height: 1.45;
    }
    form, .surface {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      box-shadow: 0 18px 45px rgba(64, 48, 24, 0.08);
    }
    form {
      padding: 18px;
      display: grid;
      gap: 14px;
      align-self: start;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fffef9;
      color: var(--ink);
      padding: 10px 11px;
      font: inherit;
    }
    input:focus {
      outline: 2px solid rgba(15, 118, 110, 0.25);
      border-color: var(--accent);
    }
    button {
      border: 0;
      border-radius: 6px;
      background: var(--accent);
      color: white;
      padding: 11px 12px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.65;
    }
    .surface {
      min-height: 620px;
      padding: 18px;
      overflow: hidden;
    }
    .statusbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--line);
    }
    .badge {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 800;
      color: var(--muted);
      background: #fffef9;
    }
    .badge.success { color: var(--good); border-color: rgba(4, 120, 87, 0.35); }
    .badge.failed { color: var(--bad); border-color: rgba(185, 28, 28, 0.35); }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 16px 0;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: #fffef9;
      min-height: 76px;
    }
    .metric strong {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .phases {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0 18px;
    }
    .phase {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 9px;
      background: #fffef9;
      font-size: 13px;
    }
    pre {
      margin: 0;
      max-height: 300px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: #181612;
      color: #f6eddc;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    a { color: var(--accent-2); font-weight: 800; }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 29px; }
    }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>北航课程项目 AI 启动助手</h1>
      <p class="lede">面向人工智能导论、数据结构、软件工程等课程实验项目的自动环境安装与启动诊断工具。</p>
      <form id="runForm">
        <label>API Key
          <input name="apiKey" type="password" autocomplete="off" placeholder="留空则使用服务端 .env；本地演示可填 mock">
        </label>
        <label>Base URL
          <input name="baseUrl" value="${defaultBaseUrl}" required>
        </label>
        <label>Model Name
          <input name="modelName" value="${defaultModelName}" required>
        </label>
        <label>课程项目 GitHub URL / 本地路径
          <input name="repoUrl" value="https://github.com/render-examples/express-hello-world.git" required>
        </label>
        <button id="submitBtn" type="submit">启动课程项目</button>
      </form>
    </section>
    <section class="surface">
      <div class="statusbar">
        <div>
          <strong id="runId">No run yet</strong>
          <div id="repoLabel" class="lede" style="margin:4px 0 0"></div>
        </div>
        <span id="statusBadge" class="badge">idle</span>
      </div>
      <div class="grid">
        <div class="metric"><strong>Stack</strong><span id="stackValue">-</span></div>
        <div class="metric"><strong>Verified URL</strong><span id="urlValue">-</span></div>
        <div class="metric"><strong>Model</strong><span id="modelValue">-</span></div>
        <div class="metric"><strong>App Process</strong><span id="processValue">-</span></div>
      </div>
      <div id="phases" class="phases"></div>
      <pre id="output">等待提交课程项目。</pre>
    </section>
  </main>
  <script>
    const form = document.querySelector('#runForm');
    const button = document.querySelector('#submitBtn');
    const output = document.querySelector('#output');
    const statusBadge = document.querySelector('#statusBadge');
    const phases = document.querySelector('#phases');

    function setText(id, value) {
      document.querySelector(id).textContent = value || '-';
    }

    function renderRun(run) {
      setText('#runId', run.runId || 'pending');
      setText('#repoLabel', run.repoUrl || '');
      statusBadge.textContent = run.status || 'running';
      statusBadge.className = 'badge ' + (run.status || '');
      setText('#stackValue', run.stack?.stack);
      const verifiedPort = run.verifiedPort || run.port;
      setText('#urlValue', run.verification?.ok ? 'http://127.0.0.1:' + verifiedPort + '/' : '-');
      setText('#modelValue', run.model ? (run.model.modelName + ' · ' + run.model.mode) : '-');
      setText('#processValue', run.app?.pid ? ('pid ' + run.app.pid) : '-');
      phases.innerHTML = (run.phases || []).map((phase) =>
        '<span class="phase">' + phase.phase + ': ' + phase.status + '</span>'
      ).join('');
      output.textContent = JSON.stringify({
        status: run.status,
        error: run.error,
        latestIteration: run.iterations?.at(-1),
        verification: run.verification
      }, null, 2);
    }

    async function poll(runId) {
      for (;;) {
        const res = await fetch('/runs/' + encodeURIComponent(runId));
        const run = await res.json();
        renderRun(run);
        if (run.status && run.status !== 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      button.disabled = false;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      output.textContent = '正在创建 Agent 运行任务...';
      const payload = Object.fromEntries(new FormData(form).entries());
      const res = await fetch('/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const created = await res.json();
      if (!res.ok) {
        button.disabled = false;
        output.textContent = JSON.stringify(created, null, 2);
        return;
      }
      renderRun(created);
      poll(created.runId);
    });
  </script>
</body>
</html>`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'buaa-course-project-ai-launcher' });
  }

  if (req.method === 'GET' && req.url === '/') {
    return html(res, appHtml());
  }

  if (req.method === 'POST' && req.url === '/runs') {
    try {
      const body = await readBody(req);
      if (!body.repoUrl || typeof body.repoUrl !== 'string') {
        return json(res, 400, { ok: false, error: 'repoUrl is required' });
      }
      const apiKey = body.apiKey || process.env.AGENT_API_KEY || 'mock';
      const baseUrl = body.baseUrl || process.env.AGENT_BASE_URL || 'mock';
      const modelName = body.modelName || process.env.AGENT_MODEL_NAME || 'mock';
      if (!baseUrl || typeof baseUrl !== 'string') {
        return json(res, 400, { ok: false, error: 'baseUrl is required' });
      }
      if (!modelName || typeof modelName !== 'string') {
        return json(res, 400, { ok: false, error: 'modelName is required' });
      }

      const runId = `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const promise = runAgent({
        apiKey,
        baseUrl,
        modelName,
        repoUrl: body.repoUrl
      }, {
        baseDir,
        runId,
        verifyTimeoutMs: Number(body.verifyTimeoutMs) || undefined,
        maxIterations: Number(body.maxIterations) || undefined
      });
      jobs.set(runId, {
        status: 'running',
        repoUrl: body.repoUrl,
        modelName,
        baseUrl,
        promise
      });

      promise.then((result) => {
        jobs.set(result.runId, { ...result, status: result.status });
      });

      return json(res, 202, { ok: true, runId, status: 'running' });
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/runs/')) {
    const parts = req.url.split('/').filter(Boolean);
    const runId = parts[1];
    if (!runId) {
      return json(res, 400, { ok: false, error: 'missing run id' });
    }

    if (parts[2] === 'events') {
      const logPath = path.join(baseDir, runId, 'events.jsonl');
      if (fs.existsSync(logPath)) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
        return res.end(fs.readFileSync(logPath, 'utf8'));
      }
      return json(res, 404, { ok: false, error: 'events not found' });
    }

    const active = jobs.get(runId);
    if (active) {
      if (active.promise) {
        return json(res, 200, { ok: true, runId, status: active.status, repoUrl: active.repoUrl });
      }
      return json(res, 200, active);
    }

    const resultPath = path.join(baseDir, runId, 'result.json');
    if (fs.existsSync(resultPath)) {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      return json(res, 200, result);
    }

    return json(res, 404, { ok: false, error: 'run not found' });
  }

  return json(res, 404, { ok: false, error: 'not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`buaa-course-project-ai-launcher listening on http://127.0.0.1:${port}`);
});
