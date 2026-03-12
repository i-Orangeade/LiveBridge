cmake_minimum_required(VERSION 3.20)

project(webrtc_demo CXX)

# 使用 C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 如果你使用 vcpkg，请在配置时指定工具链文件，例如：
#   cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE=c:/vcpkg/scripts/buildsystems/vcpkg.cmake -A x64
# 这里不写死路径，方便你自行调整

# 添加子目录：信令服务器和 Native 客户端
add_subdirectory(server)
add_subdirectory(client)

