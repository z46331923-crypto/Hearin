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
import { onLoad } from '@dcloudio/uni-app'
import { getTracks, saveTrack } from '../../services/trackStorage.js'
import { readDuration } from '../../services/mediaMetadata.js'

const tracks = ref([])
let restorePromise
onLoad(() => {
  restorePromise = getTracks().then((savedTracks) => {
    tracks.value = savedTracks
  }).catch((error) => {
    console.error('无法恢复本地 Track 列表：', error)
  })
})

// 只传递元数据队列，播放器按需从数据库读取媒体。
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

  input.onchange = async (event) => {
    const files = Array.from(event.target.files || [])
    // 避免启动恢复的结果覆盖刚导入的数据。
    await restorePromise
    for (const file of files) {
      try {
        const duration = await readDuration(file)
        const track = {
          id: crypto.randomUUID(),
          title: file.name,
          originalFileName: file.name,
          mediaType: file.type,
          duration,
          createdAt: Date.now(),
          mediaId: crypto.randomUUID()
        }
        await saveTrack(track, file)
        tracks.value.push(track)
      } catch (error) {
        console.error(`导入「${file.name}」失败，未加入列表：`, error)
      }
    }
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
