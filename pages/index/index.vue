<template>
  <view class="page">
    <button @click="selectVideos">导入视频</button>

    <view v-if="tracks.length === 0" class="empty">
      暂无视频
    </view>

    <view
      v-for="track in tracks"
      :key="track.id"
      class="track-item"
      @click="openPlayer(track)"
    >
      {{ track.title }}
    </view>

  </view>
</template>

<script setup>
import { ref } from 'vue'

const tracks = ref([])
// 通过页面通信传递 Track，File 不放进 URL 参数中。
const openPlayer = (track) => {
  uni.navigateTo({
    url: '/pages/player/player',
    success: ({ eventChannel }) => {
      eventChannel.emit('openTrack', track)
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
