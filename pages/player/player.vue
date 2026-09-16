<template>
  <view class="player-page">
    <view class="track-title">
      {{ currentTrack ? currentTrack.title : '请返回列表选择视频' }}
    </view>

    <view class="player-controls">
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
    </view>
  </view>
</template>

<script setup>
import { ref, getCurrentInstance, onMounted } from 'vue'
import { onUnload } from '@dcloudio/uni-app'

const currentTrack = ref(null)
const isPlaying = ref(false)
const audio = new Audio()
let currentObjectUrl = ''
let eventChannel
const page = getCurrentInstance().proxy

const syncPlayingState = () => {
  isPlaying.value = !audio.paused && !audio.ended
}

audio.addEventListener('play', syncPlayingState)
audio.addEventListener('pause', syncPlayingState)
audio.addEventListener('ended', syncPlayingState)

const clearMedia = () => {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = ''
  }
  currentTrack.value = null
  isPlaying.value = false
}

const resumePlayback = async () => {
  if (!currentTrack.value) return
  const title = currentTrack.value.title
  try {
    await audio.play()
  } catch (error) {
    syncPlayingState()
    console.error(`无法播放 Track「${title}」：`, error)
  }
}

const openTrack = (track) => {
  clearMedia()
  try {
    currentObjectUrl = URL.createObjectURL(track.file)
    audio.src = currentObjectUrl
    currentTrack.value = track
  } catch (error) {
    clearMedia()
    console.error(`无法加载 Track「${track.title}」：`, error)
    return
  }
  resumePlayback()
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
  // 接收列表页传来的 Track，File 仍是原来的本地文件对象。
  eventChannel = page.getOpenerEventChannel()
  eventChannel.on('openTrack', openTrack)
})

onUnload(() => {
  eventChannel?.off('openTrack', openTrack)
  clearMedia()
  audio.removeEventListener('play', syncPlayingState)
  audio.removeEventListener('pause', syncPlayingState)
  audio.removeEventListener('ended', syncPlayingState)
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
