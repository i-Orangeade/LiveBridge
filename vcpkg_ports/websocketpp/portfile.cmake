vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO zaphoyd/websocketpp
    REF 0.8.2
    # 注意：vcpkg_from_github 默认下载的是 tar.gz（不是 zip），因此这里使用 tar.gz 的 SHA512
    SHA512 b2afc63edb69ce81a3a6c06b3d857b3e8820f0e22300ac32bb20ab30ff07bd58bd5ada3e526ed8ab52de934e0e3a26cad2118b0e68ecf3e5e9e8d7101348fd06
    HEAD_REF master
)

# websocketpp 是 header-only：直接安装 include/
file(INSTALL "${SOURCE_PATH}/websocketpp" DESTINATION "${CURRENT_PACKAGES_DIR}/include")

# 许可证
file(INSTALL "${SOURCE_PATH}/COPYING" DESTINATION "${CURRENT_PACKAGES_DIR}/share/${PORT}" RENAME copyright)

