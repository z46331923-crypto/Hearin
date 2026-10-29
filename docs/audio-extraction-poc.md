# 音频提取 PoC（仅 H5）

先运行 `npm install`，自动将锁定版本的 ESM wrapper、Worker 和单线程 core 复制到 `static/ffmpeg/`。已安装依赖时可运行 `npm run prepare:ffmpeg` 重建静态文件。该目录由脚本生成，不提交 Git。然后停止并重新运行 HBuilderX H5，使新增页面路由生效。

- `@ffmpeg/ffmpeg`: 0.12.15
- `@ffmpeg/core`: 0.12.10（单线程，无需为此修改 COOP/COEP）
- 静态资源本地同源加载，不使用运行时 CDN。
- 当前默认 H5 根路径/hash 路由；若以后修改部署 base，应重新检查静态资源 URL。

首页“测试音频提取（PoC）”进入独立临时页。选择视频后执行：

```text
ffmpeg -nostdin -y -i input -map 0:a:0 -vn -c:a copy -movflags +faststart output.m4a
```

`-nostdin -y` 由 ffmpeg.wasm 自动添加。复制第一条音轨，不重编码、不自动回退 AAC 转码。无音轨、损坏文件、M4A 不支持的编码会报错。优先用较小的 MP4/AAC 视频验证。

显示原文件字节数、输出字节数和提取耗时。计时包括输入文件读取、写入 WASM 文件系统、执行和读回输出，不含首次引擎加载。播放结果是单独的临时 Audio，与正式播放器无关；输出不保存至 Track 或 IndexedDB。

每次任务结束删除 WASM 输入/输出文件并 terminate Worker；离开页面中断任务。重新提取/离开页面释放试听 Object URL。引擎加载上限 60 秒，FFmpeg 执行上限 120 秒。大文件受浏览器内存和 WASM 限制；先用小文件测试。

手动验收：正常 MP4/AAC 提取和试听；无音轨或损坏文件报错；失败后重新选文件；连续提取两次；提取中返回；试听中返回；最后确认原曲库、删除重命名和正式播放器不受影响。
