// 只读取元数据，不播放视频；所有结束路径都释放临时地址。
export const readDuration = (file) => new Promise((resolve, reject) => {
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)
  const finish = (error, duration) => {
    clearTimeout(timer)
    video.onloadedmetadata = null
    video.onerror = null
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
    if (error) reject(error)
    else resolve(duration)
  }
  const timer = setTimeout(() => finish(new Error('读取视频时长超时')), 15000)
  video.preload = 'metadata'
  video.onloadedmetadata = () => {
    if (!Number.isFinite(video.duration) || video.duration < 0) {
      finish(new Error('视频没有可用的有限时长'))
    } else {
      finish(null, video.duration)
    }
  }
  video.onerror = () => finish(new Error(`无法读取视频元数据（媒体错误 ${video.error?.code ?? '未知'}）`))
  try {
    video.src = url
    video.load()
  } catch (error) {
    finish(error)
  }
})
