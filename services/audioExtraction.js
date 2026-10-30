const EXTRACTION_ARGS = ['-i', 'input', '-map', '0:a:0', '-vn', '-c:a', 'copy', '-movflags', '+faststart', 'output.m4a']

const abortError = () => new DOMException('音频提取已取消', 'AbortError')

export const extractAudio = async (file, options = {}) => {
  const { signal, onLog, onStatus } = options
  if (!(file instanceof Blob)) throw new TypeError('音频提取需要 File 或 Blob')
  if (signal?.aborted) throw abortError()

  let ffmpeg
  let loadTimer
  let loadTimedOut = false
  const logs = []
  const handleLog = ({ message }) => {
    logs.push(message)
    if (logs.length > 20) logs.shift()
    onLog?.(message)
  }
  const handleAbort = () => ffmpeg?.terminate()
  signal?.addEventListener('abort', handleAbort, { once: true })

  try {
    onStatus?.('loading')
    const base = new URL('static/ffmpeg/', document.baseURI)
    const moduleURL = new URL('wrapper/index.js', base).href
    const { FFmpeg } = await import(/* @vite-ignore */ moduleURL)
    if (signal?.aborted) throw abortError()

    ffmpeg = new FFmpeg()
    ffmpeg.on('log', handleLog)
    loadTimer = setTimeout(() => {
      loadTimedOut = true
      ffmpeg.terminate()
    }, 60000)
    await ffmpeg.load({
      coreURL: new URL('core/ffmpeg-core.js', base).href,
      wasmURL: new URL('core/ffmpeg-core.wasm', base).href
    })
    clearTimeout(loadTimer)
    if (signal?.aborted) throw abortError()

    onStatus?.('extracting')
    const start = performance.now()
    await ffmpeg.writeFile('input', new Uint8Array(await file.arrayBuffer()))
    if (signal?.aborted) throw abortError()
    const code = await ffmpeg.exec(EXTRACTION_ARGS, 120000)
    if (code !== 0) {
      throw new Error(`FFmpeg 退出码 ${code}。视频可能没有音轨、音频编码不兼容 M4A，或处理超时。`)
    }
    const output = await ffmpeg.readFile('output.m4a')
    if (!(output instanceof Uint8Array) || !output.byteLength) throw new Error('提取结果为空')
    const blob = new Blob([output], { type: 'audio/mp4' })
    return {
      blob,
      inputSize: file.size,
      outputSize: blob.size,
      seconds: (performance.now() - start) / 1000
    }
  } catch (error) {
    if (signal?.aborted) throw abortError()
    const message = loadTimedOut ? 'FFmpeg 引擎加载超过 60 秒' : (error.message || String(error))
    const extractionError = new Error(`${message}\n${logs.slice(-8).join('\n')}`.trim(), { cause: error })
    extractionError.name = 'AudioExtractionError'
    throw extractionError
  } finally {
    clearTimeout(loadTimer)
    signal?.removeEventListener('abort', handleAbort)
    if (ffmpeg) {
      if (ffmpeg.loaded) {
        for (const path of ['input', 'output.m4a']) {
          try { await ffmpeg.deleteFile(path) } catch (error) { console.debug('[音频提取] 临时文件不存在或已清理', path, error) }
        }
      }
      ffmpeg.off('log', handleLog)
      ffmpeg.terminate()
    }
  }
}
