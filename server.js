// server.js
// 说明：
//   一个“一条命令启动”的本地 WebRTC Demo 服务：
//     1) HTTP：提供 index.html（避免 file:// 下 getUserMedia 被浏览器限制）
//     2) WebSocket：信令转发（offer/answer/candidate/leave）
//
// 运行：
//   npm init -y
//   npm install ws
//   node server.js
//
// 打开：
//   http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// rooms: Map<roomId, { clients: WebSocket[] }>
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: [] });
  }
  return rooms.get(roomId);
}

function joinRoom(roomId, ws) {
  const room = getRoom(roomId);
  if (room.clients.includes(ws)) return;

  if (room.clients.length >= 2) {
    ws.send(JSON.stringify({ type: 'full', roomId }));
    ws.close(1000, 'Room is full');
    return;
  }

  room.clients.push(ws);

  // 当第 2 人加入时，给双方分配稳定角色：
  //   - 先加入的人：caller（负责 createOffer）
  //   - 后加入的人：callee（收到 offer 后 createAnswer）
  if (room.clients.length === 2) {
    const caller = room.clients[0];
    const callee = room.clients[1];
    if (caller.readyState === WebSocket.OPEN) {
      caller.send(JSON.stringify({ type: 'ready', roomId, role: 'caller' }));
    }
    if (callee.readyState === WebSocket.OPEN) {
      callee.send(JSON.stringify({ type: 'ready', roomId, role: 'callee' }));
    }
  }
}

function leaveRoom(roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.clients = room.clients.filter(c => c !== ws);
  if (room.clients.length === 0) {
    rooms.delete(roomId);
    return;
  }
  // 通知对方对端离开
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'leave', roomId }));
    }
  });
}

function broadcastInRoom(roomId, from, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.clients.forEach(client => {
    if (client !== from && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ===== HTTP：提供 index.html =====
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/' || url === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('读取 index.html 失败');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // 其它路径直接 404（Demo 简化）
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

// ===== WebSocket：挂到同一个 HTTP server 上 =====
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const { type, roomId } = msg;

    switch (type) {
      case 'join':
        currentRoom = roomId;
        joinRoom(roomId, ws);
        break;
      case 'offer':
      case 'answer':
      case 'candidate':
      case 'leave':
        if (!roomId) return;
        broadcastInRoom(roomId, ws, JSON.stringify(msg));
        if (type === 'leave') {
          leaveRoom(roomId, ws);
        }
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      leaveRoom(currentRoom, ws);
    }
  });
});

server.listen(PORT, () => {
  console.log(`HTTP  server : http://localhost:${PORT}`);
  console.log(`WS signaling : ws://localhost:${PORT}`);
});

