// server.js
// 说明：
//   mediasoup SFU（Selective Forwarding Unit）最小实现：
//     - 会议：最多 16 人（每人可发布音/视频，服务器转发给其他人）
//     - 信令：WebSocket（/ws）
//     - 静态：HTTP 提供 index.html + public/app.js（前端已打包，无 CDN 依赖）
//
// 运行：
//   npm install
//   npm start
//
// 云端部署关键点：
//   - announcedIp 必须是公网 IP：49.233.175.236
//   - 需要开放 mediasoup RTP 端口范围：49160-49200（你已开放）

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');

const PORT = Number(process.env.PORT || 8080);

const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || '49.233.175.236';
const LISTEN_IP = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';

const RTC_MIN_PORT = Number(process.env.MEDIASOUP_RTC_MIN_PORT || 49160);
const RTC_MAX_PORT = Number(process.env.MEDIASOUP_RTC_MAX_PORT || 49200);

const MAX_PEERS_PER_ROOM = Number(process.env.MAX_PEERS_PER_ROOM || 16);

// rooms: Map<roomId, RoomState>
// RoomState: { router, peers: Map<peerId, PeerState> }
// PeerState: { ws, transports: Map<transportId, transport>, producers: Map<producerId, producer>, consumers: Map<consumerId, consumer> }
const rooms = new Map();

let workerPromise = null;
async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const worker = await mediasoup.createWorker({
      rtcMinPort: RTC_MIN_PORT,
      rtcMaxPort: RTC_MAX_PORT,
      logLevel: 'warn'
    });
    worker.on('died', () => {
      console.error('[mediasoup] worker died, exiting in 2s...');
      setTimeout(() => process.exit(1), 2000);
    });
    return worker;
  })();
  return workerPromise;
}

async function getOrCreateRoom(roomId) {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const worker = await getWorker();
  const router = await worker.createRouter({
    mediaCodecs: [
      // Opus
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      // VP8（兼容最好）
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {}
      }
    ]
  });

  const room = { router, peers: new Map() };
  rooms.set(roomId, room);
  return room;
}

function ensurePeer(room, peerId, ws) {
  if (!room.peers.has(peerId)) {
    room.peers.set(peerId, {
      ws,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    });
  }
  return room.peers.get(peerId);
}

function safeSend(ws, obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
}

function broadcastExcept(room, exceptPeerId, obj) {
  for (const [pid, peer] of room.peers) {
    if (pid === exceptPeerId) continue;
    safeSend(peer.ws, obj);
  }
}

async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: LISTEN_IP, announcedIp: ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800_000
  });

  return transport;
}

// ===== HTTP 静态 =====
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

  if (url === '/app.js') {
    const filePath = path.join(__dirname, 'public', 'app.js');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('请先运行 npm start（会自动生成 public/app.js）');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

// ===== WebSocket 信令（/ws）=====
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let roomId = '';
  let peerId = '';

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      switch (msg.type) {
        case 'join': {
          roomId = msg.roomId;
          peerId = msg.peerId;
          if (!roomId || !peerId) return;

          const room = await getOrCreateRoom(roomId);
          if (room.peers.size >= MAX_PEERS_PER_ROOM && !room.peers.has(peerId)) {
            safeSend(ws, { type: 'full', roomId });
            ws.close(1000, 'Room is full');
            return;
          }

          ensurePeer(room, peerId, ws);
          safeSend(ws, { type: 'routerRtpCapabilities', data: room.router.rtpCapabilities });
          break;
        }

        case 'createWebRtcTransport': {
          const room = rooms.get(msg.roomId);
          if (!room) return;
          const peer = ensurePeer(room, msg.peerId, ws);

          const transport = await createWebRtcTransport(room.router);
          // 让服务端能区分 send / recv（供 consume 时挑选正确 transport）
          transport.appData = { direction: msg.direction };
          peer.transports.set(transport.id, transport);

          transport.on('dtlsstatechange', (state) => {
            if (state === 'closed') {
              try { transport.close(); } catch {}
              peer.transports.delete(transport.id);
            }
          });

          safeSend(ws, {
            type: 'webRtcTransportCreated',
            data: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters
            }
          });
          break;
        }

        case 'connectWebRtcTransport': {
          const room = rooms.get(msg.roomId);
          if (!room) return;
          const peer = room.peers.get(msg.peerId);
          if (!peer) return;
          const transport = peer.transports.get(msg.transportId);
          if (!transport) return;
          await transport.connect({ dtlsParameters: msg.dtlsParameters });
          safeSend(ws, { type: 'transportConnected', data: { transportId: transport.id } });
          break;
        }

        case 'produce': {
          const room = rooms.get(msg.roomId);
          if (!room) return;
          const peer = room.peers.get(msg.peerId);
          if (!peer) return;
          const transport = peer.transports.get(msg.transportId);
          if (!transport) return;

          const producer = await transport.produce({
            kind: msg.kind,
            rtpParameters: msg.rtpParameters
          });
          peer.producers.set(producer.id, producer);

          producer.on('transportclose', () => {
            peer.producers.delete(producer.id);
          });
          producer.on('close', () => {
            peer.producers.delete(producer.id);
          });

          safeSend(ws, { type: 'produced', data: { producerId: producer.id } });

          // 通知房间其他人：有新的 producer
          broadcastExcept(room, msg.peerId, { type: 'newProducers', data: [{ producerId: producer.id, peerId: msg.peerId }] });
          break;
        }

        case 'getProducers': {
          const room = rooms.get(msg.roomId);
          if (!room) return;
          const list = [];
          for (const [pid, p] of room.peers) {
            if (pid === msg.peerId) continue;
            for (const [producerId] of p.producers) {
              list.push({ producerId, peerId: pid });
            }
          }
          safeSend(ws, { type: 'producersList', data: list });
          break;
        }

        case 'consume': {
          const room = rooms.get(msg.roomId);
          if (!room) return;
          const peer = room.peers.get(msg.peerId);
          if (!peer) return;
          if (!room.router.canConsume({ producerId: msg.producerId, rtpCapabilities: msg.rtpCapabilities })) {
            safeSend(ws, { type: 'consumeError', data: { producerId: msg.producerId } });
            return;
          }

          // 使用 peer 的 recvTransport：简单起见取第一个 transport（前端保证先创建 send 再创建 recv）
          const recvTransport = Array.from(peer.transports.values()).find(t => t.appData?.direction === 'recv')
            || Array.from(peer.transports.values())[1]
            || Array.from(peer.transports.values())[0];

          const consumer = await recvTransport.consume({
            producerId: msg.producerId,
            rtpCapabilities: msg.rtpCapabilities,
            paused: true
          });
          peer.consumers.set(consumer.id, consumer);

          consumer.on('transportclose', () => {
            peer.consumers.delete(consumer.id);
          });
          consumer.on('producerclose', () => {
            peer.consumers.delete(consumer.id);
            safeSend(ws, { type: 'producerClosed', data: { producerId: msg.producerId } });
            try { consumer.close(); } catch {}
          });

          safeSend(ws, {
            type: 'consumed',
            data: {
              id: consumer.id,
              producerId: msg.producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters
            }
          });
          break;
        }

        case 'resume': {
          const room = rooms.get(msg.roomId);
          if (!room) return;
          const peer = room.peers.get(msg.peerId);
          if (!peer) return;
          const consumer = peer.consumers.get(msg.consumerId);
          if (!consumer) return;
          await consumer.resume();
          safeSend(ws, { type: 'resumed', data: { consumerId: consumer.id } });
          break;
        }

        default:
          break;
      }
    } catch (e) {
      safeSend(ws, { type: 'error', error: String(e?.message || e) });
    }
  });

  ws.on('close', () => {
    if (!roomId || !peerId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const peer = room.peers.get(peerId);
    if (!peer) return;

    for (const [, c] of peer.consumers) {
      try { c.close(); } catch {}
    }
    for (const [, p] of peer.producers) {
      try { p.close(); } catch {}
      broadcastExcept(room, peerId, { type: 'producerClosed', data: { producerId: p.id } });
    }
    for (const [, t] of peer.transports) {
      try { t.close(); } catch {}
    }

    room.peers.delete(peerId);
    if (room.peers.size === 0) {
      rooms.delete(roomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`HTTP : http://localhost:${PORT}`);
  console.log(`WS   : ws://localhost:${PORT}/ws`);
  console.log(`[mediasoup] announcedIp=${ANNOUNCED_IP} rtcPortRange=${RTC_MIN_PORT}-${RTC_MAX_PORT}`);
});

