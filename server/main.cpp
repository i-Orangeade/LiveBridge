// server/main.cpp
// 说明：
//   使用 WebSocket++ 实现一个最小化的 WebRTC 信令服务器。
//   职责非常简单：转发任意客户端发来的文本消息（一般为 JSON）给其他所有客户端。
//   客户端之间通过 JSON 承载 SDP / ICE 等信令内容。
//
// 架构思路：
//   - 所有客户端连接到同一个 WebSocket 服务器（本文件）。
//   - 当某个客户端发送一条消息时，服务器不解析内容，直接广播给除了发送者以外的所有客户端。
//   - 这样即可实现最简单的“1 对 1”或“多对多”信令转发。

#include <set>
#include <mutex>
#include <iostream>

#include <websocketpp/config/asio_no_tls.hpp>   // 使用非 TLS 配置，简单易用
#include <websocketpp/server.hpp>

// WebSocket++ 类型别名，简化书写
using websocket_server = websocketpp::server<websocketpp::config::asio>;
using connection_hdl   = websocketpp::connection_hdl;
using message_ptr      = websocket_server::message_ptr;

class SignalingServer {
public:
    SignalingServer() {
        // 关闭 WebSocket++ 的冗余日志（调试时可以打开）
        m_server.clear_access_channels(websocketpp::log::alevel::all);
        m_server.clear_error_channels(websocketpp::log::elevel::all);

        // 初始化 ASIO
        m_server.init_asio();

        // 注册连接 / 关闭 / 消息 回调
        m_server.set_open_handler(std::bind(&SignalingServer::on_open,    this, std::placeholders::_1));
        m_server.set_close_handler(std::bind(&SignalingServer::on_close,  this, std::placeholders::_1));
        m_server.set_message_handler(std::bind(&SignalingServer::on_message, this,
                                               std::placeholders::_1, std::placeholders::_2));
    }

    // 启动服务器，开始监听指定端口
    void run(uint16_t port) {
        try {
            // 允许端口复用（方便重启）
            m_server.set_reuse_addr(true);
            m_server.listen(port);
            m_server.start_accept();

            std::cout << "[Signaling] server started on port " << port << std::endl;
            // 进入事件循环（阻塞）
            m_server.run();
        } catch (const std::exception &e) {
            std::cerr << "[Signaling] exception: " << e.what() << std::endl;
        }
    }

private:
    // 新客户端连接
    void on_open(connection_hdl hdl) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_connections.insert(hdl);
        std::cout << "[Signaling] client connected, total: " << m_connections.size() << std::endl;
    }

    // 客户端断开
    void on_close(connection_hdl hdl) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_connections.erase(hdl);
        std::cout << "[Signaling] client disconnected, total: " << m_connections.size() << std::endl;
    }

    // 收到任意客户端的消息
    void on_message(connection_hdl from, message_ptr msg) {
        // 这里不解析 JSON，原样广播给其他客户端
        const std::string payload = msg->get_payload();
        std::cout << "[Signaling] recv: " << payload << std::endl;

        std::lock_guard<std::mutex> lock(m_mutex);
        for (const auto &conn : m_connections) {
            // 不转发给消息发送者自己
            if (conn.lock().get() == from.lock().get()) {
                continue;
            }

            websocketpp::lib::error_code ec;
            m_server.send(conn, payload, websocketpp::frame::opcode::text, ec);
            if (ec) {
                std::cerr << "[Signaling] broadcast failed: " << ec.message() << std::endl;
            }
        }
    }

private:
    websocket_server m_server;

    // 当前所有已连接客户端的集合
    std::set<connection_hdl, std::owner_less<connection_hdl>> m_connections;
    std::mutex m_mutex;  // 保护 m_connections
};

int main(int argc, char *argv[]) {
    // 默认端口 9002，可以通过命令行指定
    uint16_t port = 9002;
    if (argc >= 2) {
        try {
            port = static_cast<uint16_t>(std::stoi(argv[1]));
        } catch (...) {
            std::cerr << "Invalid port, use default 9002" << std::endl;
        }
    }

    SignalingServer server;
    server.run(port);

    return 0;
}

