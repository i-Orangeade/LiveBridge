<div align="center">

# 🚀 LiveBridge

**轻量、稳定的 WebRTC + SFU 浏览器原生多人实时音视频通讯引擎**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518.0.0-green.svg)](https://nodejs.org/)
[![mediasoup](https://img.shields.io/badge/mediasoup-SFU-orange.svg)](https://mediasoup.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-贡献指南)

</div>

---

## 📖 项目简介

**LiveBridge** 是一个基于 `WebRTC` 和 `mediasoup (SFU)` 构建的轻量级多人视频会议与直播系统。无需安装任何客户端，打开现代浏览器即可体验低延迟、高并发的实时音视频互动。它专为**云端部署**和**本地开发**双重场景设计，开箱即用。

---

## ✨ 核心特性

- 🌐 **纯浏览器原生**：无需额外插件或客户端，支持现代主流浏览器（Chrome/Edge/Firefox/Safari）。
- 🚀 **高性能 SFU 架构**：基于强大的 `mediasoup`，服务器仅负责流的路由与转发，相比 P2P 架构，大幅降低了多端互联时的客户端上行带宽和 CPU 压力。
- 👥 **多人无缝互联**：默认支持最多 **16 人** 的同房间音视频互动。
- 🎥 **智能设备与状态管理**：
  - 支持动态切换摄像头与麦克风。
  - 自动检测设备状态，即使无摄像头也能使用**纯音频降级模式**。
  - 支持多分辨率选择与输入音量调节。
- ⚡ **稳健的连接策略**：
  - 内置 STUN/TURN 中继支持，轻松穿透复杂 NAT 和防火墙。
  - 完善的心跳保活与断线重连机制。
- 📦 **零配置打包**：内置 `esbuild`，自动打包前端资源，无外部 CDN 强依赖。

---

## 📦 项目结构

```text
LiveBridge/
├── public/          # 自动生成的静态资源目录 (app.js)
├── src/             # 前端核心业务源码
│   └── app.js       # WebRTC 客户端及 UI 交互逻辑
├── index.html       # 主入口页面 (包含现代化拟态风格 UI)
├── server.js        # Node.js SFU 媒体服务器 + WebSocket 信令 + 静态文件服务
├── build.js         # 前端构建脚本 (esbuild)
└── package.json     # 项目依赖配置
```

---

## 🚀 快速开始（本地开发）

### 1. 环境准备

- **Node.js**: `≥ 18.0.0`
- **npm**: `≥ 8.0.0`
- **浏览器**: Chrome `≥ 88` / Edge `≥ 88` / Firefox `≥ 78`

### 2. 克隆与安装

```bash
# 克隆代码仓库
git clone https://github.com/i-Orangeade/LiveBridge.git
cd LiveBridge

# 安装依赖
npm install
```

### 3. 启动服务

```bash
# 启动构建和服务器
npm start
```
*启动成功后，控制台会输出如下信息：*
```text
[build] public/app.js generated
HTTP : http://localhost:8080
WS   : ws://localhost:8080/ws
[mediasoup] announcedIp=49.233.175.236 rtcPortRange=49160-49200
```

### 4. 访问测试
> ⚠️ **注意**：为了正常获取麦克风和摄像头权限，请必须通过 `http://localhost:8080` 访问，**不要**直接双击 `index.html` 打开。

1. 在浏览器中打开 `http://localhost:8080`。
2. 输入房间号（如：`test-room`）和昵称。
3. 点击 **"Join Room"** 加入。
4. 在另一台设备或新的浏览器标签页中，输入**相同的房间号**即可进行视频通话！

---

## ☁️ 云服务器部署指南 (生产环境)

推荐在 **Ubuntu 20.04/22.04** 上进行部署。

### 1. 服务器准备
- 推荐配置：2核 4G 或以上。
- 准备一个已解析的域名（例如 `livebridge.cn`）。
- **放行防火墙/安全组端口**：
  - `80/tcp`, `443/tcp` (Web 服务与信令)
  - `49160-49200/udp` (WebRTC 媒体流通信，根据 `server.js` 的配置放行)

### 2. 环境安装

```bash
# 更新系统并安装必要组件
apt update && apt upgrade -y
apt install curl nginx -y
apt install certbot python3-certbot-nginx -y

# 安装 Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install nodejs -y
```

### 3. 部署代码

```bash
cd /var/www
git clone https://github.com/i-Orangeade/LiveBridge.git
cd LiveBridge

# 安装依赖并构建
npm install
npm run build
```

### 4. 申请 SSL 证书
WebRTC 在公网环境下**必须**使用 HTTPS，否则浏览器会拒绝摄像头权限。
```bash
certbot --nginx -d livebridge.cn
```

### 5. Nginx 反向代理配置

创建 Nginx 配置文件 `/etc/nginx/sites-available/livebridge.conf`：

```nginx
server {
    listen 80;
    server_name livebridge.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name livebridge.cn;

    ssl_certificate /etc/letsencrypt/live/livebridge.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/livebridge.cn/privkey.pem;

    root /var/www/LiveBridge;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /app.js {
        alias /var/www/LiveBridge/public/app.js;
        default_type application/javascript;
        add_header Cache-Control "no-cache";
    }

    # 代理 WebSocket 信令
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

启用配置并重启 Nginx：
```bash
ln -s /etc/nginx/sites-available/livebridge.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 6. 使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start server.js --name livebridge
pm2 startup
pm2 save
```

---

## 💡 常见问题与排错

**Q1: 浏览器提示无法访问摄像头/麦克风？**
> 确保你是通过 `localhost` 或者 `HTTPS` 访问页面。多数浏览器处于安全考虑，禁止在 `http://IP` 或是 `file://` 环境下获取媒体设备。

**Q2: 成功连接但看不到对方画面？**
> 1. 确认双方输入了**完全一致**的房间号（区分大小写）。
> 2. 检查云端部署时，是否已经在云服务商的控制台放行了 `UDP 49160-49200` 端口。
> 3. 按 `F12` 打开浏览器控制台查看是否有报错。

**Q3: 跨局域网或不同运营商连接不稳定？**
> 本项目已在前端代码 (`src/app.js`) 默认集成了 STUN/TURN 服务器。如果仍有问题，请检查你的 TURN 服务是否正常运行。

---

## 🛠️ 技术栈详情

- **前端**: 原生 JavaScript, HTML5, CSS3, `mediasoup-client`, `esbuild`
- **后端**: Node.js, `mediasoup` (SFU 核心), `ws` (WebSocket)
- **协议栈**: WebRTC, DTLS, SRTP, HTTPS, WSS

---

## 🤝 贡献指南

我们非常欢迎任何形式的贡献，包括 Bug 修复、新功能特性、文档完善等！

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 在 GitHub 上开启一个 Pull Request 🎉

---

## 📄 许可证

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 协议开源。
