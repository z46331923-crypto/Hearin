const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
// HBuilderX 直接提供 static 文件，避免 Vite 预打包改变 Worker 的相对路径。
for (const [name, target] of [['ffmpeg', 'wrapper'], ['core', 'core']]) {
  const source = path.join(root, 'node_modules', '@ffmpeg', name, 'dist', 'esm')
  const destination = path.join(root, 'static', 'ffmpeg', target)
  fs.mkdirSync(destination, { recursive: true })
  for (const file of fs.readdirSync(source)) {
    if (/\.(js|wasm)$/.test(file)) fs.copyFileSync(path.join(source, file), path.join(destination, file))
  }
}
console.log('FFmpeg ESM wrapper, worker and single-thread core prepared in static/ffmpeg')
