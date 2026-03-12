// client/signaling_client.cpp

#include "signaling_client.h"

#include <iostream>

SignalingClient::SignalingClient() {
    // 关闭日志（需要时可以打开）
    m_client.clear_access_channels(websocketpp::log::alevel::all);
    m_client.clear_error_channels(websocketpp::log::elevel::all);

    // 初始化 ASIO
    m_client.init_asio();

    // 注册回调
    m_client.set_open_handler(std::bind(&SignalingClient::on_open,  this, std::placeholders::_1));
    m_client.set_close_handler(std::bind(&SignalingClient::on_close, this, std::placeholders::_1));
    m_client.set_message_handler(std::bind(&SignalingClient::on_message, this,
                                           std::placeholders::_1, std::placeholders::_2));
    m_client.set_fail_handler(std::bind(&SignalingClient::on_fail, this, std::placeholders::_1));
}

SignalingClient::~SignalingClient() {
    close();
}

bool SignalingClient::connect(const std::string& uri) {
    websocketpp::lib::error_code ec;
    client::connection_ptr con = m_client.get_connection(uri, ec);
    if (ec) {
        std::cerr << "[SignalingClient] create connection failed: " << ec.message() << std::endl;
        return false;
    }

    m_hdl = con->get_handle();
    m_client.connect(con);

    // 启动事件循环线程
    m_thread = std::thread([this]() {
        try {
            m_client.run();
        } catch (const std::exception& e) {
            std::cerr << "[SignalingClient] run exception: " << e.what() << std::endl;
        }
    });

    return true;
}

void SignalingClient::send(const std::string& message) {
    if (!m_connected.load()) {
        std::cerr << "[SignalingClient] not connected, cannot send" << std::endl;
        return;
    }

    std::lock_guard<std::mutex> lock(m_send_mutex);
    websocketpp::lib::error_code ec;
    m_client.send(m_hdl, message, websocketpp::frame::opcode::text, ec);
    if (ec) {
        std::cerr << "[SignalingClient] send failed: " << ec.message() << std::endl;
    }
}

void SignalingClient::set_message_callback(MessageCallback cb) {
    m_message_cb = std::move(cb);
}

void SignalingClient::close() {
    if (m_connected.load()) {
        websocketpp::lib::error_code ec;
        m_client.close(m_hdl, websocketpp::close::status::going_away, "", ec);
        if (ec) {
            std::cerr << "[SignalingClient] close failed: " << ec.message() << std::endl;
        }
        m_connected.store(false);
    }

    if (m_thread.joinable()) {
        m_thread.join();
    }
}

void SignalingClient::on_open(connection_hdl) {
    m_connected.store(true);
    std::cout << "[SignalingClient] connected to signaling server" << std::endl;
}

void SignalingClient::on_close(connection_hdl) {
    m_connected.store(false);
    std::cout << "[SignalingClient] connection closed" << std::endl;
}

void SignalingClient::on_message(connection_hdl, message_ptr msg) {
    const std::string payload = msg->get_payload();
    // 把收到的 JSON 文本交给上层回调
    if (m_message_cb) {
        m_message_cb(payload);
    }
}

void SignalingClient::on_fail(connection_hdl) {
    std::cerr << "[SignalingClient] connection failed" << std::endl;
}

