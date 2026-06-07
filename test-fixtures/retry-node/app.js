import http from 'http';

const port = Number(process.env.PORT || 3000);

http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('retry-node-fixture ok');
}).listen(port, '127.0.0.1', () => {
  console.log(`retry-node-fixture listening on ${port}`);
});
