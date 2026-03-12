// client/webrtc_manager.h
// 说明：
//   封装 libwebrtc 的初始化、PeerConnection 创建、SDP/ICE 处理逻辑。
//   关键点：
//     - 创建 PeerConnectionFactory（含网络/工作/信令线程）
//     - 配置 STUN 服务器：stun:stun.l.google.com:19302
//     - 创建本地音频 Track 并添加到 PeerConnection
//     - 提供 create_offer / handle_remote_sdp / handle_remote_ice 等接口
//     - 在 OnIceCandidate 中把本地 candidate 通过信令发送出去
//
//   注意：
//     - 本示例未完整实现摄像头采集，仅保留接口位置，你可按实际平台补充。

#pragma once

#include <string>
#include <memory>
#include <functional>
#include <vector>

#include "api/peer_connection_interface.h"
#include "api/create_peerconnection_factory.h"
#include "api/audio_codecs/builtin_audio_encoder_factory.h"
#include "api/audio_codecs/builtin_audio_decoder_factory.h"
#include "api/video_codecs/builtin_video_encoder_factory.h"
#include "api/video_codecs/builtin_video_decoder_factory.h"
#include "api/media_stream_interface.h"

#include "rtc_base/thread.h"
#include "rtc_base/ssl_adapter.h"
#include "rtc_base/logging.h"

#ifdef _WIN32
#include "rtc_base/win/win32_socket_init.h"
#endif

#include "renderer.h"

class WebRtcManager : public webrtc::PeerConnectionObserver,
                      public webrtc::CreateSessionDescriptionObserver {
public:
    using SignalingSendCallback = std::function<void(const std::string&)>;

    WebRtcManager(SdlVideoRenderer* local_renderer,
                  SdlVideoRenderer* remote_renderer);
    ~WebRtcManager() override;

    // 初始化 WebRTC（线程 + 工厂 + PeerConnection）
    bool initialize(SignalingSendCallback send_cb);

    // 作为主叫方：创建 offer 并通过信令发送
    void create_offer();

    // 处理远端 SDP（offer / answer）
    void handle_remote_sdp(const std::string& type, const std::string& sdp);

    // 处理远端 ICE candidate
    void handle_remote_ice(const std::string& sdp_mid,
                           int sdp_mline_index,
                           const std::string& candidate);

    // ========== PeerConnectionObserver 接口 ==========
    void OnSignalingChange(webrtc::PeerConnectionInterface::SignalingState new_state) override;
    void OnAddStream(rtc::scoped_refptr<webrtc::MediaStreamInterface> stream) override;
    void OnRemoveStream(rtc::scoped_refptr<webrtc::MediaStreamInterface> stream) override;
    void OnDataChannel(rtc::scoped_refptr<webrtc::DataChannelInterface> channel) override;
    void OnRenegotiationNeeded() override;
    void OnIceConnectionChange(webrtc::PeerConnectionInterface::IceConnectionState new_state) override;
    void OnIceGatheringChange(webrtc::PeerConnectionInterface::IceGatheringState new_state) override;
    void OnIceCandidate(const webrtc::IceCandidateInterface* candidate) override;
    void OnIceCandidatesRemoved(const std::vector<cricket::Candidate>& candidates) override;

    // ========== CreateSessionDescriptionObserver 接口 ==========
    void OnSuccess(webrtc::SessionDescriptionInterface* desc) override;
    void OnFailure(webrtc::RTCError error) override;

private:
    bool create_peer_connection();
    std::string sdp_to_string(webrtc::SessionDescriptionInterface* desc);

private:
    // WebRTC 线程
    std::unique_ptr<rtc::Thread> m_network_thread;
    std::unique_ptr<rtc::Thread> m_worker_thread;
    std::unique_ptr<rtc::Thread> m_signaling_thread;

    // 工厂 & PeerConnection
    rtc::scoped_refptr<webrtc::PeerConnectionFactoryInterface> m_factory;
    rtc::scoped_refptr<webrtc::PeerConnectionInterface>        m_peer_connection;

    // 媒体 Track
    rtc::scoped_refptr<webrtc::AudioTrackInterface> m_audio_track;
    rtc::scoped_refptr<webrtc::VideoTrackInterface> m_video_track;

    // 渲染器（本地/远端）
    SdlVideoRenderer* m_local_renderer{nullptr};
    SdlVideoRenderer* m_remote_renderer{nullptr};

    // 用于发送信令的回调
    SignalingSendCallback m_send_cb;
};

