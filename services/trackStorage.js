let databasePromise

export const openDatabase = () => {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('Hearin', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('tracks', { keyPath: 'id' })
      db.createObjectStore('media', { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => console.error('Hearin 数据库升级被其他页面阻塞，请关闭其他 Hearin 页面后重试。')
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        databasePromise = undefined
      }
      db.onclose = () => { databasePromise = undefined }
      resolve(db)
    }
  }).catch((error) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export const saveTrack = async (track, blob) => {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tracks', 'media'], 'readwrite')
    // 只有整个事务提交才算保存成功，任一写入失败都会回滚两项数据。
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('保存媒体的事务已取消'))
    try {
      transaction.objectStore('media').add({ id: track.mediaId, blob })
      transaction.objectStore('tracks').add(track)
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

export const deleteTrack = async (track) => {
  if (!track.id || !track.mediaId) throw new Error('删除失败：Track 缺少 id 或 mediaId')
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tracks', 'media'], 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('删除媒体的事务已取消'))
    try {
      transaction.objectStore('tracks').delete(track.id)
      transaction.objectStore('media').delete(track.mediaId)
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

export const updateTrackTitle = async (id, newTitle) => {
  const title = typeof newTitle === 'string' ? newTitle.trim() : ''
  if (!id || !title) throw new Error('重命名失败：缺少 Track id 或名称为空')
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tracks', 'readwrite')
    const store = transaction.objectStore('tracks')
    let updatedTrack
    let failure
    transaction.oncomplete = () => resolve(updatedTrack)
    transaction.onabort = () => reject(failure || transaction.error || new Error('重命名事务已取消'))
    const request = store.get(id)
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('Track 已不存在，请刷新列表')
        // 从数据库读取原记录，仅替换 title，保留原始文件名等其他字段。
        updatedTrack = { ...request.result, title }
        store.put(updatedTrack)
      } catch (error) {
        failure = error
        transaction.abort()
      }
    }
  })
}

const readStore = async (storeName, key) => {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = key === undefined ? store.getAll() : store.get(key)
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error || new Error('读取媒体的事务已取消'))
  })
}

export const getTracks = async () => {
  const tracks = await readStore('tracks')
  return tracks.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export const getMedia = async (mediaId) => {
  if (!mediaId) throw new Error('Track 缺少 mediaId')
  const media = await readStore('media', mediaId)
  if (!media || !(media.blob instanceof Blob)) throw new Error(`找不到媒体数据：${mediaId}`)
  return media
}
