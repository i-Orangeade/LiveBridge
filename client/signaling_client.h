// client/signaling_client.h
// 说明：
//   封装 WebSocket++ 客户端，用于连接信令服务器。
//   提供：
//     - connect(uri)：连接到 ws://host:port
//     - send(text)：发送文本（JSON 字符串）
//     - set_message_callback(cb)：收到文本时调用上层回调
//   内部使用独立线程运行 ASIO 事件循环。

#pragma once

#include <functional>
#include <string>
#include <thread>
#include <atomic>
#include <mutex>

#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>

class SignalingClient {
public:
    using MessageCallback = std::function<void(const std::string&)>;

    SignalingClient();
    ~SignalingClient();

    // 连接指定 URI，例如 "ws://127.0.0.1:9002"
    bool connect(const std::string& uri);

    // 发送文本消息（信令 JSON）
    void send(const std::string& message);

    // 设置收到消息时的回调
    void set_message_callback(MessageCallback cb);

    // 主动关闭连接并退出内部线程
    void close();

private:
    using client        = websocketpp::client<websocketpp::config::asio_client>;
    using connection_hdl = websocketpp::connection_hdl;
    using message_ptr    = client::message_ptr;

    // WebSocket++ 回调
    void on_open(connection_hdl hdl);
    void on_close(connection_hdl hdl);
    void on_message(connection_hdl hdl, message_ptr msg);
    void on_fail(connection_hdl hdl);

private:
    client              m_client;
    connection_hdl      m_hdl;
    std::thread         m_thread;        // 运行 ASIO 的线程
    std::atomic<bool>   m_connected{false};

    std::mutex          m_send_mutex;    // 发送操作的互斥
    MessageCallback     m_message_cb;    // 收到消息时的上层回调
};

