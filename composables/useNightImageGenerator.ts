type GenerateResponse = {
  taskId: string
  jobId: string
  status: 'processing' | 'done'
  imageUrl?: string
  requestId?: string
  debug?: {
    reviseRequested: boolean
    hasReferenceImage: boolean
    provider?: 'hunyuan-text-to-image' | 'aiart-reference-image' | 'hunyuan-reference-fallback'
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

export function useNightImageGenerator() {
  const sourceFile = shallowRef<File | null>(null)
  const sourcePreviewUrl = shallowRef('')
  const resultUrl = shallowRef('')
  const customPrompt = shallowRef('')
  const customNegativePrompt = shallowRef('')
  const revisePrompt = shallowRef(true)
  const revisedPrompt = shallowRef('')
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
    sourcePreviewUrl.value = URL.createObjectURL(selectedFile)
    resultUrl.value = ''
    taskStatus.value = ''
    currentTaskId.value = ''
    revisedPrompt.value = ''
    canRetry.value = false
    activeView.value = 'source'
  }

  function setActiveView(view: 'source' | 'result') {
    activeView.value = view
  }

  async function generateNightImage() {
    isLoading.value = true
    resultUrl.value = ''
    taskStatus.value = sourceFile.value ? '正在上传原图...' : '正在提交生成任务...'
    loadingText.value = sourceFile.value ? '上传中...' : '提交任务中...'
    currentTaskId.value = ''
    revisedPrompt.value = ''
    canRetry.value = false
    activeView.value = 'source'

    try {
      let originalUrl: string | undefined

      if (sourceFile.value) {
        const form = new FormData()
        form.append('file', sourceFile.value)

        const uploadResponse = await $fetch<{ url: string }>('/api/upload', {
          method: 'POST',
          body: form,
        })

        originalUrl = uploadResponse.url
      }

      taskStatus.value = originalUrl ? '已上传，正在提交生成任务...' : '正在提交生成任务...'
      loadingText.value = '提交任务中...'

      const generateResponse = await $fetch<GenerateResponse>('/api/generate', {
        method: 'POST',
        body: {
          ...(originalUrl ? { originalUrl } : {}),
          customPrompt: customPrompt.value,
          customNegativePrompt: customNegativePrompt.value,
          revise: revisePrompt.value,
        },
      })

      currentTaskId.value = generateResponse.taskId
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
    currentTaskId,
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
  provider?: 'hunyuan-text-to-image' | 'aiart-reference-image' | 'hunyuan-reference-fallback'
}) {
  const notices = [`任务已提交，正在生成夜景（任务号：${params.taskId}）`]

  if (params.provider === 'aiart-reference-image') {
    notices.push('已使用 AIArt 2.0 参考图生成，优先保持原图结构')
  } else if (params.provider === 'hunyuan-reference-fallback') {
    notices.push('AIArt 资源不足，已自动回退到混元参考图生成')
  } else if (params.hasReferenceImage && !params.reviseRequested) {
    notices.push('当前使用参考图，混元接口仍可能自动扩写提示词')
  }

  return notices.join('；')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
