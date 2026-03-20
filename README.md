🚀 LiveBridge

🔥 基于 WebRTC + SFU（mediasoup） 的浏览器原生多人会议 / 直播系统
支持低延迟多人互动、跨设备实时连接

✨ 功能特性

✅ 纯浏览器运行：无需安装客户端，打开网页即可加入会议

✅ SFU 架构：支持多人直播 / 会议，带宽占用远低于 P2P

✅ 自适应码率：根据网络状况自动调整视频质量

✅ 房间管理：随机生成房间号，快速邀请他人加入

✅ 设备控制：麦克风 / 摄像头开关、设备选择

✅ 安全传输：HTTPS + WSS，兼容现代浏览器

📦 项目结构
LiveBridge/
├── public/          # 前端静态资源（app.js、样式等）
├── src/             # 核心业务代码
├── index.html       # 主页面
├── server.js        # SFU 信令 / 媒体服务器（Node.js）
├── package.json     # 依赖管理
├── build.js         # 构建脚本
└── README.md        # 项目说明
🚀 快速开始（本地运行）
1️⃣ 环境要求

Node.js ≥ 18.0.0

npm ≥ 8.0.0

现代浏览器（Chrome ≥ 88 / Edge ≥ 88 / Firefox ≥ 78）

2️⃣ 克隆项目
git clone https://github.com/i-Orangeade/LiveBridge.git
cd LiveBridge
3️⃣ 安装依赖
npm install
4️⃣ 启动 SFU 服务器
node server.js
5️⃣ 访问页面

本地开发：http://localhost:8080

生产环境：使用 Nginx + HTTPS（见下方部署）

☁️ 云服务器部署教程（Ubuntu 20.04+）
1️⃣ 准备服务器

Ubuntu 20.04 / 22.04

推荐配置：2 核 4G 以上

已绑定域名（如：livebridge.cn）

开放端口：

80/tcp

443/tcp

30000-40000/udp（WebRTC 媒体流）

2️⃣ 安装依赖
apt update && apt upgrade -y

curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install nodejs -y

apt install nginx -y
apt install certbot python3-certbot-nginx -y
3️⃣ 克隆项目
cd /var/www
git clone https://github.com/i-Orangeade/LiveBridge.git
cd LiveBridge

npm install
4️⃣ 配置 Nginx 反向代理

创建文件：

/etc/nginx/sites-available/livebridge.conf

内容如下：

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

启用配置：

ln -s /etc/nginx/sites-available/livebridge.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
5️⃣ 申请 SSL 证书
certbot --nginx -d livebridge.cn
6️⃣ 使用 PM2 后台运行
npm install -g pm2

pm2 start server.js --name livebridge
pm2 startup
pm2 save
📖 使用说明

🎯 创建房间：访问网站自动生成房间号

👥 加入房间：输入相同房间号 + 昵称

🎙 设备控制：开关麦克风 / 摄像头、切换设备

📡 多人互动：所有用户共享同一房间流

🛠️ 技术栈

前端：原生 JavaScript + WebRTC API + mediasoup-client

后端：Node.js + mediasoup（SFU）+ WebSocket

部署：Nginx + SSL + PM2

协议：HTTPS + WSS + WebRTC（UDP/TCP）

🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

# 1. Fork 仓库
# 2. 创建分支
git checkout -b feature/AmazingFeature

# 3. 提交代码
git commit -m "Add some AmazingFeature"

# 4. 推送分支
git push origin feature/AmazingFeature

然后在 GitHub 上发起 Pull Request 🎉

📄 许可证

本项目基于 MIT License 开源

💡 常见问题
❌ 连接失败 / 显示已断开

检查 pm2 status

检查 nginx -t

浏览器 F12 → Network → WS

📉 视频卡顿 / 延迟高

检查服务器带宽

确认 UDP 30000-40000 端口已开放

⚠️ 浏览器安全警告

必须使用 HTTPS 访问