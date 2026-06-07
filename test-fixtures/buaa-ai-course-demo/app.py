import json

from flask import Flask

app = Flask(__name__)


COURSE_ISSUES = [
    {
        "title": "忘记安装依赖",
        "summary": "课程实验经常只下载了代码，却没有执行 requirements.txt 或 package.json 对应的安装步骤。",
        "tags": ["pip", "npm", "requirements"],
    },
    {
        "title": "环境版本不清楚",
        "summary": "Python、Node.js、pip 等本地环境是否存在，通常要手动敲多条命令确认。",
        "tags": ["python", "node", "env check"],
    },
    {
        "title": "启动命令不明确",
        "summary": "README 里可能有 Flask、Vite、Express 等不同启动方式，新手容易卡在第一步。",
        "tags": ["start command", "README"],
    },
    {
        "title": "只看代码不能证明成功",
        "summary": "服务是否真的启动，必须访问 localhost 并检查 HTTP 状态，而不是只相信终端没有报错。",
        "tags": ["localhost", "verify"],
    },
]

AGENT_STEPS = {
    "python": [
        {"key": "clone", "label": "Clone 课程项目", "log": "act: git clone 课程项目仓库"},
        {"key": "detect", "label": "识别技术栈", "log": "observe: 发现 requirements.txt，判定为 Python/Flask 项目"},
        {"key": "env", "label": "检测本地环境", "log": "act: 检查 git、python、pip 是否可用"},
        {"key": "install", "label": "安装项目依赖", "log": "act: python -m pip install -r requirements.txt"},
        {"key": "start", "label": "启动本地服务", "log": "act: python -m flask --app app run --host 127.0.0.1"},
        {"key": "verify", "label": "验证 localhost", "log": "verify: 探测本地服务是否返回成功响应"},
    ],
    "node": [
        {"key": "clone", "label": "Clone 课程项目", "log": "act: git clone 课程项目仓库"},
        {"key": "detect", "label": "识别技术栈", "log": "observe: 发现 package.json，判定为 Node.js/Vite 项目"},
        {"key": "env", "label": "检测本地环境", "log": "act: 检查 git、node、npm 是否可用"},
        {"key": "install", "label": "安装项目依赖", "log": "act: npm install"},
        {"key": "start", "label": "启动本地服务", "log": "act: npm run dev -- --host 127.0.0.1"},
        {"key": "verify", "label": "验证 localhost", "log": "verify: 探测本地服务是否返回成功响应"},
    ],
}


def render_tag(tag):
    return f"<span class='tag'>{tag}</span>"


@app.route("/")
def index():
    cards = []
    for issue in COURSE_ISSUES:
        tags = "".join(render_tag(tag) for tag in issue["tags"])
        cards.append(
            f"""
            <article class="card">
              <h2>{issue["title"]}</h2>
              <p>{issue["summary"]}</p>
              <div class="tags">{tags}</div>
            </article>
            """
        )
    steps_json = json.dumps(AGENT_STEPS, ensure_ascii=False)

    return f"""
    <!doctype html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>北航课程项目环境搭建 Agent 演示</title>
      <style>
        :root {{
          --ink: #16202a;
          --muted: #5d6b7a;
          --paper: #f6f8fb;
          --panel: #ffffff;
          --line: #d7dee8;
          --accent: #0f766e;
          --good: #15803d;
          --warn: #b45309;
          --console: #111827;
        }}
        * {{ box-sizing: border-box; }}
        body {{
          margin: 0;
          background: var(--paper);
          color: var(--ink);
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
        }}
        main {{
          width: min(1120px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 42px 0;
        }}
        header {{
          border-bottom: 2px solid #243241;
          padding-bottom: 18px;
          margin-bottom: 24px;
        }}
        h1 {{
          margin: 0 0 10px;
          font-family: "SimSun", "Songti SC", serif;
          font-size: clamp(30px, 5vw, 52px);
          letter-spacing: 0;
        }}
        .intro {{
          max-width: 820px;
          margin: 0;
          color: var(--muted);
          line-height: 1.7;
          font-size: 16px;
        }}
        .grid {{
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }}
        .card, .panel {{
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--panel);
          box-shadow: 0 16px 34px rgba(33, 43, 54, 0.08);
        }}
        .card {{
          padding: 16px;
          min-height: 184px;
        }}
        h2 {{
          margin: 0 0 10px;
          font-size: 19px;
        }}
        p {{
          margin: 0;
          line-height: 1.65;
        }}
        .tags {{
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }}
        .tag {{
          border: 1px solid rgba(15, 118, 110, 0.35);
          color: var(--accent);
          background: #ecfdf5;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 700;
        }}
        .note {{
          margin-top: 20px;
          border-left: 4px solid var(--warn);
          background: #fff7ed;
          padding: 14px 16px;
          color: #5f3c13;
          line-height: 1.65;
        }}
        .evidence {{
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }}
        .evidence span {{
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #ffffff;
          padding: 10px;
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
        }}
        .evidence code {{
          display: block;
          margin-top: 4px;
          color: var(--ink);
          font-family: Consolas, "Courier New", monospace;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }}
        .lab {{
          margin-top: 20px;
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 16px;
        }}
        .panel {{
          padding: 16px;
        }}
        label {{
          display: grid;
          gap: 6px;
          margin-bottom: 12px;
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
        }}
        input, select {{
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #f9fbfd;
          color: var(--ink);
          padding: 10px;
          font: inherit;
        }}
        button {{
          width: 100%;
          border: 0;
          border-radius: 6px;
          background: var(--accent);
          color: white;
          padding: 11px 12px;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }}
        button:hover {{
          background: #115e59;
        }}
        .steps {{
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }}
        .step {{
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #f9fbfd;
          padding: 9px 10px;
          font-weight: 700;
        }}
        .badge {{
          min-width: 58px;
          text-align: center;
          border-radius: 999px;
          padding: 4px 7px;
          background: #eef2f7;
          color: var(--muted);
          font-size: 12px;
        }}
        .step.active {{
          border-color: rgba(15, 118, 110, 0.55);
          box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
        }}
        .step.done .badge {{
          background: #dcfce7;
          color: var(--good);
        }}
        .step.active .badge {{
          background: #ccfbf1;
          color: var(--accent);
          animation: pulse 900ms ease-in-out infinite;
        }}
        .progress {{
          height: 10px;
          border: 1px solid var(--line);
          border-radius: 999px;
          overflow: hidden;
          background: #fffef9;
          margin-top: 12px;
        }}
        .bar {{
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #0f766e, #15803d);
          transition: width 360ms ease;
        }}
        button:disabled {{
          cursor: wait;
          opacity: 0.76;
        }}
        @keyframes pulse {{
          0%, 100% {{ transform: scale(1); }}
          50% {{ transform: scale(1.06); }}
        }}
        .console {{
          min-height: 340px;
          border: 1px solid #263244;
          border-radius: 6px;
          background: var(--console);
          color: #e7f6ef;
          padding: 14px;
          white-space: pre-wrap;
          line-height: 1.65;
          font-family: Consolas, "Courier New", monospace;
          font-size: 13px;
        }}
        .summary {{
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }}
        .metric {{
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #f9fbfd;
          padding: 10px;
        }}
        .metric span {{
          display: block;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
        }}
        .metric strong {{
          display: block;
          margin-top: 4px;
          color: var(--ink);
          font-size: 18px;
        }}
        @media (max-width: 900px) {{
          .grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
          .lab {{ grid-template-columns: 1fr; }}
        }}
        @media (max-width: 560px) {{
          .grid, .summary, .evidence {{ grid-template-columns: 1fr; }}
        }}
      </style>
    </head>
    <body>
      <main>
        <header>
          <h1>北航课程项目环境搭建 Agent 演示</h1>
          <p class="intro">
            这个页面模拟北航课程实验项目被自动启动后的可视化结果。演示重点不是提示词本身，而是 Agent 如何把一个陌生 repo 从下载、环境识别、依赖安装一路推进到 localhost 验证成功。
          </p>
        </header>
        <section class="grid">
          {"".join(cards)}
        </section>
        <section class="note">
          课程联系可以写成：平时实验和数据结构作业常被环境配置卡住，因此本项目把大模型的代码理解能力扩展为“能调用工具、能安装依赖、能验证运行结果”的本地环境搭建助手。
        </section>
        <section class="evidence">
          <span>真实运行证据<code>runs/&lt;runId&gt;/run.log</code></span>
          <span>验证方式<code>GET localhost → HTTP 200</code></span>
          <span>报告截图重点<code>observe → act → verify</code></span>
        </section>
        <section class="lab">
          <div class="panel">
            <h2>环境搭建模拟台</h2>
            <label>课程项目地址
              <input id="repo" value="github.com/buaa-course/flask-lab-demo">
            </label>
            <label>Agent 识别出的技术栈
              <select id="stack">
                <option value="python">Python / Flask</option>
                <option value="node">模拟 Node.js / Vite 流程</option>
              </select>
            </label>
            <label>本地验证端口
              <input id="port" type="number" min="3000" max="9999" value="4555">
            </label>
            <button id="runAgent" type="button">播放 Agent 启动流程</button>
            <div class="progress"><div id="bar" class="bar"></div></div>
            <div id="steps" class="steps"></div>
          </div>
          <div class="panel">
            <h2>执行日志与验证结果</h2>
            <div class="summary">
              <div class="metric"><span>当前阶段</span><strong id="phase">等待启动</strong></div>
              <div class="metric"><span>HTTP 验证</span><strong id="http">未执行</strong></div>
              <div class="metric"><span>运行结论</span><strong id="result">待验证</strong></div>
            </div>
            <div id="console" class="console">点击“播放 Agent 启动流程”，查看 observe → act → verify 的环境搭建闭环。</div>
          </div>
        </section>
      </main>
      <script>
        const stepMap = {steps_json};
        const stepsBox = document.querySelector("#steps");
        const consoleBox = document.querySelector("#console");
        const phase = document.querySelector("#phase");
        const http = document.querySelector("#http");
        const result = document.querySelector("#result");
        const repo = document.querySelector("#repo");
        const stack = document.querySelector("#stack");
        const port = document.querySelector("#port");
        const button = document.querySelector("#runAgent");
        const bar = document.querySelector("#bar");
        let running = false;
        if (window.location.port) {{
          port.value = window.location.port;
        }}

        function selectedSteps() {{
          return stepMap[stack.value];
        }}

        function wait(ms) {{
          return new Promise((resolve) => setTimeout(resolve, ms));
        }}

        function renderSteps(doneCount = 0, activeIndex = -1) {{
          const steps = selectedSteps();
          stepsBox.innerHTML = steps.map((step, index) => `
            <div class="step ${{index < doneCount ? "done" : ""}} ${{index === activeIndex ? "active" : ""}}">
              <span>${{step.label}}</span>
              <span class="badge">${{index < doneCount ? "done" : index === activeIndex ? "running" : "todo"}}</span>
            </div>
          `).join("");
        }}

        function setProgress(doneCount) {{
          const steps = selectedSteps();
          bar.style.width = Math.round((doneCount / steps.length) * 100) + "%";
        }}

        function appendLog(line) {{
          consoleBox.textContent += (consoleBox.textContent ? "\\n" : "") + line;
        }}

        async function runAgent() {{
          if (running) return;
          running = true;
          button.disabled = true;
          button.textContent = "Agent 正在执行...";
          phase.textContent = "observe";
          http.textContent = "checking";
          result.textContent = "running";
          consoleBox.textContent = "";
          renderSteps(0, 0);
          setProgress(0);

          appendLog("observe: 用户输入课程项目 " + repo.value);
          await wait(360);
          appendLog("observe: 目标技术栈 " + stack.options[stack.selectedIndex].text);
          await wait(420);

          const steps = selectedSteps();
          for (let index = 0; index < steps.length; index += 1) {{
            const step = steps[index];
            phase.textContent = step.key;
            renderSteps(index, index);
            appendLog(step.log);
            await wait(index === 3 ? 760 : 560);
            renderSteps(index + 1, index + 1);
            setProgress(index + 1);
          }}

          phase.textContent = "verify";
          http.textContent = "200 OK";
          result.textContent = "success";
          appendLog("verify: http://127.0.0.1:" + port.value + "/ 返回 200");
          appendLog("success: 课程项目已经可本地访问，可截图写入大作业报告");
          renderSteps(steps.length);
          button.disabled = false;
          button.textContent = "重新播放 Agent 启动流程";
          running = false;
        }}

        stack.addEventListener("change", () => {{
          if (running) return;
          renderSteps();
          setProgress(0);
          phase.textContent = "等待启动";
          http.textContent = "未执行";
          result.textContent = "待验证";
          consoleBox.textContent = "技术栈已切换为 " + stack.options[stack.selectedIndex].text + "。点击按钮查看对应启动流程。";
        }});
        button.addEventListener("click", runAgent);
        renderSteps();
      </script>
    </body>
    </html>
    """
