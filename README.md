\# LiveBridge

🔥 基于 WebRTC + SFU (mediasoup) 的浏览器原生多人会议 / 直播系统，支持低延迟多人互动、跨设备实时连接。



\## ✨ 功能特性

\- ✅ 纯浏览器运行：无需安装客户端，打开网页即可加入会议

\- ✅ SFU 架构：支持多人直播 / 会议，带宽占用远低于 P2P

\- ✅ 自适应码率：根据网络状况自动调整视频质量

\- ✅ 房间管理：随机生成房间号，快速邀请他人加入

\- ✅ 设备控制：麦克风 / 摄像头开关、设备选择

\- ✅ HTTPS + WSS：安全加密传输，兼容现代浏览器



\## 📦 项目结构

LiveBridge/

├── public/ # 前端静态资源（app.js、样式等）

├── src/ # 核心业务代码

├── index.html # 主页面

├── server.js # SFU 信令 / 媒体服务器（Node.js）

├── package.json # 依赖管理

├── build.js # 构建脚本

└── README.md # 项目说明

plaintext



\## 🚀 快速开始（本地运行）

\### 1. 环境要求

\- Node.js ≥ 18.0.0

\- npm ≥ 8.0.0

\- 现代浏览器（Chrome ≥ 88 / Edge ≥ 88 / Firefox ≥ 78）



\### 2. 克隆项目

```bash

git clone https://github.com/i-Orangeade/LiveBridge.git

cd LiveBridge

3\. 安装依赖

bash

运行

npm install

4\. 启动 SFU 服务器

bash

运行

node server.js

5\. 访问页面

本地开发：http://localhost:8080

生产环境：配置 Nginx 反向代理 + HTTPS（见下方部署教程）

☁️ 云服务器部署教程（Ubuntu 20.04+）

1\. 准备服务器

一台 Ubuntu 20.04/22.04 云服务器（推荐 2 核 4G 以上）

已绑定域名（如 livebridge.cn）

开放端口：80/tcp、443/tcp、30000-40000/udp（WebRTC 媒体流）

2\. 安装依赖

bash

运行

apt update \&\& apt upgrade -y



curl -fsSL https://deb.nodesource.com/setup\_18.x | bash -

apt install nodejs -y



apt install nginx -y

apt install certbot python3-certbot-nginx -y

3\. 克隆代码到服务器

bash

运行

cd /var/www

git clone https://github.com/i-Orangeade/LiveBridge.git

cd LiveBridge

npm install

4\. 配置 Nginx 反向代理

创建 /etc/nginx/sites-available/livebridge.conf：

nginx

server {

&#x20;   listen 80;

&#x20;   server\_name livebridge.cn;

&#x20;   return 301 https://$host$request\_uri;

}



server {

&#x20;   listen 443 ssl;

&#x20;   server\_name livebridge.cn;



&#x20;   ssl\_certificate /etc/letsencrypt/live/livebridge.cn/fullchain.pem;

&#x20;   ssl\_certificate\_key /etc/letsencrypt/live/livebridge.cn/privkey.pem;



&#x20;   root /var/www/LiveBridge;

&#x20;   index index.html;



&#x20;   location / {

&#x20;       try\_files $uri $uri/ =404;

&#x20;   }



&#x20;   location = /app.js {

&#x20;       alias /var/www/LiveBridge/public/app.js;

&#x20;       default\_type application/javascript;

&#x20;       add\_header Cache-Control "no-cache";

&#x20;   }



&#x20;   location /ws {

&#x20;       proxy\_pass http://127.0.0.1:8080;

&#x20;       proxy\_http\_version 1.1;

&#x20;       proxy\_set\_header Upgrade $http\_upgrade;

&#x20;       proxy\_set\_header Connection "upgrade";

&#x20;       proxy\_set\_header Host $host;

&#x20;       proxy\_read\_timeout 3600;

&#x20;       proxy\_send\_timeout 3600;

&#x20;   }

}

启用配置：

bash

运行

ln -s /etc/nginx/sites-available/livebridge.conf /etc/nginx/sites-enabled/

nginx -t \&\& systemctl reload nginx

5\. 申请 SSL 证书

bash

运行

certbot --nginx -d livebridge.cn

6\. 启动 SFU 服务（后台运行）

bash

运行

npm install -g pm2

pm2 start server.js --name livebridge

pm2 startup

pm2 save

📖 使用说明

创建房间：打开 https://livebridge.cn，页面会自动生成随机房间号

加入房间：输入相同房间号和昵称，点击「Join Room」

设备控制：可开关麦克风 / 摄像头、切换输入设备

多人互动：支持多人同时连入，所有参与者看到同一房间流

🛠️ 技术栈

前端：原生 JavaScript + WebRTC API + mediasoup-client

后端：Node.js + mediasoup (SFU) + WebSocket

部署：Nginx + SSL + PM2

协议：HTTPS + WSS + WebRTC (UDP/TCP)

🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来改进项目！

Fork 本仓库

创建功能分支 (git checkout -b feature/AmazingFeature)

提交更改 (git commit -m 'Add some AmazingFeature')

推送到分支 (git push origin feature/AmazingFeature)

打开 Pull Request

📄 许可证

本项目基于 MIT 许可证开源。

💡 常见问题

连接失败 / 显示「已断开」：检查 pm2 status、nginx -t、浏览器 F12 Network WS

视频卡顿 / 延迟高：检查服务器带宽、UDP 30000-40000 是否开放

浏览器提示安全警告：必须使用 HTTPS

plaintext



\---



\# 你现在只需要 3 步完成上传

在你本地 Git Bash 里执行：



```bash

\# 1. 把上面内容保存为本地 README.md

\# 然后执行：



git add README.md

git commit -m "Add professional README"

git push

