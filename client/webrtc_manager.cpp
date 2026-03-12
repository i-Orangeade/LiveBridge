// client/webrtc_manager.cpp

#include "webrtc_manager.h"

#include <iostream>

#include <nlohmann/json.hpp>

using json = nlohmann::json;

WebRtcManager::WebRtcManager(SdlVideoRenderer* local_renderer,
                             SdlVideoRenderer* remote_renderer)
    : m_local_renderer(local_renderer),
      m_remote_renderer(remote_renderer) {
}

WebRtcManager::~WebRtcManager() {
    if (m_peer_connection) {
        m_peer_connection->Close();
        m_peer_connection = nullptr;
    }
    m_factory = nullptr;

    if (m_network_thread)   m_network_thread->Stop();
    if (m_worker_thread)    m_worker_thread->Stop();
    if (m_signaling_thread) m_signaling_thread->Stop();

    rtc::CleanupSSL();
}

bool WebRtcManager::initialize(SignalingSendCallback send_cb) {
    m_send_cb = std::move(send_cb);

#ifdef _WIN32
    // Windows 下初始化 socket 库
    static rtc::WinsockInitializer winsock_init;
#endif

    // 初始化 SSL（用于 DTLS）
    if (!rtc::InitializeSSL()) {
        std::cerr << "[WebRTC] InitializeSSL failed" << std::endl;
        return false;
    }

    // 可选：打开 WebRTC 日志输出到调试控制台
    rtc::LogMessage::LogToDebug(rtc::LS_INFO);

    // 创建 WebRTC 专用线程：network / worker / signaling
    m_network_thread = rtc::Thread::CreateWithSocketServer();
    m_worker_thread  = rtc::Thread::Create();
    m_signaling_thread = rtc::Thread::Create();

    m_network_thread->SetName("network_thread", nullptr);
    m_worker_thread->SetName("worker_thread", nullptr);
    m_signaling_thread->SetName("signaling_thread", nullptr);

    m_network_thread->Start();
    m_worker_thread->Start();
    m_signaling_thread->Start();

    // 创建 PeerConnectionFactory
    m_factory = webrtc::CreatePeerConnectionFactory(
        m_network_thread.get(),     // 网络线程
        m_worker_thread.get(),      // 工作线程
        m_signaling_thread.get(),   // 信令线程
        nullptr,                    // AudioDeviceModule，可传 nullptr 使用默认
        webrtc::CreateBuiltinAudioEncoderFactory(),
        webrtc::CreateBuiltinAudioDecoderFactory(),
        webrtc::CreateBuiltinVideoEncoderFactory(),
        webrtc::CreateBuiltinVideoDecoderFactory(),
        nullptr,                    // audio_mixer
        nullptr                     // audio_processing
    );

    if (!m_factory) {
        std::cerr << "[WebRTC] CreatePeerConnectionFactory failed" << std::endl;
        return false;
    }

    // 创建 PeerConnection
    if (!create_peer_connection()) {
        std::cerr << "[WebRTC] create_peer_connection failed" << std::endl;
        return false;
    }

    // ===== 创建本地音频 Track 并添加到 PeerConnection =====
    rtc::scoped_refptr<webrtc::AudioSourceInterface> audio_source =
        m_factory->CreateAudioSource(cricket::AudioOptions{});

    m_audio_track = m_factory->CreateAudioTrack("audio_label", audio_source);

    if (m_audio_track) {
        auto result_or_error = m_peer_connection->AddTrack(m_audio_track, {"stream-0"});
        if (!result_or_error.ok()) {
            std::cerr << "[WebRTC] Add audio track failed: "
                      << result_or_error.error().message() << std::endl;
        }
    }

    // ===== 视频 Track（摄像头）留给你后续补充 =====
    // 典型流程：
    //   1. 创建一个实现 webrtc::VideoTrackSourceInterface 的视频源（封装平台摄像头）。
    //   2. 使用 factory->CreateVideoTrack("video_label", video_source) 创建 VideoTrack。
    //   3. 调用 m_peer_connection->AddTrack(video_track, {"stream-0"});
    //   4. 调用 video_track->AddOrUpdateSink(m_local_renderer, rtc::VideoSinkWants()) 进行本地预览。

    return true;
}

bool WebRtcManager::create_peer_connection() {
    webrtc::PeerConnectionInterface::RTCConfiguration config;

    // 配置 STUN 服务器
    webrtc::PeerConnectionInterface::IceServer stun_server;
    stun_server.urls.push_back("stun:stun.l.google.com:19302");
    config.servers.push_back(stun_server);

    // 创建依赖，并设置本对象为 PeerConnectionObserver
    webrtc::PeerConnectionDependencies dependencies(this);

    auto result = m_factory->CreatePeerConnectionOrError(config, std::move(dependencies));
    if (!result.ok()) {
        std::cerr << "[WebRTC] CreatePeerConnectionOrError failed: "
                  << result.error().message() << std::endl;
        return false;
    }

    m_peer_connection = result.value();
    return true;
}

void WebRtcManager::create_offer() {
    if (!m_peer_connection) return;

    // 作为主叫方，创建 offer
    webrtc::PeerConnectionInterface::RTCOfferAnswerOptions options;
    m_peer_connection->CreateOffer(this, options);  // this = CreateSessionDescriptionObserver
}

void WebRtcManager::handle_remote_sdp(const std::string& type, const std::string& sdp) {
    if (!m_peer_connection) return;

    webrtc::SdpParseError error;
    webrtc::SessionDescriptionInterface* desc =
        webrtc::CreateSessionDescription(type, sdp, &error);

    if (!desc) {
        std::cerr << "[WebRTC] parse remote SDP failed: " << error.description << std::endl;
        return;
    }

    // 设置远端描述
    m_peer_connection->SetRemoteDescription(
        webrtc::SetSessionDescriptionObserver::Create(),
        desc
    );

    // 如果对端发来的是 offer，本端需要创建 answer
    if (type == "offer") {
        webrtc::PeerConnectionInterface::RTCOfferAnswerOptions options;
        m_peer_connection->CreateAnswer(this, options);
    }
}

void WebRtcManager::handle_remote_ice(const std::string& sdp_mid,
                                      int sdp_mline_index,
                                      const std::string& candidate_str) {
    if (!m_peer_connection) return;

    webrtc::SdpParseError error;
    std::unique_ptr<webrtc::IceCandidateInterface> candidate(
        webrtc::CreateIceCandidate(sdp_mid, sdp_mline_index, candidate_str, &error));

    if (!candidate) {
        std::cerr << "[WebRTC] parse ICE candidate failed: " << error.description << std::endl;
        return;
    }

    if (!m_peer_connection->AddIceCandidate(candidate.get())) {
        std::cerr << "[WebRTC] AddIceCandidate failed" << std::endl;
    }
}

// ========== PeerConnectionObserver 接口实现 ==========

void WebRtcManager::OnSignalingChange(webrtc::PeerConnectionInterface::SignalingState new_state) {
    std::cout << "[WebRTC] OnSignalingChange: " << new_state << std::endl;
}

void WebRtcManager::OnAddStream(rtc::scoped_refptr<webrtc::MediaStreamInterface> stream) {
    // 远端媒体流增加时触发
    std::cout << "[WebRTC] OnAddStream" << std::endl;

    auto video_tracks = stream->GetVideoTracks();
    if (!video_tracks.empty() && m_remote_renderer) {
        auto remote_video_track = video_tracks[0];
        // 把远端视频 Track 绑定到 SDL 渲染器
        remote_video_track->AddOrUpdateSink(m_remote_renderer, rtc::VideoSinkWants());
    }
}

void WebRtcManager::OnRemoveStream(rtc::scoped_refptr<webrtc::MediaStreamInterface> stream) {
    std::cout << "[WebRTC] OnRemoveStream" << std::endl;
}

void WebRtcManager::OnDataChannel(rtc::scoped_refptr<webrtc::DataChannelInterface> channel) {
    std::cout << "[WebRTC] OnDataChannel" << std::endl;
}

void WebRtcManager::OnRenegotiationNeeded() {
    std::cout << "[WebRTC] OnRenegotiationNeeded" << std::endl;
}

void WebRtcManager::OnIceConnectionChange(webrtc::PeerConnectionInterface::IceConnectionState new_state) {
    std::cout << "[WebRTC] OnIceConnectionChange: " << new_state << std::endl;
}

void WebRtcManager::OnIceGatheringChange(webrtc::PeerConnectionInterface::IceGatheringState new_state) {
    std::cout << "[WebRTC] OnIceGatheringChange: " << new_state << std::endl;
}

void WebRtcManager::OnIceCandidate(const webrtc::IceCandidateInterface* candidate) {
    // 本地 ICE candidate 生成时调用
    std::string candidate_str;
    if (!candidate->ToString(&candidate_str)) {
        std::cerr << "[WebRTC] serialize ICE candidate failed" << std::endl;
        return;
    }

    if (!m_send_cb) return;

    json j;
    j["type"]            = "candidate";
    j["sdpMid"]          = candidate->sdp_mid();
    j["sdpMLineIndex"]   = candidate->sdp_mline_index();
    j["candidate"]       = candidate_str;

    m_send_cb(j.dump());
}

void WebRtcManager::OnIceCandidatesRemoved(const std::vector<cricket::Candidate>&) {
    // Demo 简化：不处理 candidate 移除
}

// ========== CreateSessionDescriptionObserver 接口实现 ==========

void WebRtcManager::OnSuccess(webrtc::SessionDescriptionInterface* desc) {
    // CreateOffer / CreateAnswer 成功后回调此处
    std::string type = desc->type();   // "offer" 或 "answer"
    std::string sdp  = sdp_to_string(desc);

    // 先设置本地描述
    m_peer_connection->SetLocalDescription(
        webrtc::SetSessionDescriptionObserver::Create(),
        desc
    );

    if (!m_send_cb) return;

    // 通过信令服务器发送给对端
    json j;
    j["type"] = type;
    j["sdp"]  = sdp;

    m_send_cb(j.dump());
}

void WebRtcManager::OnFailure(webrtc::RTCError error) {
    std::cerr << "[WebRTC] CreateSessionDescription failed: "
              << error.message() << std::endl;
}

std::string WebRtcManager::sdp_to_string(webrtc::SessionDescriptionInterface* desc) {
    std::string sdp;
    desc->ToString(&sdp);
    return sdp;
}

