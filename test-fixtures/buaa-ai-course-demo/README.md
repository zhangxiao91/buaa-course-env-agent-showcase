# 北航人工智能导论提示词实验助手 Demo

这是一个用于课程大作业演示的最小 Flask 项目。

它模拟《人工智能导论》平时实验中的提示词实验场景，展示以下内容：

- 提示词实验
- Token 与上下文
- Temperature 调参
- 大模型代码理解的局限

本 Demo 用于验证“北航课程项目 AI 启动助手”可以自动：

1. 识别 Python/Flask 项目。
2. 创建 `.venv`。
3. 安装 `requirements.txt`。
4. 启动 Flask 服务。
5. 验证 localhost 是否返回成功响应。

## 手动运行

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m flask --app app run --host 127.0.0.1 --port 8788
```

