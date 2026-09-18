<template>
  <view class="player-page">
    <view class="track-title">
      {{ currentTrack ? currentTrack.title : '请返回列表选择视频' }}
    </view>

    <view class="player-controls">
      <view class="progress-row">
        <text>{{ formatTime(currentTime) }}</text>
        <slider
          class="progress-slider"
          :min="0"
          :max="1000"
          :step="1"
          :value="seekPreview ?? (duration > 0 ? Math.round(currentTime / duration * 1000) : 0)"
          :disabled="!currentTrack || duration <= 0"
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
        :disabled="!currentTrack"
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
            <button class="speed-button" :aria-label="`倍速播放 ${speedLabel}，点击切换`" @click="cycleSpeed">
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
const audio = new Audio()
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2]
const playbackRate = ref(1)
const showMore = ref(false)
const speedLabel = computed(() => `${Number.isInteger(playbackRate.value) ? playbackRate.value.toFixed(1) : playbackRate.value}x`)

const syncPlaybackRate = () => {
  playbackRate.value = audio.playbackRate
}

const cycleSpeed = () => {
  const nextRate = playbackRates[(playbackRates.indexOf(audio.playbackRate) + 1) % playbackRates.length]
  // 默认速度用于加载下一首，playbackRate 用于立即调整当前媒体。
  audio.defaultPlaybackRate = nextRate
  audio.playbackRate = nextRate
  syncPlaybackRate()
}

audio.addEventListener('ratechange', syncPlaybackRate)
let currentObjectUrl = ''
let eventChannel
const page = getCurrentInstance().proxy

const syncPlayingState = () => {
  isPlaying.value = !audio.paused && !audio.ended
}

const syncCurrentTime = () => {
  currentTime.value = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0
}

const syncDuration = () => {
  duration.value = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
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
  if (!currentTrack.value || duration.value <= 0 || !Number.isFinite(progress)) return

  try {
    // 0～1000 的滑块位置换算成秒，只调整现有 Audio，不改变播放/暂停状态。
    audio.currentTime = Math.min(1000, Math.max(0, progress)) / 1000 * duration.value
  } catch (error) {
    console.error('无法调整播放位置：', error)
  }
  // 从 Audio 读回实际位置；后续 timeupdate / seeked 会继续同步。
  syncCurrentTime()
}

audio.addEventListener('play', syncPlayingState)
audio.addEventListener('pause', syncPlayingState)
const handleEnded = () => {
  // 忽略切歌后可能到达的旧结束事件。
  if (!audio.ended) return
  syncPlayingState()
  if (playMode.value === 'single') {
    restartTrack()
  } else {
    nextTrack()
  }
}

audio.addEventListener('ended', handleEnded)
audio.addEventListener('loadedmetadata', syncDuration)
audio.addEventListener('durationchange', syncDuration)
audio.addEventListener('timeupdate', syncCurrentTime)
audio.addEventListener('seeked', syncCurrentTime)

const clearMedia = () => {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = ''
  }
  currentIndex.value = -1
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  seekPreview.value = null
}

const resumePlayback = async () => {
  if (!currentTrack.value) return
  const title = currentTrack.value.title
  const playingUrl = currentObjectUrl
  try {
    await audio.play()
  } catch (error) {
    // 快速切歌或离开页面会中断旧请求，不让旧请求影响新媒体。
    if (playingUrl !== currentObjectUrl) return
    syncPlayingState()
    console.error(`无法播放 Track「${title}」：`, error)
  }
}

const playAtIndex = (index) => {
  if (!Number.isInteger(index) || index < 0 || index >= tracks.value.length) return
  const track = tracks.value[index]
  clearMedia()
  try {
    currentObjectUrl = URL.createObjectURL(track.file)
    audio.src = currentObjectUrl
    currentIndex.value = index
  } catch (error) {
    clearMedia()
    console.error(`无法加载 Track「${track.title}」：`, error)
    return
  }
  resumePlayback()
}

// 重播同一首时保留 Audio 和 Object URL，只把播放位置归零。
const restartTrack = () => {
  if (!currentTrack.value) return
  audio.currentTime = 0
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
  if (!currentTrack.value) return
  if (audio.paused || audio.ended) {
    resumePlayback()
  } else {
    audio.pause()
  }
}

onMounted(() => {
  // 接收队列和选中索引，File 仍是原来的本地文件对象。
  eventChannel = page.getOpenerEventChannel()
  eventChannel.on('openQueue', openQueue)
})

onUnload(() => {
  eventChannel?.off('openQueue', openQueue)
  clearMedia()
  tracks.value = []
  audio.removeEventListener('play', syncPlayingState)
  audio.removeEventListener('pause', syncPlayingState)
  audio.removeEventListener('ended', handleEnded)
  audio.removeEventListener('loadedmetadata', syncDuration)
  audio.removeEventListener('durationchange', syncDuration)
  audio.removeEventListener('timeupdate', syncCurrentTime)
  audio.removeEventListener('seeked', syncCurrentTime)
  audio.removeEventListener('ratechange', syncPlaybackRate)
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

.track-title {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow-wrap: anywhere;
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
