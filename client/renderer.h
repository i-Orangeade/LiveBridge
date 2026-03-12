// client/renderer.h
// 说明：
//   基于 SDL2 的视频渲染器，实现 WebRTC 的 VideoSink 接口，
//   用于接收 I420 视频帧并在窗口中显示。
//
//   此类主要职责：
//     - 创建 SDL 窗口和渲染器；
//     - 在 OnFrame 中接收 I420 帧，拷贝到内部缓冲区；
//     - 在 render()（主线程调用）时，把缓冲区内容更新到纹理并显示。

#pragma once

#include <SDL.h>

#include "api/video/video_frame.h"
#include "api/video/video_sink_interface.h"

#include <mutex>
#include <vector>

class SdlVideoRenderer : public rtc::VideoSinkInterface<webrtc::VideoFrame> {
public:
    // is_local = true 表示本地预览窗口；false 表示远端视频窗口
    SdlVideoRenderer(const char* window_title, bool is_local);
    ~SdlVideoRenderer() override;

    // WebRTC 视频帧回调（在 WebRTC 的视频线程中被调用）
    void OnFrame(const webrtc::VideoFrame& frame) override;

    // 在主线程调用，实际执行 SDL 渲染
    void render();

    // 是否初始化成功（窗口/渲染器/纹理创建是否成功）
    bool initialized() const { return m_initialized; }

private:
    bool          m_initialized{false};
    bool          m_is_local{false};

    SDL_Window*   m_window{nullptr};
    SDL_Renderer* m_renderer{nullptr};
    SDL_Texture*  m_texture{nullptr};

    int m_width{640};
    int m_height{480};

    // 存储最新一帧的 YUV(I420) 数据
    std::vector<uint8_t> m_buffer_y;
    std::vector<uint8_t> m_buffer_u;
    std::vector<uint8_t> m_buffer_v;

    std::mutex    m_frame_mutex;
    bool          m_new_frame{false};
};

