// client/main.cpp
// 说明：
//   - 初始化 SDL2（用于渲染本地/远端视频）。
//   - 创建信令客户端，连接到本地信令服务器（WebSocket）。
//   - 创建 WebRtcManager，完成 PeerConnection 初始化。
//   - 按键 'O' 主动发起 offer，另一端自动应答，实现 1 对 1 通话信令流程。
//   - 关闭窗口或按 ESC 退出。

#include <iostream>
#include <string>

#include <SDL.h>

#include <nlohmann/json.hpp>

#include "signaling_client.h"
#include "webrtc_manager.h"

using json = nlohmann::json;

int main(int argc, char* argv[]) {
    // ========== 1. 初始化 SDL ==========
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_TIMER) != 0) {
        std::cerr << "[Client] SDL_Init failed: " << SDL_GetError() << std::endl;
        return -1;
    }

    // 创建本地/远端两个渲染窗口
    SdlVideoRenderer local_renderer("Local Video", true);
    SdlVideoRenderer remote_renderer("Remote Video", false);

    if (!local_renderer.initialized() || !remote_renderer.initialized()) {
        std::cerr << "[Client] create SDL renderer failed" << std::endl;
        SDL_Quit();
        return -1;
    }

    // ========== 2. 创建信令客户端并连接 ==========
    std::string ws_uri = "ws://127.0.0.1:9002";
    if (argc >= 2) {
        // 允许从命令行传入自定义信令服务器地址
        ws_uri = argv[1];
    }

    SignalingClient signaling_client;
    if (!signaling_client.connect(ws_uri)) {
        std::cerr << "[Client] connect signaling server failed" << std::endl;
        SDL_Quit();
        return -1;
    }

    // ========== 3. 创建 WebRTC 管理器 ==========
    WebRtcManager webrtc(&local_renderer, &remote_renderer);

    // 初始化 WebRTC，并传入“信令发送回调”
    if (!webrtc.initialize([&signaling_client](const std::string& msg) {
        signaling_client.send(msg);
    })) {
        std::cerr << "[Client] WebRTC initialize failed" << std::endl;
        SDL_Quit();
        return -1;
    }

    // ========== 4. 设置信令消息回调 ==========
    signaling_client.set_message_callback([&webrtc](const std::string& msg) {
        try {
            json j = json::parse(msg);
            std::string type = j.value("type", "");

            if (type == "offer" || type == "answer") {
                std::string sdp = j.value("sdp", "");
                webrtc.handle_remote_sdp(type, sdp);
            } else if (type == "candidate") {
                std::string sdp_mid      = j.value("sdpMid", "");
                int         sdp_mline    = j.value("sdpMLineIndex", 0);
                std::string candidate    = j.value("candidate", "");
                webrtc.handle_remote_ice(sdp_mid, sdp_mline, candidate);
            } else {
                std::cout << "[Client] unknown signaling type: " << type << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "[Client] parse signaling message failed: " << e.what() << std::endl;
        }
    });

    // ========== 5. 主事件循环 ==========
    bool quit = false;
    while (!quit) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT) {
                quit = true;
            } else if (e.type == SDL_KEYDOWN) {
                if (e.key.keysym.sym == SDLK_ESCAPE) {
                    quit = true;
                } else if (e.key.keysym.sym == SDLK_o) {
                    // 按 O 键创建 offer（作为主叫方）。
                    std::cout << "[Client] create offer..." << std::endl;
                    webrtc.create_offer();
                }
            }
        }

        // 渲染本地/远端视频
        local_renderer.render();
        remote_renderer.render();

        SDL_Delay(10);
    }

    SDL_Quit();
    return 0;
}

