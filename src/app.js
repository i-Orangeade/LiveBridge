// src/app.js
// 说明：
//   浏览器端 SFU 客户端（mediasoup-client）。
//   目标：支持 16 人会议、可连麦（每人发布音视频，订阅他人）。
//
// 注意：
//   这是一个可工作的“最小骨架”，后续我们会继续把：
//   - 远端视频网格（最多 16）完善
//   - 直播模式（主播/观众/连麦）完善
//   - 断线重连与 UI 状态完善

import * as mediasoupClient from 'mediasoup-client';

// ===== 从 index.html 注入配置 =====
const CONFIG = window.__NOVACALL_CONFIG__ || {
  signalingUrl: 'wss://livebridge.cn/ws',
  turn: {
    urls: ['turn:turn.livebridge.cn:3478', 'turns:turn.livebridge.cn:5349'],
    username: 'webrtc',
    credential: '19894139321qwe'
  }
};

// ===== DOM =====
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const joinPage = document.getElementById('joinPage');
const callPage = document.getElementById('callPage');
const roomInput = document.getElementById('roomInput');
const nameInput = document.getElementById('nameInput');
const serverInput = document.getElementById('serverInput');
const btnConnect = document.getElementById('btnConnect');
const btnGenerateRoom = document.getElementById('btnGenerateRoom');
const btnBackToJoin = document.getElementById('btnBackToJoin');

const btnToggleCam = document.getElementById('btnToggleCam');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnHangup = document.getElementById('btnHangup');
const btnSwitchCam = document.getElementById('btnSwitchCam');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo'); // 先复用主窗口作为“当前选中远端”
const remotePlaceholder = document.getElementById('remotePlaceholder');
const roomBadge = document.getElementById('roomBadge');
const thumbGrid = document.getElementById('thumbGrid');
const callTimerEl = document.getElementById('callTimer');

let callStartTime = null;
let callTimer = null;

// ===== 工具 =====
function setStatus(connected, text) {
  statusDot?.classList.toggle('connected', !!connected);
  if (statusText) statusText.textContent = text;
}

function startCallTimer() {
  if (!callTimerEl) return;
  callStartTime = Date.now();
  if (callTimer) clearInterval(callTimer);
  callTimer = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTime) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    callTimerEl.textContent = `${mm}:${ss}`;
  }, 500);
}

function stopCallTimer() {
  if (callTimer) clearInterval(callTimer);
  callTimer = null;
  callStartTime = null;
  if (callTimerEl) callTimerEl.textContent = '00:00';
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function enterCallPage(roomId) {
  joinPage?.classList.remove('page--active');
  callPage?.classList.add('page--active');
  if (roomBadge) roomBadge.textContent = roomId || '-';
  startCallTimer();
}

function enterJoinPage() {
  callPage?.classList.remove('page--active');
  joinPage?.classList.add('page--active');
}

// ===== SFU 会话状态 =====
let ws = null;
let roomId = '';
let peerId = randomId();
let username = '';
let manualLeave = false;
let reconnectAttempt = 0;
let reconnectTimer = null;
let heartbeatId = null;
let wantCam = false;
let wantMic = false;
let pendingRouterRtpCaps = null;

let device = null;
let sendTransport = null;
let recvTransport = null;

let localStream = null;
let camProducer = null;
let micProducer = null;

// consumers: Map<producerId, { consumer, stream }>
const consumers = new Map();
// peerTiles: Map<peerId, { el, videoEl, nameEl, badgesEl, videoProducerId, audioProducerId, audioEl }>
const peerTiles = new Map();
let pinnedPeerId = null;

function wsSend(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function safeText(s, fallback) {
  const t = (s || '').toString().trim();
  return t || fallback;
}

function ensureLocalPreviewStream() {
  if (!localStream) localStream = new MediaStream();
  if (localVideo && localVideo.srcObject !== localStream) localVideo.srcObject = localStream;
  return localStream;
}

function resToConstraints(v) {
  if (v === 'qvga') return { width: { ideal: 320 }, height: { ideal: 240 } };
  if (v === 'vga') return { width: { ideal: 640 }, height: { ideal: 480 } };
  return { width: { ideal: 1280 }, height: { ideal: 720 } };
}

function getDevicePref() {
  try {
    return JSON.parse(localStorage.getItem('novacall_device_pref') || 'null');
  } catch {
    return null;
  }
}

async function ensureVideoTrack() {
  const stream = ensureLocalPreviewStream();
  const existing = stream.getVideoTracks()[0];
  if (existing) return existing;

  const pref = getDevicePref();
  const res = resToConstraints(pref?.res || 'hd');
  const video = pref?.cam
    ? { deviceId: { exact: pref.cam }, ...res, frameRate: { ideal: 30, max: 30 } }
    : { ...res, frameRate: { ideal: 30, max: 30 } };

  const camStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  const track = camStream.getVideoTracks()[0];
  if (track && track.contentHint !== undefined) track.contentHint = 'motion';
  stream.addTrack(track);
  return track;
}

async function ensureAudioTrack() {
  const stream = ensureLocalPreviewStream();
  const existing = stream.getAudioTracks()[0];
  if (existing) return existing;

  const pref = getDevicePref();
  const audio = pref?.mic ? { deviceId: { exact: pref.mic } } : true;
  const micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio });
  const track = micStream.getAudioTracks()[0];
  stream.addTrack(track);
  return track;
}

function startHeartbeat() {
  if (heartbeatId) clearInterval(heartbeatId);
  heartbeatId = setInterval(() => {
    wsSend({ type: 'ping' });
  }, 20000);
}

function stopHeartbeat() {
  if (heartbeatId) clearInterval(heartbeatId);
  heartbeatId = null;
}

function scheduleReconnect() {
  if (manualLeave) return;
  reconnectAttempt += 1;
  const delay = Math.min(15000, 1000 * Math.pow(2, Math.min(reconnectAttempt, 4)));
  setStatus(false, `已断开，${Math.round(delay / 1000)}s 后重连…`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnect().catch(() => {});
  }, delay);
}

function ensurePeerTile(peerId) {
  if (!thumbGrid) return null;
  if (!peerId) return null;
  if (peerTiles.has(peerId)) return peerTiles.get(peerId);

  const el = document.createElement('div');
  el.className = 'thumb-card';
  el.dataset.peerId = peerId;

  const videoEl = document.createElement('video');
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.muted = true; // 缩略图不出声，音频用隐藏 audio 元素播放
  el.appendChild(videoEl);

  const meta = document.createElement('div');
  meta.className = 'thumb-meta';

  const nameEl = document.createElement('div');
  nameEl.className = 'thumb-name';
  nameEl.textContent = peerId.slice(0, 6);

  const badgesEl = document.createElement('div');
  badgesEl.className = 'thumb-badges';

  meta.appendChild(nameEl);
  meta.appendChild(badgesEl);
  el.appendChild(meta);

  el.addEventListener('click', () => pinPeer(peerId));

  thumbGrid.appendChild(el);

  const tile = { el, videoEl, nameEl, badgesEl, videoProducerId: null, audioProducerId: null, audioEl: null };
  peerTiles.set(peerId, tile);
  updatePinnedUI();
  return tile;
}

function removePeerTile(peerId) {
  const t = peerTiles.get(peerId);
  if (!t) return;
  try { t.audioEl?.remove(); } catch {}
  try { t.el?.remove(); } catch {}
  peerTiles.delete(peerId);
  if (pinnedPeerId === peerId) {
    pinnedPeerId = null;
    // 选一个还存在的视频作为主画面
    for (const [pid, tile] of peerTiles) {
      if (tile.videoEl?.srcObject) {
        pinPeer(pid);
        break;
      }
    }
    if (!pinnedPeerId) {
      remoteVideo.srcObject = null;
      remotePlaceholder.style.display = '';
    }
  }
}

function setBadge(tile, key, text) {
  if (!tile?.badgesEl) return;
  let b = tile.badgesEl.querySelector(`[data-badge="${key}"]`);
  if (!b) {
    b = document.createElement('span');
    b.className = 'badge';
    b.dataset.badge = key;
    tile.badgesEl.appendChild(b);
  }
  b.textContent = text;
}

function pinPeer(peerId) {
  const tile = peerTiles.get(peerId);
  if (!tile || !tile.videoEl?.srcObject) return;
  pinnedPeerId = peerId;
  // 主画面显示该路视频（音频由隐藏 audio 元素负责）
  remoteVideo.srcObject = tile.videoEl.srcObject;
  remotePlaceholder.style.display = 'none';
  updatePinnedUI();
}

function updatePinnedUI() {
  for (const [pid, tile] of peerTiles) {
    tile.el.classList.toggle('pinned', pid === pinnedPeerId);
    setBadge(tile, 'pin', pid === pinnedPeerId ? '已置顶' : '点击置顶');
  }
}

async function ensureLocalStream() {
  try {
    await ensureVideoTrack();
    await ensureAudioTrack();
  } catch {
    await ensureAudioTrack();
  }
  return ensureLocalPreviewStream();
}

function connectSignaling() {
  return new Promise((resolve, reject) => {
    roomId = roomInput.value.trim();
    username = nameInput.value.trim();
    const url = (serverInput.value.trim() || CONFIG.signalingUrl);

    if (!roomId) {
      alert('请先输入房间号');
      return reject(new Error('no room'));
    }

    setStatus(false, '连接中…');
    btnConnect.disabled = true;
    manualLeave = false;
    ensureLocalPreviewStream();
    enterCallPage(roomId);

    ws = new WebSocket(url);
    pendingRouterRtpCaps = waitOnce('routerRtpCapabilities');

    ws.onopen = () => {
      setStatus(true, '已连接');
      wsSend({ type: 'join', roomId, peerId, name: username });
      startHeartbeat();
      resolve();
    };

    ws.onclose = () => {
      stopHeartbeat();
      setStatus(false, '已断开');
      btnConnect.disabled = false;
      if (!manualLeave) scheduleReconnect();
    };

    ws.onerror = (e) => {
      stopHeartbeat();
      setStatus(false, '连接出错');
      btnConnect.disabled = false;
      enterJoinPage();
      reject(e);
    };

    ws.onmessage = async (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'pong':
          break;
        case 'newProducers':
          // 订阅新 producer
          for (const p of msg.data) {
            await consume(p.producerId, p.peerId);
          }
          break;
        case 'producerClosed':
          closeConsumer(msg.data.producerId);
          break;
        case 'full':
          alert('房间已满');
          teardown();
          break;
        case 'error':
          setStatus(false, '发生错误');
          break;
        default:
          break;
      }
    };
  });
}

async function loadDevice(routerRtpCapabilities) {
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities });
}

function waitOnce(type, predicate = () => true) {
  return new Promise((resolve) => {
    const handler = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.type === type && predicate(msg.data)) {
        ws.removeEventListener('message', handler);
        resolve(msg.data);
      }
    };
    ws.addEventListener('message', handler);
  });
}

async function setupSendTransport(data) {
  sendTransport = device.createSendTransport(data);

  sendTransport.on('connect', ({ dtlsParameters }, cb, eb) => {
    wsSend({ type: 'connectWebRtcTransport', roomId, peerId, transportId: sendTransport.id, dtlsParameters });
    waitOnce('transportConnected', d => d.transportId === sendTransport.id).then(() => cb()).catch(eb);
  });

  sendTransport.on('produce', ({ kind, rtpParameters }, cb, eb) => {
    wsSend({ type: 'produce', roomId, peerId, transportId: sendTransport.id, kind, rtpParameters });
    waitOnce('produced', (d) => d.kind === kind).then(({ producerId }) => cb({ id: producerId })).catch(eb);
  });
}

async function setupRecvTransport(data) {
  recvTransport = device.createRecvTransport(data);
  recvTransport.on('connect', ({ dtlsParameters }, cb, eb) => {
    wsSend({ type: 'connectWebRtcTransport', roomId, peerId, transportId: recvTransport.id, dtlsParameters });
    waitOnce('transportConnected', d => d.transportId === recvTransport.id).then(() => cb()).catch(eb);
  });
}

async function startProducers() {
  if (!sendTransport) return;

  if (wantCam && !camProducer) {
    const videoTrack = await ensureVideoTrack();
    if (videoTrack) {
      camProducer = await sendTransport.produce({
        track: videoTrack,
        encodings: [{ maxBitrate: 2_500_000, scalabilityMode: 'L1T3' }],
        codecOptions: { videoGoogleStartBitrate: 1200 }
      });
    }
  }

  if (wantMic && !micProducer) {
    const audioTrack = await ensureAudioTrack();
    if (audioTrack) {
      micProducer = await sendTransport.produce({ track: audioTrack });
    }
  }
}

async function consume(producerId, remotePeerId) {
  if (!recvTransport) return;
  wsSend({ type: 'consume', roomId, peerId, producerId, rtpCapabilities: device.rtpCapabilities });
  const data = await waitOnce('consumed', (d) => d.producerId === producerId);

  const consumer = await recvTransport.consume({
    id: data.id,
    producerId: data.producerId,
    kind: data.kind,
    rtpParameters: data.rtpParameters
  });

  const stream = new MediaStream([consumer.track]);
  consumers.set(producerId, { consumer, stream, peerId: remotePeerId || null, kind: consumer.kind });

  const pid = remotePeerId || 'peer-' + producerId.slice(0, 6);
  const tile = ensurePeerTile(pid);
  if (tile) {
    // 名称：先用 peerId（后续我们可以从服务端下发 name）
    tile.nameEl.textContent = safeText(remotePeerId, pid);

    if (consumer.kind === 'video') {
      tile.videoProducerId = producerId;
      tile.videoEl.srcObject = stream;
      setBadge(tile, 'video', '视频');
      if (!pinnedPeerId) {
        pinPeer(pid);
      }
    } else {
      tile.audioProducerId = producerId;
      setBadge(tile, 'audio', '音频');
      // 音频用隐藏 audio 播放，保证多人时都能听到
      if (!tile.audioEl) {
        const a = document.createElement('audio');
        a.autoplay = true;
        a.playsInline = true;
        a.style.display = 'none';
        document.body.appendChild(a);
        tile.audioEl = a;
      }
      tile.audioEl.srcObject = stream;
    }
  }

  wsSend({ type: 'resume', roomId, peerId, consumerId: consumer.id });
}

function closeConsumer(producerId) {
  const entry = consumers.get(producerId);
  if (!entry) return;
  try { entry.consumer.close(); } catch {}
  consumers.delete(producerId);
  // 释放 tile 上的对应资源
  const rid = entry.peerId;
  if (rid && peerTiles.has(rid)) {
    const tile = peerTiles.get(rid);
    if (entry.kind === 'video' && tile.videoProducerId === producerId) {
      tile.videoProducerId = null;
      tile.videoEl.srcObject = null;
      // 若主画面正在展示此路，且这人没有其它视频，则切换
      if (pinnedPeerId === rid) {
        pinnedPeerId = null;
      }
    }
    if (entry.kind === 'audio' && tile.audioProducerId === producerId) {
      tile.audioProducerId = null;
      try { tile.audioEl?.remove(); } catch {}
      tile.audioEl = null;
    }
    // 若该 peer 已无音视频，移除 tile
    if (!tile.videoProducerId && !tile.audioProducerId) {
      removePeerTile(rid);
    } else {
      updatePinnedUI();
    }
  }

  // 主画面兜底
  if (!pinnedPeerId) {
    remoteVideo.srcObject = null;
    remotePlaceholder.style.display = '';
    for (const [pid, tile] of peerTiles) {
      if (tile.videoEl?.srcObject) {
        pinPeer(pid);
        break;
      }
    }
  }
}

function resetRemoteOnly() {
  try { camProducer?.close(); } catch {}
  try { micProducer?.close(); } catch {}
  camProducer = null;
  micProducer = null;

  for (const [pid] of consumers) closeConsumer(pid);

  try { sendTransport?.close(); } catch {}
  try { recvTransport?.close(); } catch {}
  sendTransport = null;
  recvTransport = null;

  device = null;
}

async function setupSfuAfterJoin() {
  const rtpCaps = pendingRouterRtpCaps ? await pendingRouterRtpCaps : await waitOnce('routerRtpCapabilities');
  pendingRouterRtpCaps = null;
  await loadDevice(rtpCaps);

  wsSend({ type: 'createWebRtcTransport', direction: 'send', roomId, peerId });
  const sendData = await waitOnce('webRtcTransportCreated');
  await setupSendTransport(sendData);

  wsSend({ type: 'createWebRtcTransport', direction: 'recv', roomId, peerId });
  const recvData = await waitOnce('webRtcTransportCreated');
  await setupRecvTransport(recvData);

  await startProducers();

  wsSend({ type: 'getProducers', roomId, peerId });
  const existing = await waitOnce('producersList');
  for (const p of existing) {
    await consume(p.producerId, p.peerId);
  }

  if (btnToggleCam) btnToggleCam.disabled = false;
  if (btnToggleMic) btnToggleMic.disabled = false;
}

async function reconnect() {
  resetRemoteOnly();
  try {
    await connectSignaling();
  } catch {
    return;
  }

  try {
    await setupSfuAfterJoin();
    setStatus(true, '已重连');
  } catch {
    scheduleReconnect();
  }
}

function teardown() {
  manualLeave = true;
  stopHeartbeat();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectAttempt = 0;

  try { camProducer?.close(); } catch {}
  try { micProducer?.close(); } catch {}
  camProducer = null;
  micProducer = null;
  wantCam = false;
  wantMic = false;

  for (const [pid] of consumers) closeConsumer(pid);

  try { sendTransport?.close(); } catch {}
  try { recvTransport?.close(); } catch {}
  sendTransport = null;
  recvTransport = null;

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  try { ws?.close(); } catch {}
  ws = null;

  remoteVideo.srcObject = null;
  remotePlaceholder.style.display = '';
  localVideo.srcObject = null;
  stopCallTimer();
  btnToggleCam?.classList.add('toggle-off');
  btnToggleMic?.classList.add('toggle-off');
  if (thumbGrid) thumbGrid.innerHTML = '';
  for (const [pid] of peerTiles) removePeerTile(pid);
  pinnedPeerId = null;

  device = null;
  enterJoinPage();
  btnConnect.disabled = false;
  setStatus(false, '未连接');
}

// ===== 事件绑定 =====
btnGenerateRoom?.addEventListener('click', () => {
  roomInput.value = 'nova-' + Math.random().toString(36).slice(2, 8);
});

btnConnect?.addEventListener('click', async () => {
  if (btnToggleCam) btnToggleCam.disabled = true;
  if (btnToggleMic) btnToggleMic.disabled = true;
  try {
    await connectSignaling();
  } catch (e) {
    return;
  }
  reconnectAttempt = 0;
  await setupSfuAfterJoin();
});

btnBackToJoin?.addEventListener('click', () => {
  teardown();
});

btnHangup?.addEventListener('click', () => {
  teardown();
});

// 摄像头/麦克风按钮：只做 track enabled 切换（producer 会继续存在，SaaS 常见做法）
btnToggleCam?.addEventListener('click', async () => {
  if (!sendTransport) return;
  ensureLocalPreviewStream();

  if (!camProducer) {
    try {
      wantCam = true;
      btnToggleCam.classList.remove('toggle-off');
      await startProducers();
    } catch {
      wantCam = false;
      btnToggleCam.classList.add('toggle-off');
    }
    return;
  }

  const t = ensureLocalPreviewStream().getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  wantCam = t.enabled;
  btnToggleCam.classList.toggle('toggle-off', !t.enabled);
});

btnToggleMic?.addEventListener('click', async () => {
  if (!sendTransport) return;
  ensureLocalPreviewStream();

  if (!micProducer) {
    try {
      wantMic = true;
      btnToggleMic.classList.remove('toggle-off');
      await startProducers();
    } catch {
      wantMic = false;
      btnToggleMic.classList.add('toggle-off');
    }
    return;
  }

  const t = ensureLocalPreviewStream().getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  wantMic = t.enabled;
  btnToggleMic.classList.toggle('toggle-off', !t.enabled);
});

// 预留：切换摄像头（后续再完善 replaceTrack）
btnSwitchCam?.addEventListener('click', async () => {
  alert('切换摄像头：SFU 版本后续补充 replaceTrack 逻辑');
});

// 默认填充云端信令地址
serverInput.value = CONFIG.signalingUrl;
try {
  const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocalHost) {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = location.port || '8080';
    serverInput.value = `${wsProto}//${location.hostname}:${port}/ws`;
  }
} catch {}
enterJoinPage();
setStatus(false, '未连接');
