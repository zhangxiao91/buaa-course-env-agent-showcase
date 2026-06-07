# BUAA Course Environment Agent MVP

一个用于课程项目环境搭建演示的本地 Agent MVP。用户输入 GitHub repo URL 或本地 git repo 路径后，系统会尝试自动完成：

- clone repo
- 分析项目结构
- 识别 Node.js / Python 技术栈
- 检测本地开发环境
- 安装必要依赖
- 启动项目
- 访问 localhost 验证项目是否真的运行成功

## Quick Start

```bash
npm start
```

默认启动地址：

```text
http://127.0.0.1:8787
```

复制 `.env.example` 为 `.env` 后可配置真实大模型 API：

```text
AGENT_API_KEY=your_api_key
AGENT_BASE_URL=https://your-openai-compatible-endpoint/v1
AGENT_MODEL_NAME=your-model-name
```

不配置时可以使用 mock 模式演示主链路。

## CLI Demo

```bash
node src/cli.js --api-key mock --base-url mock --model-name mock --repo-url test-fixtures/buaa-ai-course-demo
```

成功后会在 `runs/<runId>/` 下生成：

- `run.log`
- `events.jsonl`
- `result.json`
- `app.log`

这些运行产物默认不会提交到 git。

## Course Scenario

本项目的大作业包装场景是北航课程实验环境搭建：在人工智能导论、数据结构等课程实验中，学生常因忘记安装依赖、解释器版本不匹配、启动命令不明确而卡住。本 MVP 用 Agent loop 和工具调用把“代码理解”扩展为“可执行、可验证的环境搭建”。

`test-fixtures/buaa-ai-course-demo` 是用于演示的 Flask 课程项目，页面展示了 observe → act → verify 的启动流程。

## Safety Notes

运行陌生 repo 会执行第三方代码。课程展示建议只使用可信 demo repo 或自己创建的测试仓库，不要在含有敏感文件的目录中运行未知项目。
