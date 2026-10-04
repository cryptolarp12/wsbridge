// bridge.js
const WebSocket = require('ws');
const express   = require('express');

const TARGET = 'wss://finder.kickerstore.gg/v2/ws?diag=d94328ee-3114-4c5f-b430-0816a9dccfb4';

// ---- OPTIONAL: a first message to send after open, if the server wants one ----
// Examples to try:
//   '{"type":"subscribe"}'
//   '{"op":"ping"}'
//   '{"action":"init"}'
// Leave null to skip.
const FIRST_MESSAGE = null;
// -------------------------------------------------------------------------------

let ws = null, status = 'connecting', logs = [], nextId = 1;
let pingTimer = null;

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

  ws.on('open', () => {
    status = 'open';
    push('SYS', 'WS OPEN');

    // Send a keepalive ping IMMEDIATELY on open
    ws.ping(Buffer.from(String(Date.now())));
    push('SYS', 'PING (immediate)');

    // ...and every 2 seconds after
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.ping(Buffer.from(String(Date.now())));
        push('SYS', 'PING');
      }
    }, 2000);

    // Optional first app-level message
    if (FIRST_MESSAGE) {
      ws.send(FIRST_MESSAGE);
      push('OUT', FIRST_MESSAGE);
    }
  });

  ws.on('message', (d, isBin) => push('IN', isBin ? '<bin>' : d.toString()));
  ws.on('ping',    d => { push('SYS', 'IN PING'); ws.pong(d); });
  ws.on('pong',    d => push('SYS', 'IN PONG'));

  ws.on('close', (code, reason) => {
    clearInterval(pingTimer);
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('bridge on port ' + PORT));
