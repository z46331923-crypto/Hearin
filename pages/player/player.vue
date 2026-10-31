<template>
  <view class="player-page">
    <view class="media-area">
      <component
        :is="'video'"
        ref="mediaElementRef"
        v-show="mediaMode === 'video'"
        class="video-element"
        playsinline
        webkit-playsinline
        preload="metadata"
        :controls="false"
      ></component>
      <view v-show="mediaMode === 'audio'" class="track-title">
        {{ currentTrack ? currentTrack.title : '请返回列表选择视频' }}
      </view>
    </view>

    <button
      class="media-mode-button"
      :disabled="!currentTrack || isSwitchingMedia"
      @click="toggleMediaMode"
    >
      {{ mediaMode === 'audio' ? '查看视频' : '返回音频' }}
    </button>

    <view class="player-controls">
      <view class="progress-row">
        <text>{{ formatTime(currentTime) }}</text>
        <slider
          class="progress-slider"
          :min="0"
          :max="1000"
          :step="1"
          :value="seekPreview ?? (duration > 0 ? Math.round(currentTime / duration * 1000) : 0)"
          :disabled="!currentTrack || isSwitchingMedia || duration <= 0"
          :block-size="16"
          aria-label="播放进度"
          @changing="previewSeek"
          @change="seek"
        />
        <text>{{ formatTime(duration) }}</text>
      </view>
      <view class="playback-buttons">
      <button class="skip-button" :title="modeLabel" :aria-label="`当前模式：${modeLabel}，点击切换`" @click="cycleMode">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g v-if="playMode === 'sequence'">
            <path d="M4 5h10M4 12h10M4 19h6M19 5v14m-3-3 3 3 3-3" />
          </g>
          <g v-else-if="playMode === 'random'">
            <path d="M3 5h3c4 0 8 14 12 14h3m-3-3 3 3-3 3M3 19h3c1.5 0 3-2 4.5-4.5M14 9c1.5-2.5 2.5-4 4-4h3m-3-3 3 3-3 3" />
          </g>
          <g v-else>
            <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" />
            <path v-if="playMode === 'single'" d="m10 11 2-1v5m-2 0h4" />
          </g>
        </svg>
      </button>
      <button class="skip-button" :disabled="!canPrevious" aria-label="上一首" @click="previousTrack">
        <view class="skip-icon previous-icon" aria-hidden="true">
          <view class="skip-triangle"></view>
          <view class="skip-bar"></view>
        </view>
      </button>
      <button
        class="play-button"
        :disabled="!currentTrack || isSwitchingMedia"
        :aria-label="isPlaying ? '暂停' : '播放'"
        @click="togglePlayback"
      >
        <view v-if="isPlaying" class="pause-icon" aria-hidden="true">
          <view></view>
          <view></view>
        </view>
        <view v-else class="play-icon" aria-hidden="true"></view>
      </button>
      <button class="skip-button" :disabled="!canNext" aria-label="下一首" @click="nextTrack">
        <view class="skip-icon" aria-hidden="true">
          <view class="skip-triangle"></view>
          <view class="skip-bar"></view>
        </view>
      </button>
      <view class="more-controls">
        <view v-if="showMore" class="more-backdrop" @click="showMore = false"></view>
        <view v-if="showMore" id="player-more-panel" class="more-panel">
          <view class="speed-option">
            <button class="speed-button" :disabled="isSwitchingMedia" :aria-label="`倍速播放 ${speedLabel}，点击切换`" @click="cycleSpeed">
              {{ speedLabel }}
            </button>
            <text class="speed-caption">倍速播放</text>
          </view>
        </view>
        <button
          class="more-button"
          aria-label="更多播放功能"
          :aria-expanded="showMore"
          aria-controls="player-more-panel"
          @click="showMore = !showMore"
          @keydown.esc="showMore = false"
        >
          <view class="more-dots" aria-hidden="true"><view></view><view></view><view></view></view>
        </button>
      </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance, onMounted } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import { getMedia } from '../../services/trackStorage.js'

const tracks = ref([])
const currentIndex = ref(-1)
// 当前 Track 由队列和索引推导，不再单独赋值。
const currentTrack = computed(() => tracks.value[currentIndex.value] ?? null)
const modes = ['sequence', 'single', 'list', 'random']
const modeLabels = { sequence: '顺序播放', single: '单曲循环', list: '列表循环', random: '随机播放' }
const playMode = ref('sequence')
const modeLabel = computed(() => modeLabels[playMode.value])
const wrapsQueue = computed(() => playMode.value === 'list' || playMode.value === 'random')
const canPrevious = computed(() => !!currentTrack.value && (wrapsQueue.value || currentIndex.value > 0))
const canNext = computed(() => !!currentTrack.value && (wrapsQueue.value || currentIndex.value < tracks.value.length - 1))

const cycleMode = () => {
  playMode.value = modes[(modes.indexOf(playMode.value) + 1) % modes.length]
}
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
// 拖动期间只预览滑块位置，避免播放事件把滑块拉回去；松手才跳转。
const seekPreview = ref(null)
const mediaElementRef = ref(null)
const mediaMode = ref('audio')
const isSwitchingMedia = ref(false)
let mediaElement = null
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2]
const playbackRate = ref(1)
const showMore = ref(false)
const speedLabel = computed(() => `${Number.isInteger(playbackRate.value) ? playbackRate.value.toFixed(1) : playbackRate.value}x`)

const syncPlaybackRate = () => {
  if (mediaElement) playbackRate.value = mediaElement.playbackRate
}

const cycleSpeed = () => {
  if (isSwitchingMedia.value) return
  const currentRate = mediaElement?.playbackRate ?? playbackRate.value
  const nextRate = playbackRates[(playbackRates.indexOf(currentRate) + 1) % playbackRates.length]
  // 默认速度用于加载下一首，playbackRate 用于立即调整当前媒体。
  playbackRate.value = nextRate
  if (mediaElement) {
    mediaElement.defaultPlaybackRate = nextRate
    mediaElement.playbackRate = nextRate
    syncPlaybackRate()
  }
}

const objectUrls = new Map()
let loadedMediaId = ''
let mediaRequestId = 0
let cancelPendingMetadataWait = null
let eventChannel
const page = getCurrentInstance().proxy

const syncPlayingState = () => {
  isPlaying.value = !!mediaElement && !mediaElement.paused && !mediaElement.ended
}

const syncCurrentTime = () => {
  currentTime.value = mediaElement && Number.isFinite(mediaElement.currentTime)
    ? Math.max(0, mediaElement.currentTime)
    : 0
}

const syncDuration = () => {
  duration.value = mediaElement && Number.isFinite(mediaElement.duration) && mediaElement.duration > 0
    ? mediaElement.duration
    : 0
}

const formatTime = (seconds) => {
  const totalSeconds = Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds)) : 0
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

const previewSeek = (event) => {
  seekPreview.value = event.detail.value
}

const seek = (event) => {
  seekPreview.value = null
  const progress = Number(event.detail.value)
  if (!mediaElement || !currentTrack.value || isSwitchingMedia.value || duration.value <= 0 || !Number.isFinite(progress)) return

  try {
    // 0～1000 的滑块位置换算成秒，只调整现有媒体，不改变播放/暂停状态。
    mediaElement.currentTime = Math.min(1000, Math.max(0, progress)) / 1000 * duration.value
  } catch (error) {
    console.error('无法调整播放位置：', error)
  }
  // 从媒体元素读回实际位置；后续 timeupdate / seeked 会继续同步。
  syncCurrentTime()
}

const handleEnded = () => {
  // 忽略切歌后可能到达的旧结束事件。
  if (!mediaElement?.ended) return
  syncPlayingState()
  if (playMode.value === 'single') {
    restartTrack()
  } else {
    nextTrack()
  }
}

const beginMediaRequest = () => {
  mediaRequestId += 1
  cancelPendingMetadataWait?.()
  cancelPendingMetadataWait = null
  return mediaRequestId
}

const releaseObjectUrls = () => {
  for (const objectUrl of objectUrls.values()) URL.revokeObjectURL(objectUrl)
  objectUrls.clear()
}

const clearMedia = () => {
  // 切歌和卸载都使之前未完成的数据库读取失效。
  beginMediaRequest()
  if (mediaElement) {
    mediaElement.pause()
    mediaElement.removeAttribute('src')
    mediaElement.load()
  }
  releaseObjectUrls()
  loadedMediaId = ''
  currentIndex.value = -1
  mediaMode.value = 'audio'
  isSwitchingMedia.value = false
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  seekPreview.value = null
}

const getObjectUrl = async (mediaId, requestId) => {
  if (objectUrls.has(mediaId)) return objectUrls.get(mediaId)
  const storedMedia = await getMedia(mediaId)
  if (requestId !== mediaRequestId) return null
  const objectUrl = URL.createObjectURL(storedMedia.blob)
  objectUrls.set(mediaId, objectUrl)
  return objectUrl
}

const waitForMetadata = (objectUrl, requestId) => new Promise((resolve, reject) => {
  let settled = false
  let cancel
  const cleanup = () => {
    mediaElement?.removeEventListener('loadedmetadata', handleLoadedMetadata)
    mediaElement?.removeEventListener('error', handleError)
    if (cancelPendingMetadataWait === cancel) cancelPendingMetadataWait = null
  }
  const finish = (callback, value) => {
    if (settled) return
    settled = true
    cleanup()
    callback(value)
  }
  const handleLoadedMetadata = () => {
    if (requestId !== mediaRequestId) {
      finish(resolve, false)
      return
    }
    finish(resolve, true)
  }
  const handleError = () => {
    const code = mediaElement?.error?.code ?? '未知'
    finish(reject, new Error(`浏览器无法加载媒体（错误码 ${code}）`))
  }
  cancel = () => finish(resolve, false)
  cancelPendingMetadataWait?.()
  cancelPendingMetadataWait = cancel
  mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata)
  mediaElement.addEventListener('error', handleError)
  mediaElement.src = objectUrl
  mediaElement.load()
  if (mediaElement.readyState >= 1) queueMicrotask(handleLoadedMetadata)
})

const setMediaSource = async (mediaId, objectUrl, requestId) => {
  if (!mediaElement || requestId !== mediaRequestId) return false
  const loaded = await waitForMetadata(objectUrl, requestId)
  if (!loaded || requestId !== mediaRequestId) return false
  loadedMediaId = mediaId
  syncDuration()
  syncCurrentTime()
  return true
}

const resumePlayback = async (requestId = mediaRequestId) => {
  if (!mediaElement || !currentTrack.value || !loadedMediaId || requestId !== mediaRequestId) return
  const title = currentTrack.value.title
  const playingMediaId = loadedMediaId
  try {
    await mediaElement.play()
  } catch (error) {
    // 快速切歌、切换模式或离开页面会中断旧请求，不让旧请求影响新媒体。
    if (requestId !== mediaRequestId || playingMediaId !== loadedMediaId) return
    syncPlayingState()
    console.error(`无法播放 Track「${title}」：`, error)
  }
}

const restoreMediaState = async ({ time, wasPlaying, rate }, requestId) => {
  if (!mediaElement || requestId !== mediaRequestId) return false
  const restoredRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  mediaElement.defaultPlaybackRate = restoredRate
  mediaElement.playbackRate = restoredRate
  const maximumTime = Number.isFinite(mediaElement.duration) && mediaElement.duration > 0
    ? mediaElement.duration
    : Math.max(0, time)
  try {
    mediaElement.currentTime = Math.min(Math.max(0, time), maximumTime)
  } catch (error) {
    console.error('无法恢复媒体播放位置：', error)
  }
  syncPlaybackRate()
  syncDuration()
  syncCurrentTime()
  if (wasPlaying) await resumePlayback(requestId)
  else syncPlayingState()
  return requestId === mediaRequestId
}

const playAtIndex = async (index) => {
  if (!mediaElement || !Number.isInteger(index) || index < 0 || index >= tracks.value.length) return
  const track = tracks.value[index]
  const rate = playbackRate.value
  clearMedia()
  const requestId = mediaRequestId
  // 先记录选中的索引，快速连续切歌仍能从最新选择继续。
  currentIndex.value = index
  mediaMode.value = 'audio'
  isSwitchingMedia.value = true
  try {
    // V0.2 Track 默认播放提取音频；旧 Track 或提取失败时继续播放原视频音轨。
    const mediaId = track.audioMediaId || track.mediaId
    const objectUrl = await getObjectUrl(mediaId, requestId)
    if (!objectUrl || requestId !== mediaRequestId) return
    const loaded = await setMediaSource(mediaId, objectUrl, requestId)
    if (!loaded) return
    await restoreMediaState({ time: 0, wasPlaying: true, rate }, requestId)
  } catch (error) {
    if (requestId !== mediaRequestId) return
    clearMedia()
    currentIndex.value = index
    mediaMode.value = 'audio'
    // 保留选中项，允许用户继续切换到其他 Track。
    console.error(`无法加载 Track「${track.title}」：`, error)
  } finally {
    if (requestId === mediaRequestId) isSwitchingMedia.value = false
  }
}

const toggleMediaMode = async () => {
  if (!mediaElement || !currentTrack.value || isSwitchingMedia.value || !loadedMediaId) return
  const track = currentTrack.value
  const previousMode = mediaMode.value
  const targetMode = previousMode === 'audio' ? 'video' : 'audio'
  const previousMediaId = loadedMediaId
  const targetMediaId = targetMode === 'video' ? track.mediaId : (track.audioMediaId || track.mediaId)
  const savedState = {
    time: Number.isFinite(mediaElement.currentTime) ? mediaElement.currentTime : currentTime.value,
    wasPlaying: !mediaElement.paused && !mediaElement.ended,
    rate: mediaElement.playbackRate
  }
  const requestId = beginMediaRequest()

  // 旧 Track 和提取失败 Track 的两种模式都使用原视频，只切换画面显示。
  if (targetMediaId === previousMediaId) {
    mediaMode.value = targetMode
    return
  }

  const previousObjectUrl = objectUrls.get(previousMediaId)
  let sourceChanged = false
  mediaMode.value = targetMode
  isSwitchingMedia.value = true
  mediaElement.pause()
  try {
    const targetObjectUrl = await getObjectUrl(targetMediaId, requestId)
    if (!targetObjectUrl || requestId !== mediaRequestId) return
    sourceChanged = true
    const loaded = await setMediaSource(targetMediaId, targetObjectUrl, requestId)
    if (!loaded) return
    await restoreMediaState(savedState, requestId)
  } catch (error) {
    if (requestId !== mediaRequestId) return
    console.error(`无法切换到${targetMode === 'video' ? '视频' : '音频'}模式：`, error)
    mediaMode.value = previousMode
    try {
      if (sourceChanged && previousObjectUrl) {
        const restored = await setMediaSource(previousMediaId, previousObjectUrl, requestId)
        if (restored) await restoreMediaState(savedState, requestId)
      } else if (savedState.wasPlaying) {
        await resumePlayback(requestId)
      }
    } catch (restoreError) {
      if (requestId === mediaRequestId) console.error('恢复原播放媒体失败：', restoreError)
    }
  } finally {
    if (requestId === mediaRequestId) isSwitchingMedia.value = false
  }
}

// 重播同一首时保留媒体元素和 Object URL，只把播放位置归零。
const restartTrack = () => {
  if (!mediaElement || !currentTrack.value) return
  if (!loadedMediaId) {
    playAtIndex(currentIndex.value)
    return
  }
  mediaElement.currentTime = 0
  seekPreview.value = null
  syncCurrentTime()
  resumePlayback()
}

const moveTrack = (direction) => {
  if (!currentTrack.value) return
  const count = tracks.value.length
  let index = currentIndex.value + direction

  if (playMode.value === 'random') {
    // 从其余 Track 中随机选择，避免连续播放同一首；只有一首时重播。
    index = currentIndex.value
    if (count > 1) {
      index = Math.floor(Math.random() * (count - 1))
      if (index >= currentIndex.value) index += 1
    }
  } else if (playMode.value === 'list') {
    index = (index + count) % count
  }

  if (index < 0 || index >= count) return
  if (index === currentIndex.value) restartTrack()
  else playAtIndex(index)
}

const previousTrack = () => moveTrack(-1)
const nextTrack = () => moveTrack(1)

const openQueue = (data) => {
  clearMedia()
  tracks.value = data.tracks
  playAtIndex(data.currentIndex)
}

const togglePlayback = () => {
  if (!mediaElement || !currentTrack.value || isSwitchingMedia.value) return
  if (!loadedMediaId) {
    playAtIndex(currentIndex.value)
    return
  }
  if (mediaElement.paused || mediaElement.ended) {
    resumePlayback()
  } else {
    mediaElement.pause()
  }
}

const resolveNativeMediaElement = () => {
  const candidate = mediaElementRef.value
  if (typeof HTMLVideoElement !== 'undefined' && candidate instanceof HTMLVideoElement) return candidate
  const element = candidate?.$el ?? candidate
  if (typeof HTMLVideoElement !== 'undefined' && element instanceof HTMLVideoElement) return element
  return element?.querySelector?.('video') ?? null
}

const addMediaEventListeners = () => {
  mediaElement.addEventListener('play', syncPlayingState)
  mediaElement.addEventListener('pause', syncPlayingState)
  mediaElement.addEventListener('ended', handleEnded)
  mediaElement.addEventListener('loadedmetadata', syncDuration)
  mediaElement.addEventListener('durationchange', syncDuration)
  mediaElement.addEventListener('timeupdate', syncCurrentTime)
  mediaElement.addEventListener('seeked', syncCurrentTime)
  mediaElement.addEventListener('ratechange', syncPlaybackRate)
}

const removeMediaEventListeners = () => {
  if (!mediaElement) return
  mediaElement.removeEventListener('play', syncPlayingState)
  mediaElement.removeEventListener('pause', syncPlayingState)
  mediaElement.removeEventListener('ended', handleEnded)
  mediaElement.removeEventListener('loadedmetadata', syncDuration)
  mediaElement.removeEventListener('durationchange', syncDuration)
  mediaElement.removeEventListener('timeupdate', syncCurrentTime)
  mediaElement.removeEventListener('seeked', syncCurrentTime)
  mediaElement.removeEventListener('ratechange', syncPlaybackRate)
}

onMounted(() => {
  mediaElement = resolveNativeMediaElement()
  if (!mediaElement) {
    console.error('无法获取原生 HTMLVideoElement，播放器无法初始化。')
    return
  }
  mediaElement.playsInline = true
  mediaElement.setAttribute('playsinline', '')
  mediaElement.setAttribute('webkit-playsinline', '')
  mediaElement.defaultPlaybackRate = playbackRate.value
  addMediaEventListeners()
  // 页面通信只接收元数据，媒体由 playAtIndex 按需读取。
  eventChannel = page.getOpenerEventChannel()
  eventChannel.on('openQueue', openQueue)
})

onUnload(() => {
  eventChannel?.off('openQueue', openQueue)
  clearMedia()
  tracks.value = []
  removeMediaEventListeners()
  mediaElement = null
})
</script>

<style scoped>
.player-page {
  min-height: calc(100vh - 44px);
  box-sizing: border-box;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
}

.media-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.track-title {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow-wrap: anywhere;
}

.video-element {
  display: block;
  width: 100%;
  max-height: 60vh;
  background: #000;
  object-fit: contain;
}

.media-mode-button {
  margin: 16px auto 0;
}

.player-controls {
  padding: 32px 0;
  padding-bottom: calc(32px + env(safe-area-inset-bottom));
}

.play-button {
  width: 64px;
  height: 64px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.playback-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 2vw, 12px);
}

.playback-buttons button {
  margin: 0;
}

.more-controls {
  position: relative;
  width: 48px;
  flex-shrink: 0;
}

.more-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}

.more-panel {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  z-index: 11;
  width: 160px;
  padding: 20px 16px;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.speed-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.speed-button {
  width: 72px;
  height: 48px;
  line-height: 48px;
  padding: 0;
  font-size: 22px;
  font-weight: 600;
}

.speed-caption {
  font-size: 12px;
  color: #666;
}

.more-button {
  position: relative;
  z-index: 11;
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.more-dots {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.more-dots > view {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.skip-button {
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skip-icon {
  display: flex;
  align-items: center;
}

.previous-icon {
  transform: rotate(180deg);
}

.skip-triangle {
  width: 0;
  height: 0;
  border-top: 10px solid transparent;
  border-bottom: 10px solid transparent;
  border-left: 15px solid currentColor;
}

.skip-bar {
  width: 4px;
  height: 20px;
  background: currentColor;
}

.progress-row {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  font-variant-numeric: tabular-nums;
}

.progress-slider {
  flex: 1;
  min-width: 0;
  margin: 0 16px;
}

.pause-icon {
  display: flex;
  gap: 6px;
}

.pause-icon > view {
  width: 6px;
  height: 24px;
  background: currentColor;
}

.play-icon {
  width: 0;
  height: 0;
  margin-left: 5px;
  border-top: 13px solid transparent;
  border-bottom: 13px solid transparent;
  border-left: 20px solid currentColor;
}
</style>
