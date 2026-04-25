type GenerateResponse = {
  taskId: string
  jobId: string
  status: 'processing' | 'done'
  imageUrl?: string
  requestId?: string
  debug?: {
    reviseRequested: boolean
    hasReferenceImage: boolean
    provider?: 'hunyuan-text-to-image' | 'tokenhub-reference-image'
    seed?: number
    size?: string
  }
}

type TaskResponse = {
  taskId: string
  status: 'processing' | 'done' | 'failed'
  imageUrl?: string
  revisedPrompt?: string
  errorMessage?: string
  errorCode?: string
  statusMessage?: string
  statusCode?: string
  requestId?: string
}

type ApiErrorPayload = {
  statusMessage?: string
  message?: string
  data?: {
    message?: string
    errorMessage?: string
    errorCode?: string
    statusCode?: string
    statusMessage?: string
    requestId?: string
  }
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 100
const MAX_TOKENHUB_FILE_BYTES = 1024 * 1024
const MIN_IMAGE_QUALITY = 0.45
const DEFAULT_IMAGE_QUALITY = 0.9
const MAX_IMAGE_DIMENSION = 1600

export function useNightImageGenerator() {
  const sourceFile = shallowRef<File | null>(null)
  const sourceRemoteUrl = shallowRef('')
  const sourcePreviewUrl = shallowRef('')
  const resultUrl = shallowRef('')
  const currentProvider = shallowRef<'hunyuan-text-to-image' | 'tokenhub-reference-image' | ''>('')
  const currentRequestId = shallowRef('')
  const currentSeed = shallowRef<number | null>(null)
  const currentSize = shallowRef('')
  const customPrompt = shallowRef('')
  const customNegativePrompt = shallowRef('')
  const enableNegativePrompt = shallowRef(false)
  const revisePrompt = shallowRef(false)
  const revisedPrompt = shallowRef('')
  const sourceFileHint = shallowRef('')
  const taskStatus = shallowRef('')
  const loadingText = shallowRef('生成中...')
  const currentTaskId = shallowRef('')
  const activeView = shallowRef<'source' | 'result'>('source')
  const isLoading = shallowRef(false)
  const canRetry = shallowRef(false)

  const hasSourceImage = computed(() => Boolean(sourcePreviewUrl.value))
  const hasResultImage = computed(() => Boolean(resultUrl.value))
  const displayedImageUrl = computed(() => {
    if (activeView.value === 'result' && resultUrl.value) {
      return resultUrl.value
    }

    return sourcePreviewUrl.value
  })
  const statusVariant = computed(() => {
    if (!taskStatus.value) {
      return 'neutral'
    }

    if (taskStatus.value.startsWith('失败')) {
      return 'error'
    }

    if (taskStatus.value.includes('完成') || hasResultImage.value) {
      return 'success'
    }

    return 'info'
  })

  watch(sourcePreviewUrl, (nextValue, previousValue) => {
    if (previousValue && previousValue.startsWith('blob:')) {
      URL.revokeObjectURL(previousValue)
    }

    if (!nextValue) {
      activeView.value = 'source'
    }
  })

  onBeforeUnmount(() => {
    if (sourcePreviewUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(sourcePreviewUrl.value)
    }
  })

  function onFileChange(event: Event) {
    const target = event.target as HTMLInputElement | null
    const selectedFile = target?.files?.[0]

    if (!selectedFile) {
      return
    }

    sourceFile.value = selectedFile
    sourceRemoteUrl.value = ''
    sourcePreviewUrl.value = URL.createObjectURL(selectedFile)
    resultUrl.value = ''
    sourceFileHint.value = buildFileHint(selectedFile)
    taskStatus.value = ''
    currentTaskId.value = ''
    currentProvider.value = ''
    currentRequestId.value = ''
    currentSeed.value = null
    currentSize.value = ''
    revisedPrompt.value = ''
    sourceFileHint.value = ''
    canRetry.value = false
    activeView.value = 'source'
  }

  function setActiveView(view: 'source' | 'result') {
    activeView.value = view
  }

  function resetGenerator() {
    sourceFile.value = null
    sourceRemoteUrl.value = ''
    sourcePreviewUrl.value = ''
    resultUrl.value = ''
    customPrompt.value = ''
    taskStatus.value = ''
    currentTaskId.value = ''
    currentProvider.value = ''
    currentRequestId.value = ''
    currentSeed.value = null
    currentSize.value = ''
    revisedPrompt.value = ''
    sourceFileHint.value = ''
    canRetry.value = false
    activeView.value = 'source'
  }

  function restoreHistorySnapshot(snapshot: {
    sourceImageUrl?: string
    resultImageUrl?: string
    prompt?: string
    status?: string
    taskId?: string
  }) {
    sourceFile.value = null
    sourceRemoteUrl.value = snapshot.sourceImageUrl?.trim() || ''
    sourcePreviewUrl.value = snapshot.sourceImageUrl?.trim() || ''
    resultUrl.value = snapshot.resultImageUrl?.trim() || ''
    customPrompt.value = snapshot.prompt?.trim() || ''
    taskStatus.value = snapshot.status?.trim() || ''
    currentTaskId.value = snapshot.taskId?.trim() || ''
    currentProvider.value = ''
    currentRequestId.value = ''
    currentSeed.value = null
    currentSize.value = ''
    revisedPrompt.value = ''
    sourceFileHint.value = ''
    canRetry.value = Boolean(resultUrl.value || sourcePreviewUrl.value)
    activeView.value = resultUrl.value ? 'result' : 'source'
  }

  async function generateNightImage() {
    isLoading.value = true
    resultUrl.value = ''
    taskStatus.value = sourceFile.value ? '正在上传原图...' : '正在提交生成任务...'
    loadingText.value = sourceFile.value ? '上传中...' : '提交任务中...'
    currentTaskId.value = ''
    currentProvider.value = ''
    currentRequestId.value = ''
    currentSeed.value = null
    currentSize.value = ''
    revisedPrompt.value = ''
    canRetry.value = false
    activeView.value = 'source'

    try {
      let originalUrl: string | undefined = sourceRemoteUrl.value || undefined
      let preparedFileMeta: Awaited<ReturnType<typeof prepareUploadFile>> | null = null
      let originalImageDimensions: { width: number, height: number } | null = null

      if (sourceFile.value) {
        taskStatus.value = '正在处理参考图...'
        loadingText.value = '压缩图片中...'
        originalImageDimensions = await getImageDimensions(sourceFile.value)
        preparedFileMeta = await prepareUploadFile(sourceFile.value)
        sourceFileHint.value = buildFileHint(preparedFileMeta.file, sourceFile.value)

        const form = new FormData()
        form.append('file', preparedFileMeta.file)

        const uploadResponse = await $fetch<{ url: string }>('/api/upload', {
          method: 'POST',
          body: form,
        })

        originalUrl = uploadResponse.url
        sourceRemoteUrl.value = uploadResponse.url
      }

      taskStatus.value = originalUrl ? '已上传，正在提交生成任务...' : '正在提交生成任务...'
      loadingText.value = '提交任务中...'

      const generateResponse = await $fetch<GenerateResponse>('/api/generate', {
        method: 'POST',
        body: {
          ...(originalUrl ? { originalUrl } : {}),
          ...(preparedFileMeta ? {
            originalImageWidth: originalImageDimensions?.width,
            originalImageHeight: originalImageDimensions?.height,
            imageWidth: preparedFileMeta.width,
            imageHeight: preparedFileMeta.height,
          } : {}),
          customPrompt: customPrompt.value,
          customNegativePrompt: enableNegativePrompt.value ? customNegativePrompt.value : '',
          revise: revisePrompt.value,
        },
      })

      currentTaskId.value = generateResponse.taskId
      currentProvider.value = generateResponse.debug?.provider ?? ''
      currentRequestId.value = generateResponse.requestId ?? ''
      currentSeed.value = generateResponse.debug?.seed ?? null
      currentSize.value = generateResponse.debug?.size ?? ''
      taskStatus.value = buildSubmitStatus({
        taskId: generateResponse.taskId,
        hasReferenceImage: generateResponse.debug?.hasReferenceImage ?? Boolean(originalUrl),
        reviseRequested: generateResponse.debug?.reviseRequested ?? revisePrompt.value,
        provider: generateResponse.debug?.provider,
      })
      loadingText.value = '生成中...'

      if (generateResponse.imageUrl) {
        resultUrl.value = generateResponse.imageUrl
      } else {
        resultUrl.value = await pollTask(generateResponse.taskId, taskStatus, revisedPrompt)
      }

      activeView.value = 'result'
      taskStatus.value = '生成完成'
    } catch (error) {
      const message = getErrorMessage(error)
      taskStatus.value = `失败：${message}`
      canRetry.value = true
      throw new Error(message)
    } finally {
      isLoading.value = false
      loadingText.value = '生成中...'
    }
  }

  async function retryGenerate() {
    await generateNightImage()
  }

  async function copyTaskId() {
    if (!currentTaskId.value) {
      return
    }

    try {
      await navigator.clipboard.writeText(currentTaskId.value)
      taskStatus.value = `任务号已复制：${currentTaskId.value}`
    } catch {
      throw new Error(`复制失败，请手动复制任务号：${currentTaskId.value}`)
    }
  }

  async function downloadResult() {
    if (!resultUrl.value) {
      return
    }

    const fileName = `night-image-${Date.now()}.png`

    try {
      const response = await fetch(resultUrl.value)

      if (!response.ok) {
        throw new Error('下载失败')
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      triggerDownload(blobUrl, fileName)
      URL.revokeObjectURL(blobUrl)
      taskStatus.value = '图片已开始下载'
    } catch {
      triggerDownload(resultUrl.value, fileName)
      taskStatus.value = '已触发下载，如浏览器限制将改为打开图片链接'
    }
  }

  return {
    activeView,
    canRetry,
    copyTaskId,
    currentProvider,
    currentRequestId,
    currentSeed,
    currentSize,
    currentTaskId,
    enableNegativePrompt,
    customPrompt,
    customNegativePrompt,
    displayedImageUrl,
    downloadResult,
    generateNightImage,
    hasResultImage,
    hasSourceImage,
    isLoading,
    loadingText,
    onFileChange,
    resetGenerator,
    restoreHistorySnapshot,
    sourceFileHint,
    revisedPrompt,
    revisePrompt,
    resultUrl,
    retryGenerate,
    setActiveView,
    sourcePreviewUrl,
    statusVariant,
    taskStatus,
  }
}

export function getProviderLabel(provider: 'hunyuan-text-to-image' | 'tokenhub-reference-image' | '') {
  if (provider === 'tokenhub-reference-image') {
    return 'TokenHub 官方通道（URL / Base64）'
  }

  if (provider === 'hunyuan-text-to-image') {
    return '混元文生图通道'
  }

  return '未开始'
}

async function prepareUploadFile(file: File) {
  const sourceBitmap = await createImageBitmap(file)

  try {
    if (file.size <= MAX_TOKENHUB_FILE_BYTES) {
      return {
        file,
        width: sourceBitmap.width,
        height: sourceBitmap.height,
      }
    }

    const { width, height } = getScaledSize(sourceBitmap.width, sourceBitmap.height, MAX_IMAGE_DIMENSION)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('浏览器不支持图片压缩')
    }

    context.drawImage(sourceBitmap, 0, 0, width, height)

    const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg'
    let quality = DEFAULT_IMAGE_QUALITY
    let outputBlob = await canvasToBlob(canvas, outputType, quality)
    let outputWidth = width
    let outputHeight = height

    while (outputBlob.size > MAX_TOKENHUB_FILE_BYTES && quality > MIN_IMAGE_QUALITY) {
      quality = Math.max(MIN_IMAGE_QUALITY, Number((quality - 0.1).toFixed(2)))
      outputBlob = await canvasToBlob(canvas, outputType, quality)
    }

    if (outputBlob.size > MAX_TOKENHUB_FILE_BYTES && (width > 1280 || height > 1280)) {
      const nextCanvas = document.createElement('canvas')
      const nextSize = getScaledSize(width, height, 1280)
      nextCanvas.width = nextSize.width
      nextCanvas.height = nextSize.height
      const nextContext = nextCanvas.getContext('2d')

      if (!nextContext) {
        throw new Error('浏览器不支持图片压缩')
      }

      nextContext.drawImage(canvas, 0, 0, nextSize.width, nextSize.height)
      outputBlob = await canvasToBlob(nextCanvas, outputType, MIN_IMAGE_QUALITY)
      outputWidth = nextSize.width
      outputHeight = nextSize.height
    }

    if (outputBlob.size > MAX_TOKENHUB_FILE_BYTES) {
      throw new Error('图片压缩后仍超过 1MB，请换一张更小的图片')
    }

    const nextExtension = outputType === 'image/png' ? 'png' : 'jpg'
    const fileName = replaceFileExtension(file.name, nextExtension)

    return {
      file: new File([outputBlob], fileName, {
        type: outputBlob.type,
        lastModified: Date.now(),
      }),
      width: outputWidth,
      height: outputHeight,
    }
  } finally {
    sourceBitmap.close()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('图片压缩失败'))
        return
      }

      resolve(blob)
    }, type, quality)
  })
}

function getScaledSize(width: number, height: number, maxDimension: number) {
  const longestSide = Math.max(width, height)

  if (longestSide <= maxDimension) {
    return { width, height }
  }

  const scale = maxDimension / longestSide

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function replaceFileExtension(fileName: string, extension: string) {
  const normalizedName = fileName.replace(/\.[^.]+$/, '')
  return `${normalizedName}.${extension}`
}

function buildFileHint(currentFile: File, originalFile?: File) {
  const currentSizeText = formatFileSize(currentFile.size)

  if (!originalFile || originalFile.size === currentFile.size) {
    return `当前参考图大小：${currentSizeText}`
  }

  return `当前参考图已压缩：${formatFileSize(originalFile.size)} → ${currentSizeText}`
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function getImageDimensions(file: File) {
  return new Promise<{ width: number, height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('读取图片尺寸失败'))
    }

    image.src = objectUrl
  })
}

async function pollTask(
  taskId: string,
  taskStatus: { value: string },
  revisedPrompt: { value: string },
) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS)

    const task = await $fetch<TaskResponse>('/api/task', {
      query: { taskId },
    })

    if (task.revisedPrompt) {
      revisedPrompt.value = task.revisedPrompt
    }

    if (task.status === 'done' && task.imageUrl) {
      return task.imageUrl
    }

    if (task.status === 'failed') {
      throw new Error(formatTaskError(task))
    }

    taskStatus.value = `正在生成夜景，请稍候...（第 ${attempt + 1} / ${MAX_POLL_ATTEMPTS} 次查询）`
  }

  throw new Error('等待生成结果超时，请稍后通过任务接口继续查询')
}

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

function formatTaskError(task: TaskResponse) {
  const details = [
    task.errorMessage,
    task.errorCode ? `错误码：${task.errorCode}` : '',
    task.statusCode ? `状态码：${task.statusCode}` : '',
    task.statusMessage ? `状态信息：${task.statusMessage}` : '',
    task.requestId ? `请求 ID：${task.requestId}` : '',
  ].filter(Boolean)

  return details.join('；') || '混元生成任务失败'
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    const fetchError = error as Error & ApiErrorPayload
    const details = [
      fetchError.data?.errorMessage,
      fetchError.data?.message,
      fetchError.data?.errorCode ? `错误码：${fetchError.data.errorCode}` : '',
      fetchError.data?.statusCode ? `状态码：${fetchError.data.statusCode}` : '',
      fetchError.data?.statusMessage ? `状态信息：${fetchError.data.statusMessage}` : '',
      fetchError.data?.requestId ? `请求 ID：${fetchError.data.requestId}` : '',
      fetchError.message,
    ].filter(Boolean)

    return details[0] ? Array.from(new Set(details)).join('；') : '生成失败'
  }

  return '生成失败'
}

function buildSubmitStatus(params: {
  taskId: string
  hasReferenceImage: boolean
  reviseRequested: boolean
  provider?: 'hunyuan-text-to-image' | 'tokenhub-reference-image'
}) {
  const notices = [`任务已提交，正在生成夜景（任务号：${params.taskId}）`]

  if (params.provider === 'tokenhub-reference-image') {
    notices.push('已使用 TokenHub 官方参考图生成（支持 URL / Base64）')
  } else if (params.hasReferenceImage && !params.reviseRequested) {
    notices.push('当前使用参考图，混元接口仍可能自动扩写提示词')
  }

  return notices.join('；')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
