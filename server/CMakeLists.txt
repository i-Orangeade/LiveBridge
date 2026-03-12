cmake_minimum_required(VERSION 3.20)

project(webrtc_signaling_server CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(signaling_server
    main.cpp
)

# 使用 vcpkg 安装的 websocketpp
find_package(websocketpp CONFIG REQUIRED)
find_package(Threads REQUIRED)

target_link_libraries(signaling_server
    PRIVATE
        websocketpp::websocketpp
        Threads::Threads
)

