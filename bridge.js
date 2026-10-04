// bridge.js
const WebSocket = require('ws');
const express   = require('express');

const TARGET = 'wss://finder.kickerstore.gg/v2/ws?diag=d94328ee-3114-4c5f-b430-0816a9dccfb4';

let ws = null, status = 'connecting', logs = [], nextId = 1;

function push(dir, data) {
  logs.push({ id: nextId++, t: Math.floor(Date.now() / 1000), dir, data: String(data) });
  if (logs.length > 5000) logs.splice(0, logs.length - 5000);
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${dir} ${data}`);
}

function connect() {
  status = 'connecting';
  push('SYS', 'connecting ' + TARGET);

  ws = new WebSocket(TARGET, {
    headers: {
      'Origin': 'https://kickerstore.gg',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    },
  });

  ws.on('open',    () => { status = 'open'; push('SYS', 'WS OPEN'); });
  ws.on('message', (d, isBin) => push('IN', isBin ? '<bin>' : d.toString()));
  ws.on('ping',    d => { push('SYS', 'PING'); ws.pong(d); });
  ws.on('pong',    () => push('SYS', 'PONG'));
  ws.on('close',   (code, reason) => {
    status = 'closed';
    push('SYS', `CLOSE code=${code} reason=${reason}`);
    setTimeout(connect, 2000);
  });
  ws.on('error', e => push('ERR', e.message));
  ws.on('unexpected-response', (req, res) => {
    push('ERR', `non-101: ${res.statusCode} ${res.statusMessage}`);
    res.on('data', d => push('ERR', 'body> ' + d.toString()));
  });
}

connect();

const app = express();
app.use(express.text({ type: '*/*' }));

app.get('/logs', (req, res) => {
  const since = parseInt(req.query.since || '0', 10);
  res.json({ status, total: logs.length, logs: logs.filter(l => l.id > since) });
});

app.post('/send', (req, res) => {
  if (status !== 'open') return res.status(503).send('not open');
  ws.send(String(req.body || ''));
  push('OUT', req.body || '');
  res.send('ok');
});

// Render requires binding to 0.0.0.0 and using its PORT env var
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('bridge on port ' + PORT));
