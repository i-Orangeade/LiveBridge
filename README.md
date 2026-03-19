🚀 LiveBridge

🔥 A browser-native multi-user conferencing / live streaming system built with WebRTC + SFU (mediasoup), supporting low-latency real-time interaction across devices.

✨ Features

✅ Browser-based — No installation required, join directly via web

✅ SFU Architecture — Efficient multi-user streaming with reduced bandwidth vs P2P

✅ Adaptive Bitrate — Automatically adjusts video quality based on network conditions

✅ Room Management — Auto-generated room IDs for quick sharing

✅ Device Controls — Toggle mic/camera and switch input devices

✅ Secure Communication — HTTPS + WSS for modern browser compatibility

📦 Project Structure
LiveBridge/
├── public/          # Frontend static assets (app.js, styles, etc.)
├── src/             # Core business logic
├── index.html       # Main entry page
├── server.js        # SFU signaling / media server (Node.js)
├── package.json     # Dependencies
├── build.js         # Build script
└── README.md        # Project documentation
🚀 Quick Start (Local Development)
1. Requirements

Node.js ≥ 18.0.0

npm ≥ 8.0.0

Modern browser:

Chrome ≥ 88

Edge ≥ 88

Firefox ≥ 78

2. Clone the Repository
git clone https://github.com/i-Orangeade/LiveBridge.git
cd LiveBridge
3. Install Dependencies
npm install
4. Start the SFU Server
node server.js
5. Access the App

Local: http://localhost:8080

Production: Use Nginx + HTTPS (see deployment below)

☁️ Deployment Guide (Ubuntu 20.04+)
1. Server Preparation

Ubuntu 20.04 / 22.04 server (recommended: 2 CPU / 4GB RAM)

Domain name (e.g., livebridge.cn)

Open ports:

80/tcp

443/tcp

30000–40000/udp (WebRTC media)

2. Install Dependencies
apt update && apt upgrade -y

curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install nodejs -y

apt install nginx -y
apt install certbot python3-certbot-nginx -y
3. Deploy Project
cd /var/www
git clone https://github.com/i-Orangeade/LiveBridge.git
cd LiveBridge
npm install
4. Configure Nginx

Create config:

/etc/nginx/sites-available/livebridge.conf
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

Enable config:

ln -s /etc/nginx/sites-available/livebridge.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
5. Obtain SSL Certificate
certbot --nginx -d livebridge.cn
6. Run Service with PM2
npm install -g pm2
pm2 start server.js --name livebridge
pm2 startup
pm2 save
📖 Usage

Create Room
Open https://livebridge.cn — a random room ID will be generated automatically.

Join Room
Enter the same room ID and your nickname, then click "Join Room".

Device Controls
Toggle microphone/camera or switch input devices.

Real-Time Interaction
Multiple participants can join and share streams simultaneously.

🛠️ Tech Stack

Frontend: Vanilla JavaScript + WebRTC API + mediasoup-client

Backend: Node.js + mediasoup (SFU) + WebSocket

Deployment: Nginx + SSL + PM2

Protocols: HTTPS + WSS + WebRTC (UDP/TCP)

🤝 Contributing

Contributions are welcome!

Fork the repository

Create a feature branch

git checkout -b feature/AmazingFeature

Commit your changes

git commit -m "Add some AmazingFeature"

Push to the branch

git push origin feature/AmazingFeature

Open a Pull Request

📄 License

This project is licensed under the MIT License.

💡 FAQ

❓ Connection failed / Disconnected

Check pm2 status

Verify nginx -t

Inspect browser DevTools → Network → WebSocket

❓ High latency / video lag

Check server bandwidth

Ensure UDP ports 30000–40000 are open

❓ Browser security warning

HTTPS is required for WebRTC