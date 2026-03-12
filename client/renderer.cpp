// client/renderer.cpp

#include "renderer.h"

#include <iostream>

SdlVideoRenderer::SdlVideoRenderer(const char* window_title, bool is_local)
    : m_is_local(is_local) {
    // 创建窗口
    m_window = SDL_CreateWindow(
        window_title,
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        m_width, m_height,
        SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE
    );

    if (!m_window) {
        std::cerr << "[Renderer] SDL_CreateWindow failed: " << SDL_GetError() << std::endl;
        return;
    }

    // 创建渲染器
    m_renderer = SDL_CreateRenderer(
        m_window,
        -1,
        SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC
    );
    if (!m_renderer) {
        std::cerr << "[Renderer] SDL_CreateRenderer failed: " << SDL_GetError() << std::endl;
        return;
    }

    // 创建 YUV(I420) 纹理
    m_texture = SDL_CreateTexture(
        m_renderer,
        SDL_PIXELFORMAT_IYUV,
        SDL_TEXTUREACCESS_STREAMING,
        m_width, m_height
    );
    if (!m_texture) {
        std::cerr << "[Renderer] SDL_CreateTexture failed: " << SDL_GetError() << std::endl;
        return;
    }

    // 分配缓冲区（默认分辨率）
    m_buffer_y.resize(m_width * m_height);
    m_buffer_u.resize(m_width * m_height / 4);
    m_buffer_v.resize(m_width * m_height / 4);

    m_initialized = true;
}

SdlVideoRenderer::~SdlVideoRenderer() {
    if (m_texture) {
        SDL_DestroyTexture(m_texture);
    }
    if (m_renderer) {
        SDL_DestroyRenderer(m_renderer);
    }
    if (m_window) {
        SDL_DestroyWindow(m_window);
    }
}

void SdlVideoRenderer::OnFrame(const webrtc::VideoFrame& frame) {
    // 注意：此函数在 WebRTC 的视频线程中调用，不要做耗时操作
    const webrtc::VideoFrameBuffer* buffer = frame.video_frame_buffer().get();
    rtc::scoped_refptr<const webrtc::I420BufferInterface> i420 = buffer->ToI420();

    int w = i420->width();
    int h = i420->height();

    {
        std::lock_guard<std::mutex> lock(m_frame_mutex);

        // 本 Demo 简化处理：如果分辨率变化，只提示，不动态重建纹理
        if (w != m_width || h != m_height) {
            std::cerr << "[Renderer] resolution changed, demo not reallocate texture" << std::endl;
        }

        // 拷贝 Y 平面
        int y_stride = i420->StrideY();
        for (int y = 0; y < h; ++y) {
            memcpy(m_buffer_y.data() + y * m_width,
                   i420->DataY() + y * y_stride,
                   m_width);
        }

        // 拷贝 U/V 平面
        int uw = w / 2;
        int uh = h / 2;
        int u_stride = i420->StrideU();
        int v_stride = i420->StrideV();

        for (int y = 0; y < uh; ++y) {
            memcpy(m_buffer_u.data() + y * uw,
                   i420->DataU() + y * u_stride,
                   uw);
            memcpy(m_buffer_v.data() + y * uw,
                   i420->DataV() + y * v_stride,
                   uw);
        }

        m_new_frame = true;
    }
}

void SdlVideoRenderer::render() {
    if (!m_initialized) {
        return;
    }

    bool has_new_frame = false;
    {
        std::lock_guard<std::mutex> lock(m_frame_mutex);
        has_new_frame = m_new_frame;
        m_new_frame = false;
    }

    if (!has_new_frame) {
        // 没有新帧也可以选择照样渲染，这里为节省资源直接返回
        return;
    }

    // 更新纹理的 YUV 数据
    SDL_UpdateYUVTexture(
        m_texture,
        nullptr,
        m_buffer_y.data(), m_width,
        m_buffer_u.data(), m_width / 2,
        m_buffer_v.data(), m_width / 2
    );

    SDL_RenderClear(m_renderer);
    SDL_RenderCopy(m_renderer, m_texture, nullptr, nullptr);
    SDL_RenderPresent(m_renderer);
}

