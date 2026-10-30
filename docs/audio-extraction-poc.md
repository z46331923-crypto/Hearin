# 音频提取 PoC（仅 H5）

先运行 `npm install`，自动将锁定版本的 ESM wrapper、Worker 和单线程 core 复制到 `static/ffmpeg/`。已安装依赖时可运行 `npm run prepare:ffmpeg` 重建静态文件。该目录由脚本生成，不提交 Git。然后停止并重新运行 HBuilderX H5，使新增页面路由生效。

- `@ffmpeg/ffmpeg`: 0.12.15
- `@ffmpeg/core`: 0.12.10（单线程，无需为此修改 COOP/COEP）
- 静态资源本地同源加载，不使用运行时 CDN。
- 当前默认 H5 根路径/hash 路由；若以后修改部署 base，应重新检查静态资源 URL。

PoC 页面仍保留在 `pages/extract-test/extract-test`，首页入口已隐藏。选择视频后执行：

```text
ffmpeg -nostdin -y -i input -map 0:a:0 -vn -c:a copy -movflags +faststart output.m4a
```

`-nostdin -y` 由 ffmpeg.wasm 自动添加。复制第一条音轨，不重编码、不自动回退 AAC 转码。无音轨、损坏文件、M4A 不支持的编码会报错。优先用较小的 MP4/AAC 视频验证。

提取逻辑位于 `services/audioExtraction.js`，PoC 与正式导入共用。显示原文件字节数、输出字节数和提取耗时。计时包括输入文件读取、写入 WASM 文件系统、执行和读回输出，不含首次引擎加载。PoC 播放结果使用独立临时 Audio，不写入 Track 或 IndexedDB。

每次任务结束删除 WASM 输入/输出文件并 terminate Worker；离开页面中断任务。重新提取/离开页面释放试听 Object URL。引擎加载上限 60 秒，FFmpeg 执行上限 120 秒。大文件受浏览器内存和 WASM 限制；先用小文件测试。

手动验收：正常 MP4/AAC 提取和试听；无音轨或损坏文件报错；失败后重新选文件；连续提取两次；提取中返回；试听中返回；最后确认原曲库、删除重命名和正式播放器不受影响。

## V0.2-A 正式集成

正式导入逐个处理视频：先读取时长，再尝试 Stream Copy 提取 M4A，最后才开启 IndexedDB 事务。同一事务保存 Track、原视频及提取成功的音频。`mediaId` 始终指向原视频，`audioMediaId` 仅在提取成功时存在；播放器使用 `audioMediaId || mediaId`，所以新 Track 默认播放音频，旧 Track 和提取失败的 Track 继续播放原视频音轨。删除 Track 时同时删除关联的音视频记录。
