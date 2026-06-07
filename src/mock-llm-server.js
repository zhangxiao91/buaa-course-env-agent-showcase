import http from 'http';
import { Planner } from './planner.js';

const port = Number(process.env.PORT || 8799);

function json(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    const body = await readBody(req);
    const message = body.messages?.findLast?.((item) => item.role === 'user') || body.messages?.at(-1);
    const observation = JSON.parse(message?.content || '{}');
    const planner = new Planner({ apiKey: 'mock', baseUrl: 'mock', modelName: 'mock', logger: { write() {} } });
    const plan = await planner.plan(observation);
    return json(res, 200, {
      id: `mock-${Date.now()}`,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(plan)
          },
          finish_reason: 'stop'
        }
      ]
    });
  }

  return json(res, 404, { ok: false, error: 'not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock llm listening on http://127.0.0.1:${port}/v1`);
});
