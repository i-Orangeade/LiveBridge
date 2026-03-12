cmake_minimum_required(VERSION 3.20)

project(webrtc_client CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(webrtc_client
    main.cpp
    signaling_client.cpp
    webrtc_manager.cpp
    renderer.cpp
)

# ========== 编译选项 ==========
if (MSVC)
    target_compile_options(webrtc_client PRIVATE /W4 /permissive-)
    target_compile_definitions(webrtc_client PRIVATE
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
        WIN32_LEAN_AND_MEAN
    )
endif()

# ========== WebSocket++（用于信令客户端） ==========
find_package(websocketpp CONFIG REQUIRED)
find_package(Threads REQUIRED)

target_link_libraries(webrtc_client
    PRIVATE
        websocketpp::websocketpp
        Threads::Threads
)

# ========== SDL2（用于视频渲染） ==========
find_package(SDL2 CONFIG REQUIRED)

# vcpkg 下 SDL2 通常提供 SDL2::SDL2 和 SDL2::SDL2main
target_link_libraries(webrtc_client
    PRIVATE
        SDL2::SDL2
        SDL2::SDL2main
)

# ========== nlohmann-json（用于解析/构造信令 JSON） ==========
find_package(nlohmann_json CONFIG REQUIRED)

target_link_libraries(webrtc_client
    PRIVATE
        nlohmann_json::nlohmann_json
)

# ========== WebRTC（使用本地预编译 webrtc.lib） ==========
# 说明：
#   vcpkg 官方目前没有独立 webrtc 端口，这里建议你自行编译 WebRTC，
#   并整理成如下目录结构：
#     C:/3rdparty/webrtc/
#       include/    # 拷贝 webrtc 源码树中所有需要的头文件
#       lib/
#         webrtc.lib
#
#   WEBRTC_ROOT 可以在 cmake 配置时通过 -DWEBRTC_ROOT=... 进行覆盖。

set(WEBRTC_ROOT "C:/3rdparty/webrtc" CACHE PATH "Path to prebuilt WebRTC")
set(WEBRTC_INCLUDE_DIR "${WEBRTC_ROOT}/include")
set(WEBRTC_LIB_DIR     "${WEBRTC_ROOT}/lib")

add_library(webrtc::webrtc STATIC IMPORTED GLOBAL)

set_target_properties(webrtc::webrtc PROPERTIES
    IMPORTED_LOCATION             "${WEBRTC_LIB_DIR}/webrtc.lib"
    INTERFACE_INCLUDE_DIRECTORIES "${WEBRTC_INCLUDE_DIR}"
)

target_link_libraries(webrtc_client
    PRIVATE
        webrtc::webrtc
)

if (WIN32)
    # Windows 下 WebRTC 常见依赖系统库
    target_link_libraries(webrtc_client
        PRIVATE
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
    )
endif()

