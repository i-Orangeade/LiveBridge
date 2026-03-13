cmake_minimum_required(VERSION 3.20)

project(webrtc_client CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(ENABLE_WEBRTC_CLIENT "Build WebRTC client (requires libwebrtc/webrtc.lib)" OFF)

# ========== 编译选项 ==========
if (MSVC)
    add_compile_options(/W4 /permissive-)
    # 让 MSVC 以 UTF-8 解析源文件，避免中文注释导致 C4819
    add_compile_options(/utf-8)
    add_compile_definitions(
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
        WIN32_LEAN_AND_MEAN
    )
endif()

# ========== SDL2（用于视频渲染/预览） ==========
find_package(SDL2 CONFIG REQUIRED)

# ========== camera_preview：纯原生摄像头预览（不依赖 webrtc.lib） ==========
add_executable(camera_preview
    camera_preview.cpp
)

target_link_libraries(camera_preview PRIVATE
    SDL2::SDL2
    SDL2::SDL2main
)

if (WIN32)
    target_link_libraries(camera_preview PRIVATE
        mf
        mfplat
        mfreadwrite
        mfuuid
        shlwapi
        ole32
        oleaut32
    )
endif()

# ========== webrtc_client：真正的 WebRTC 客户端（可选构建） ==========
if (ENABLE_WEBRTC_CLIENT)
    add_executable(webrtc_client
        main.cpp
        signaling_client.cpp
        webrtc_manager.cpp
        renderer.cpp
    )

    # WebSocket++（用于信令客户端）
    find_path(WEBSOCKETPP_INCLUDE_DIR "websocketpp/client.hpp" REQUIRED)
    find_package(Threads REQUIRED)
    target_include_directories(webrtc_client PRIVATE "${WEBSOCKETPP_INCLUDE_DIR}")
    target_link_libraries(webrtc_client PRIVATE Threads::Threads)
    target_compile_definitions(webrtc_client PRIVATE ASIO_STANDALONE)

    # SDL2（用于视频渲染）
    target_link_libraries(webrtc_client PRIVATE SDL2::SDL2 SDL2::SDL2main)

    # nlohmann-json（用于信令 JSON）
    find_package(nlohmann_json CONFIG REQUIRED)
    target_link_libraries(webrtc_client PRIVATE nlohmann_json::nlohmann_json)

    # WebRTC（使用本地预编译 webrtc.lib）
    set(WEBRTC_ROOT "C:/3rdparty/webrtc" CACHE PATH "Path to prebuilt WebRTC")
    set(WEBRTC_INCLUDE_DIR "${WEBRTC_ROOT}/include")
    set(WEBRTC_LIB_DIR     "${WEBRTC_ROOT}/lib")

    if (NOT EXISTS "${WEBRTC_INCLUDE_DIR}")
        message(FATAL_ERROR
            "未找到 WebRTC 头文件目录：${WEBRTC_INCLUDE_DIR}\n"
            "你当前选择构建 ENABLE_WEBRTC_CLIENT=ON，因此必须提供 libwebrtc。\n"
            "请在配置时指定正确路径，例如：\n"
            "  cmake --preset x64-debug-vcpkg -DENABLE_WEBRTC_CLIENT=ON -DWEBRTC_ROOT=D:/3rdparty/webrtc\n"
            "并确保：<WEBRTC_ROOT>/include 与 <WEBRTC_ROOT>/lib/webrtc.lib 存在。"
        )
    endif()

    if (NOT EXISTS "${WEBRTC_LIB_DIR}/webrtc.lib")
        message(FATAL_ERROR
            "未找到 WebRTC 静态库：${WEBRTC_LIB_DIR}/webrtc.lib\n"
            "请确认你已生成 monolithic webrtc.lib，并放到该路径。"
        )
    endif()

    add_library(webrtc::webrtc STATIC IMPORTED GLOBAL)
    set_target_properties(webrtc::webrtc PROPERTIES
        IMPORTED_LOCATION             "${WEBRTC_LIB_DIR}/webrtc.lib"
        INTERFACE_INCLUDE_DIRECTORIES "${WEBRTC_INCLUDE_DIR}"
    )
    target_link_libraries(webrtc_client PRIVATE webrtc::webrtc)

    if (WIN32)
        target_link_libraries(webrtc_client PRIVATE
            winmm
            ws2_32
            secur32
            iphlpapi
            crypt32
            dmoguids
            wmcodecdspuuid
            amstrmid
            msdmo
            strmiids
            mf
            mfplat
            mfreadwrite
            mfuuid
            shlwapi
            ole32
            oleaut32
        )

        # 确保 Windows SDK 版本支持 MF（至少 10.0.17763.0）
        set(CMAKE_SYSTEM_VERSION 10.0 CACHE STRING "" FORCE)
    endif()
endif()

