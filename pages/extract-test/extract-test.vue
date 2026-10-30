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
import { extractAudio } from '../../services/audioExtraction.js'

const busy = ref(false)
const status = ref('请选择较小的视频先测试。原文件不会被修改。')
const fileName = ref('')
const result = ref(null)
const errorMessage = ref('')
const audio = new Audio()
let outputUrl = ''
let extractionController = null
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
  extractionController = new AbortController()
  try {
    const extraction = await extractAudio(file, {
      signal: extractionController.signal,
      onLog: (message) => console.log('[FFmpeg PoC]', message),
      onStatus: (phase) => {
        if (phase === 'extracting') status.value = '正在复制音轨到 M4A…'
      }
    })
    if (disposed) return
    outputUrl = URL.createObjectURL(extraction.blob)
    audio.src = outputUrl
    result.value = extraction
    status.value = '提取成功，请点击播放验证声音。'
  } catch (error) {
    if (!disposed && error.name !== 'AbortError') {
      clearResult()
      status.value = '提取失败，原文件和正式曲库未修改。'
      errorMessage.value = error.message || String(error)
      console.error('[音频提取 PoC] 提取失败', error)
    }
  } finally {
    extractionController = null
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
  extractionController?.abort()
  clearResult()
  audio.removeEventListener('error', handleAudioError)
})
</script>

<style scoped>
.test-page { padding: 20px; }
.test-page > view, .test-page button { margin-bottom: 12px; }
.error { color: #b42318; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
