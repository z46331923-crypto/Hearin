<template>
  <view class="test-page">
    <view>临时测试：提取第一条音轨，不保存到 Track 或 IndexedDB。</view>
    <button :disabled="busy" @click="selectVideo">选择视频并提取 M4A</button>
    <view>{{ status }}</view>
    <view v-if="fileName">视频：{{ fileName }}</view>
    <view v-if="result">
      <view>原视频大小：{{ formatSize(result.inputSize) }}</view>
      <view>提取音频大小：{{ formatSize(result.outputSize) }}</view>
      <view>提取耗时：{{ result.seconds.toFixed(2) }} 秒（不含引擎加载）</view>
      <button @click="playResult">播放提取音频</button>
      <button @click="audio.pause()">暂停</button>
    </view>
    <view v-if="errorMessage" class="error">{{ errorMessage }}</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onUnload } from '@dcloudio/uni-app'

const busy = ref(false)
const status = ref('请选择较小的视频先测试。原文件不会被修改。')
const fileName = ref('')
const result = ref(null)
const errorMessage = ref('')
const audio = new Audio()
let outputUrl = ''
let activeFFmpeg = null
let disposed = false
let picker = null

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB（${bytes.toLocaleString()} 字节）`
const clearResult = () => {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  if (outputUrl) URL.revokeObjectURL(outputUrl)
  outputUrl = ''
  result.value = null
}

const playResult = async () => {
  try {
    await audio.play()
  } catch (error) {
    if (disposed) return
    errorMessage.value = `播放提取音频失败：${error.message}`
    console.error('[音频提取 PoC] 播放失败', error)
  }
}
const handleAudioError = () => {
  errorMessage.value = `浏览器无法播放提取音频（媒体错误 ${audio.error?.code ?? '未知'}）。`
  console.error('[音频提取 PoC]', errorMessage.value)
}
audio.addEventListener('error', handleAudioError)

const extract = async (file) => {
  if (busy.value || disposed) return
  busy.value = true
  clearResult()
  errorMessage.value = ''
  fileName.value = file.name
  status.value = '正在加载 FFmpeg 引擎…'
  let ffmpeg
  let timer
  const logs = []
  const onLog = ({ message }) => {
    logs.push(message)
    if (logs.length > 20) logs.shift()
    console.log('[FFmpeg PoC]', message)
  }
  try {
    // 本地同源 ESM 文件保留 Worker 相对路径；不经过 Vite 的依赖预打包。
    const base = new URL('static/ffmpeg/', document.baseURI)
    const moduleURL = new URL('wrapper/index.js', base).href
    const { FFmpeg } = await import(/* @vite-ignore */ moduleURL)
    if (disposed) return
    ffmpeg = new FFmpeg()
    activeFFmpeg = ffmpeg
    ffmpeg.on('log', onLog)
    timer = setTimeout(() => ffmpeg.terminate(), 60000)
    await ffmpeg.load({
      coreURL: new URL('core/ffmpeg-core.js', base).href,
      wasmURL: new URL('core/ffmpeg-core.wasm', base).href
    })
    clearTimeout(timer)
    if (disposed) return
    status.value = '正在复制音轨到 M4A…'
    const start = performance.now()
    const data = new Uint8Array(await file.arrayBuffer())
    if (disposed) return
    await ffmpeg.writeFile('input', data)
    const args = ['-i', 'input', '-map', '0:a:0', '-vn', '-c:a', 'copy', '-movflags', '+faststart', 'output.m4a']
    const code = await ffmpeg.exec(args, 120000)
    if (code !== 0) throw new Error(`FFmpeg 退出码 ${code}。视频可能没有音轨、音频编码不兼容 M4A，或处理超时；本测试不会自动转码。`)
    const output = await ffmpeg.readFile('output.m4a')
    if (disposed) return
    if (!(output instanceof Uint8Array) || !output.byteLength) throw new Error('提取结果为空')
    const blob = new Blob([output], { type: 'audio/mp4' })
    outputUrl = URL.createObjectURL(blob)
    audio.src = outputUrl
    result.value = { inputSize: file.size, outputSize: blob.size, seconds: (performance.now() - start) / 1000 }
    status.value = '提取成功，请点击播放验证声音。'
  } catch (error) {
    if (!disposed) {
      clearResult()
      status.value = '提取失败，原文件和正式曲库未修改。'
      errorMessage.value = `${error.message || String(error)}\n${logs.slice(-8).join('\n')}`
      console.error('[音频提取 PoC] 提取失败（请确认 npm install 已完成；引擎加载超过 60 秒会终止）', error, logs)
    }
  } finally {
    clearTimeout(timer)
    if (ffmpeg) {
      if (!disposed && ffmpeg.loaded) {
        for (const path of ['input', 'output.m4a']) {
          try { await ffmpeg.deleteFile(path) } catch (error) { console.debug('[FFmpeg PoC] 临时文件不存在或已清理', path, error) }
        }
      }
      ffmpeg.off('log', onLog)
      ffmpeg.terminate()
    }
    activeFFmpeg = null
    busy.value = false
  }
}

const selectVideo = () => {
  if (busy.value) return
  if (picker) picker.onchange = null
  picker = document.createElement('input')
  picker.type = 'file'
  picker.accept = 'video/*'
  picker.onchange = (event) => {
    const file = event.target.files?.[0]
    picker.onchange = null
    picker = null
    if (file) extract(file)
  }
  picker.click()
}

onUnload(() => {
  disposed = true
  if (picker) picker.onchange = null
  picker = null
  activeFFmpeg?.terminate()
  clearResult()
  audio.removeEventListener('error', handleAudioError)
})
</script>

<style scoped>
.test-page { padding: 20px; }
.test-page > view, .test-page button { margin-bottom: 12px; }
.error { color: #b42318; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
