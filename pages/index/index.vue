<template>
  <view class="page">
    <button @click="selectVideos">导入视频</button>

    <view v-if="tracks.length === 0" class="empty">
      暂无视频
    </view>

    <view
      v-for="(track, index) in tracks"
      :key="track.id"
      class="track-item"
      @click="openPlayer(index)"
    >
      {{ track.title }}
    </view>

  </view>
</template>

<script setup>
import { ref } from 'vue'

const tracks = ref([])
// 复制当前列表作为本次播放队列，File 仍通过页面通信传递。
const openPlayer = (index) => {
  const queue = tracks.value.slice()
  uni.navigateTo({
    url: '/pages/player/player',
    success: ({ eventChannel }) => {
      eventChannel.emit('openQueue', { tracks: queue, currentIndex: index })
    },
    fail: (error) => {
      console.error('无法打开播放器页面：', error)
    }
  })
}

const selectVideos = () => {
  const input = document.createElement('input')

  input.type = 'file'
  input.accept = 'video/*'
  input.multiple = true

  input.onchange = (event) => {
    const files = Array.from(event.target.files)

    files.forEach((file) => {
      tracks.value.push({
        id: crypto.randomUUID(),
        title: file.name,
        file: file
      })
    })
  }

  input.click()
}
</script>

<style>
.page {
  padding: 20px;
}

.empty {
  margin-top: 20px;
}

.track-item {
  margin-top: 12px;
}
</style>
