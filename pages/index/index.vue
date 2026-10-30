<template>
  <view class="page">
    <button :disabled="isImporting" @click="selectVideos">导入视频</button>

    <view v-if="tracks.length === 0" class="empty">
      暂无视频
    </view>

    <view
      v-for="(track, index) in tracks"
      :key="track.id"
      class="track-item"
      @click="openPlayer(index)"
    >
      <text class="track-title">{{ track.title }}</text>
      <button class="rename-button" :aria-label="`重命名 ${track.title}`" @click.stop="renameTrack(track)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m16 3 5 5L8 21H3v-5L16 3Zm-3 3 5 5" />
        </svg>
      </button>
      <button class="delete-button" :aria-label="`删除 ${track.title}`" @click.stop="confirmDelete(track)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
        </svg>
      </button>
    </view>

  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getTracks, saveTrack, deleteTrack, updateTrackTitle } from '../../services/trackStorage.js'
import { readDuration } from '../../services/mediaMetadata.js'
import { extractAudio } from '../../services/audioExtraction.js'

const tracks = ref([])
const isImporting = ref(false)
const pendingDeletes = new Set()
const pendingRenames = new Set()

const renameTrack = async (track) => {
  if (pendingRenames.has(track.id) || pendingDeletes.has(track.id)) return
  pendingRenames.add(track.id)
  try {
    const result = await uni.showModal({
      title: '重命名 Track',
      editable: true,
      content: track.title,
      placeholderText: '请输入新名称',
      confirmText: '保存',
      cancelText: '取消'
    })
    if (!result.confirm) return
    const title = (result.content || '').trim()
    if (!title) {
      uni.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    if (title === track.title) return
    const updatedTrack = await updateTrackTitle(track.id, title)
    tracks.value = tracks.value.map((item) => item.id === track.id ? updatedTrack : item)
  } catch (error) {
    console.error(`重命名「${track.title}」失败：`, error)
    uni.showToast({ title: '重命名失败，请重试', icon: 'none' })
  } finally {
    pendingRenames.delete(track.id)
  }
}

const confirmDelete = async (track) => {
  if (pendingDeletes.has(track.id) || pendingRenames.has(track.id)) return
  pendingDeletes.add(track.id)
  try {
    const result = await uni.showModal({
      title: '删除 Track',
      content: `确定删除「${track.title}」及 Hearin 中保存的媒体吗？不会删除原始文件。`,
      confirmText: '删除',
      cancelText: '取消'
    })
    if (!result.confirm) return
    await deleteTrack(track)
    // 两个 Store 的删除事务成功提交后，才更新页面。
    tracks.value = tracks.value.filter((item) => item.id !== track.id)
  } catch (error) {
    console.error(`删除「${track.title}」失败：`, error)
    uni.showToast({ title: '删除失败，请重试', icon: 'none' })
  } finally {
    pendingDeletes.delete(track.id)
  }
}

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
  if (isImporting.value) return
  const input = document.createElement('input')

  input.type = 'file'
  input.accept = 'video/*'
  input.multiple = true

  input.onchange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    isImporting.value = true
    try {
      // 避免启动恢复的结果覆盖刚导入的数据。
      await restorePromise
      // 同一批文件逐个提取，避免多个 FFmpeg Worker 同时占用大量内存。
      for (const file of files) {
        let duration
        try {
          duration = await readDuration(file)
        } catch (error) {
          console.error(`无法读取「${file.name}」的媒体信息，未导入：`, error)
          continue
        }

        let audioBlob = null
        try {
          const extraction = await extractAudio(file)
          audioBlob = extraction.blob
        } catch (error) {
          console.error(`「${file.name}」音频提取失败，将保存原视频：`, error)
        }

        const track = {
          id: crypto.randomUUID(),
          title: file.name,
          originalFileName: file.name,
          mediaType: file.type,
          duration,
          createdAt: Date.now(),
          mediaId: crypto.randomUUID(),
          ...(audioBlob ? {
            audioMediaId: crypto.randomUUID(),
            audioMediaType: audioBlob.type
          } : {})
        }

        try {
          await saveTrack(track, file, audioBlob)
          tracks.value.push(track)
          if (!audioBlob) uni.showToast({ title: '音频提取失败，已保存原视频', icon: 'none' })
        } catch (error) {
          console.error(`保存「${file.name}」到本地数据库失败，未加入列表：`, error)
          uni.showToast({ title: '本地保存失败，请重试', icon: 'none' })
        }
      }
    } finally {
      isImporting.value = false
      input.onchange = null
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
  display: flex;
  align-items: center;
  gap: 12px;
}

.track-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.delete-button,
.rename-button {
  width: 40px;
  height: 40px;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
