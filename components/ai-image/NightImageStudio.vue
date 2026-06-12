<script setup lang="ts">
import type { CSSProperties } from 'vue'
import AppSidebarShell from '~/components/shared/AppSidebarShell.vue'
import RecentRecordsPanel from '~/components/shared/RecentRecordsPanel.vue'
import { useLocalImageDraft } from '~/composables/useLocalImageDraft'
import { usePendingReloadResume } from '~/composables/usePendingReloadResume'
import { useLocalImageHistory } from '~/composables/useLocalImageHistory'

const props = withDefaults(defineProps<{
  mobileSidebarOpen?: boolean
}>(), {
  mobileSidebarOpen: false,
})

const emit = defineEmits<{
  'update:mobileSidebarOpen': [value: boolean]
}>()

const {
  activeView,
  customPrompt,
  currentTaskId,
  displayedImageUrl,
  downloadResult,
  generateNightImage,
  hasResultImage,
  hasSourceImage,
  historyResultImageUrl,
  historySourceImageUrl,
  isFailed,
  isLoading,
  lastErrorMessage,
  loadingText,
  onFileChange,
  primaryActionLabel,
  resetGenerator,
  resumePendingTask,
  restoreHistorySnapshot,
  resultUrl,
  sessionId,
  setActiveView,
  sourcePreviewUrl,
  statusVariant,
  taskStatus,
} = useNightImageGenerator()

const {
  clearRecords,
  deleteRecord,
  getLatestRecord,
  getRecord,
  loadRecords,
  records,
  saveRecord,
} = useLocalImageHistory()
const { clearDraft, loadDraft, saveDraft } = useLocalImageDraft()
const { clearPendingReload, consumePendingReload, markPendingReload } = usePendingReloadResume('image')
const MAX_CUSTOM_PROMPT_LENGTH = 10000

const isSidebarExpanded = shallowRef(true)
const isMobileViewport = shallowRef(false)
const activeHistoryId = shallowRef('')
const draftHistoryId = shallowRef('')
const shouldAnimateResultReveal = shallowRef(false)
const promptShellElement = shallowRef<HTMLElement | null>(null)
const mobilePromptOffset = shallowRef('0px')
const isRestoringHistory = shallowRef(false)
const isSwitchingHistoryRecord = shallowRef(false)
const isImagePreviewOpen = shallowRef(false)
const previewViewportElement = shallowRef<HTMLElement | null>(null)
const previewImageElement = shallowRef<HTMLImageElement | null>(null)
const previewScale = shallowRef(1)
const previewOffsetX = shallowRef(0)
const previewOffsetY = shallowRef(0)
const isPreviewDragging = shallowRef(false)
const previewTransformStyle = computed<CSSProperties>(() => ({
  transform: `translate3d(${previewOffsetX.value}px, ${previewOffsetY.value}px, 0) scale(${previewScale.value})`,
}))
const previewScaleLabel = computed(() => `${Math.round(previewScale.value * 100)}%`)
let resultRevealTimer: number | null = null
let mobileViewportQuery: MediaQueryList | null = null
let promptResizeObserver: ResizeObserver | null = null
let previewDragPointerId: number | null = null
let previewDragStartX = 0
let previewDragStartY = 0
let previewDragOriginOffsetX = 0
let previewDragOriginOffsetY = 0
let previewPinchStartDistance = 0
let previewPinchStartScale = 1
let previewPinchStartOffsetX = 0
let previewPinchStartOffsetY = 0
let previewPinchCenterX = 0
let previewPinchCenterY = 0
const previewPointers = new Map<number, { x: number, y: number }>()
const isMobileSidebarOpen = computed({
  get: () => props.mobileSidebarOpen,
  set: value => emit('update:mobileSidebarOpen', value),
})
const imageMainStyle = computed<CSSProperties & Record<'--mobile-prompt-offset', string>>(() => ({
  '--mobile-prompt-offset': mobilePromptOffset.value,
}))

const stageTitle = computed(() => {
  if (hasResultImage.value && activeView.value === 'result') {
    return '夜景成片'
  }

  if (hasSourceImage.value) {
    return '参考原图'
  }

  return '上传参考图，开始夜景生成'
})

const recentRecords = computed(() => records.value.map(record => ({
  id: record.id,
  title: record.title,
  subtitle: record.prompt || '未填写提示词',
  meta: formatRelativeTime(record.updatedAt),
})))
const selectedHistoryId = computed(() => activeHistoryId.value || draftHistoryId.value)

const stageFrameClasses = computed(() => ({
  'image-stage--loading': isLoading.value && hasSourceImage.value,
}))

const imageWrapperClasses = computed(() => ({
  'image-wrapper--result': activeView.value === 'result' && hasResultImage.value,
  'image-wrapper--reveal': shouldAnimateResultReveal.value && activeView.value === 'result' && hasResultImage.value,
}))
const previewImageUrl = computed(() => displayedImageUrl.value || '')
const previewImageTitle = computed(() => {
  if (activeView.value === 'result' && hasResultImage.value) {
    return '夜景成图预览'
  }

  if (hasSourceImage.value) {
    return '原图预览'
  }

  return '图片预览'
})
const trimmedPromptLength = computed(() => customPrompt.value.trim().length)
const isPromptTooLong = computed(() => trimmedPromptLength.value > MAX_CUSTOM_PROMPT_LENGTH)

onMounted(() => {
  setupMobileViewportWatcher()
  setupPromptShellObserver()
  loadRecords()
  bindBeforeUnload()
  window.addEventListener('keydown', handleWindowKeydown)

  if (consumePendingReload()) {
    restoreImageDraft()
    return
  }

  clearDraft()
  draftHistoryId.value = createHistoryId()
})

watch(
  () => [
    activeHistoryId.value,
    activeView.value,
    draftHistoryId.value,
    sourcePreviewUrl.value,
    resultUrl.value,
    customPrompt.value,
    taskStatus.value,
    currentTaskId.value,
    lastErrorMessage.value,
    loadingText.value,
    sessionId.value,
  ],
  () => {
    persistImageDraft()
  },
)

watch(resultUrl, (nextValue, previousValue) => {
  if (!nextValue || nextValue === previousValue) {
    return
  }

  shouldAnimateResultReveal.value = true

  if (resultRevealTimer) {
    window.clearTimeout(resultRevealTimer)
  }

  resultRevealTimer = window.setTimeout(() => {
    shouldAnimateResultReveal.value = false
    resultRevealTimer = null
  }, 2200)
})

watch(
  () => [isImagePreviewOpen.value, previewImageUrl.value],
  ([isOpen]) => {
    if (isOpen) {
      resetPreviewTransform()
      return
    }

    releasePreviewInteraction()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleWindowKeydown)
  unbindViewportListener(mobileViewportQuery, handleMobileViewportChange)
  promptResizeObserver?.disconnect()

  if (!resultRevealTimer) {
    return
  }

  window.clearTimeout(resultRevealTimer)
})

function toggleSidebar() {
  if (isMobileViewport.value) {
    isMobileSidebarOpen.value = !isMobileSidebarOpen.value
    return
  }

  isSidebarExpanded.value = !isSidebarExpanded.value
}

function closeMobileSidebar() {
  isMobileSidebarOpen.value = false
}

function openImagePreview() {
  if (!displayedImageUrl.value || isRestoringHistory.value) {
    return
  }

  resetPreviewTransform()
  isImagePreviewOpen.value = true
}

function closeImagePreview() {
  releasePreviewInteraction()
  resetPreviewTransform()
  isImagePreviewOpen.value = false
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isImagePreviewOpen.value) {
    closeImagePreview()
  }
}

function resetPreviewTransform() {
  previewScale.value = 1
  previewOffsetX.value = 0
  previewOffsetY.value = 0
}

function releasePreviewInteraction() {
  isPreviewDragging.value = false
  previewDragPointerId = null
  previewPinchStartDistance = 0
  previewPointers.clear()
}

function clampPreviewScale(scale: number) {
  return Math.min(5, Math.max(1, scale))
}

function clampPreviewOffsets(nextOffsetX: number, nextOffsetY: number, scale = previewScale.value) {
  const viewport = previewViewportElement.value
  const image = previewImageElement.value

  if (!viewport || !image || scale <= 1) {
    return { x: 0, y: 0 }
  }

  const viewportRect = viewport.getBoundingClientRect()
  const imageRect = image.getBoundingClientRect()
  const currentScale = previewScale.value || 1
  const baseImageWidth = imageRect.width / currentScale
  const baseImageHeight = imageRect.height / currentScale
  const scaledImageWidth = baseImageWidth * scale
  const scaledImageHeight = baseImageHeight * scale
  const overscrollAllowance = 40
  const maxOffsetX = Math.max(0, (scaledImageWidth - viewportRect.width) / 2) + overscrollAllowance
  const maxOffsetY = Math.max(0, (scaledImageHeight - viewportRect.height) / 2) + overscrollAllowance

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, nextOffsetX)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, nextOffsetY)),
  }
}

function applyPreviewTransform(nextScale: number, nextOffsetX: number, nextOffsetY: number) {
  const clampedScale = clampPreviewScale(nextScale)
  const clampedOffsets = clampPreviewOffsets(nextOffsetX, nextOffsetY, clampedScale)
  previewScale.value = clampedScale
  previewOffsetX.value = clampedOffsets.x
  previewOffsetY.value = clampedOffsets.y
}

function zoomPreview(nextScale: number, originClientX?: number, originClientY?: number) {
  const viewport = previewViewportElement.value
  const currentScale = previewScale.value
  const clampedScale = clampPreviewScale(nextScale)

  if (!viewport || clampedScale === currentScale) {
    if (clampedScale === 1) {
      applyPreviewTransform(1, 0, 0)
    }
    return
  }

  const rect = viewport.getBoundingClientRect()
  const originX = originClientX ?? rect.left + rect.width / 2
  const originY = originClientY ?? rect.top + rect.height / 2
  const relativeX = originX - rect.left - rect.width / 2
  const relativeY = originY - rect.top - rect.height / 2
  const scaleRatio = clampedScale / currentScale
  const nextOffsetX = (previewOffsetX.value - relativeX) * scaleRatio + relativeX
  const nextOffsetY = (previewOffsetY.value - relativeY) * scaleRatio + relativeY

  applyPreviewTransform(clampedScale, nextOffsetX, nextOffsetY)
}

function handlePreviewWheel(event: WheelEvent) {
  if (!isImagePreviewOpen.value) {
    return
  }

  event.preventDefault()
  const delta = event.deltaY < 0 ? 0.16 : -0.16
  zoomPreview(previewScale.value + delta, event.clientX, event.clientY)
}

function updatePreviewPointer(event: PointerEvent) {
  previewPointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
  })
}

function getPreviewPointerDistance() {
  const [firstPointer, secondPointer] = Array.from(previewPointers.values())

  if (!firstPointer || !secondPointer) {
    return 0
  }

  return Math.hypot(secondPointer.x - firstPointer.x, secondPointer.y - firstPointer.y)
}

function getPreviewPointerCenter() {
  const [firstPointer, secondPointer] = Array.from(previewPointers.values())

  if (!firstPointer || !secondPointer) {
    return null
  }

  return {
    x: (firstPointer.x + secondPointer.x) / 2,
    y: (firstPointer.y + secondPointer.y) / 2,
  }
}

function startPreviewPinch() {
  const center = getPreviewPointerCenter()

  if (!center) {
    return
  }

  previewPinchStartDistance = getPreviewPointerDistance()
  previewPinchStartScale = previewScale.value
  previewPinchStartOffsetX = previewOffsetX.value
  previewPinchStartOffsetY = previewOffsetY.value
  previewPinchCenterX = center.x
  previewPinchCenterY = center.y
  isPreviewDragging.value = false
  previewDragPointerId = null
}

function handlePreviewPointerDown(event: PointerEvent) {
  if (!isImagePreviewOpen.value) {
    return
  }

  if (event.currentTarget instanceof HTMLElement && typeof event.currentTarget.setPointerCapture === 'function') {
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  updatePreviewPointer(event)

  if (previewPointers.size === 2) {
    startPreviewPinch()
    return
  }

  if (previewPointers.size > 1 || previewScale.value <= 1) {
    return
  }

  previewDragPointerId = event.pointerId
  previewDragStartX = event.clientX
  previewDragStartY = event.clientY
  previewDragOriginOffsetX = previewOffsetX.value
  previewDragOriginOffsetY = previewOffsetY.value
  isPreviewDragging.value = true
}

function handlePreviewPointerMove(event: PointerEvent) {
  if (!previewPointers.has(event.pointerId)) {
    return
  }

  updatePreviewPointer(event)

  if (previewPointers.size >= 2) {
    const center = getPreviewPointerCenter()
    const nextDistance = getPreviewPointerDistance()

    if (!center || !previewPinchStartDistance) {
      return
    }

    const nextScale = clampPreviewScale(previewPinchStartScale * (nextDistance / previewPinchStartDistance))
    const deltaX = center.x - previewPinchCenterX
    const deltaY = center.y - previewPinchCenterY
    const viewport = previewViewportElement.value

    if (!viewport) {
      return
    }

    const rect = viewport.getBoundingClientRect()
    const focalX = center.x - rect.left - rect.width / 2
    const focalY = center.y - rect.top - rect.height / 2
    const scaleRatio = nextScale / previewPinchStartScale
    const nextOffsetX = (previewPinchStartOffsetX - focalX) * scaleRatio + focalX + deltaX
    const nextOffsetY = (previewPinchStartOffsetY - focalY) * scaleRatio + focalY + deltaY

    applyPreviewTransform(nextScale, nextOffsetX, nextOffsetY)
    return
  }

  if (!isPreviewDragging.value || previewDragPointerId !== event.pointerId) {
    return
  }

  const nextOffsetX = previewDragOriginOffsetX + (event.clientX - previewDragStartX)
  const nextOffsetY = previewDragOriginOffsetY + (event.clientY - previewDragStartY)
  applyPreviewTransform(previewScale.value, nextOffsetX, nextOffsetY)
}

function handlePreviewPointerUp(event: PointerEvent) {
  if (event.currentTarget instanceof HTMLElement && typeof event.currentTarget.releasePointerCapture === 'function') {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // 指针已释放时忽略。
    }
  }

  previewPointers.delete(event.pointerId)

  if (previewDragPointerId === event.pointerId) {
    isPreviewDragging.value = false
    previewDragPointerId = null
  }

  if (previewPointers.size >= 2) {
    startPreviewPinch()
    return
  }

  previewPinchStartDistance = 0

  const [remainingPointer] = Array.from(previewPointers.entries())

  if (remainingPointer && previewScale.value > 1) {
    const [pointerId, pointer] = remainingPointer
    previewDragPointerId = pointerId
    previewDragStartX = pointer.x
    previewDragStartY = pointer.y
    previewDragOriginOffsetX = previewOffsetX.value
    previewDragOriginOffsetY = previewOffsetY.value
    isPreviewDragging.value = true
    return
  }

  if (previewScale.value <= 1) {
    applyPreviewTransform(1, 0, 0)
  }
}

function resetPreviewZoom() {
  resetPreviewTransform()
}

function createHistoryId() {
  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatRelativeTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function openHistory(recordId: string) {
  const record = getRecord(recordId)

  if (!record) {
    return
  }

  activeHistoryId.value = record.id
  draftHistoryId.value = record.id
  isSwitchingHistoryRecord.value = true

  try {
    restoreHistorySnapshot({
      sourceImageUrl: record.sourceImageUrl,
      resultImageUrl: record.resultImageUrl,
      prompt: record.prompt,
      status: record.status,
      taskId: record.taskId,
    })

    isRestoringHistory.value = true
    await refreshHistoryAssetUrls(record)
    closeMobileSidebar()
  } finally {
    isRestoringHistory.value = false
    isSwitchingHistoryRecord.value = false
  }
}

function handleNewTask() {
  activeHistoryId.value = ''
  draftHistoryId.value = createHistoryId()
  resetGenerator()
  clearDraft()
  clearPendingReload()
  closeMobileSidebar()
}

async function refreshResultImageUrl(options: {
  sessionId?: string
  taskId?: string
  resultImageUrl: string
}) {
  const persistedResultImageUrl = normalizeHistoryAssetUrl(options.resultImageUrl)

  if (!persistedResultImageUrl) {
    return ''
  }

  if (options.taskId) {
    try {
      const task = await $fetch<{
        status: 'processing' | 'done' | 'failed'
        imageUrl?: string
      }>('/api/task', {
        query: {
          taskId: options.taskId,
          ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        },
      })

      if (task.imageUrl) {
        return task.imageUrl
      }
    } catch {
      // 任务查询失败时继续回退到资源重签名，避免历史图片停留在过期链接。
    }
  }

  if (!isPrivateOssUrl(persistedResultImageUrl)) {
    return persistedResultImageUrl
  }

  const result = await $fetch<{ url: string }>('/api/resource/sign', {
    query: { url: persistedResultImageUrl },
  })

  return result.url
}

function handleDeleteRecord(recordId: string) {
  deleteRecord(recordId)

  if (activeHistoryId.value !== recordId && draftHistoryId.value !== recordId) {
    return
  }

  const latestRecord = getLatestRecord()

  if (latestRecord) {
    openHistory(latestRecord.id)
    return
  }

  handleNewTask()
}

function handleClearRecords() {
  clearRecords()
  handleNewTask()
}

function setupMobileViewportWatcher() {
  mobileViewportQuery = window.matchMedia('(max-width: 1080px)')
  isMobileViewport.value = mobileViewportQuery.matches
  isMobileSidebarOpen.value = false
  bindViewportListener(mobileViewportQuery, handleMobileViewportChange)
}

async function refreshHistoryAssetUrls(record: {
  id: string
  sessionId?: string
  taskId?: string
  prompt: string
  sourceImageUrl: string
  resultImageUrl: string
  status: string
}) {
  const persistedSourceImageUrl = normalizeHistoryAssetUrl(record.sourceImageUrl)
  const persistedResultImageUrl = normalizeHistoryAssetUrl(record.resultImageUrl)
  let nextSourceImageUrl = persistedSourceImageUrl
  let nextResultImageUrl = persistedResultImageUrl

  try {
    if (persistedSourceImageUrl && isPrivateOssUrl(persistedSourceImageUrl)) {
      const source = await $fetch<{ url: string }>('/api/resource/sign', {
        query: { url: persistedSourceImageUrl },
      })

      nextSourceImageUrl = source.url
    }

    if (persistedResultImageUrl) {
      nextResultImageUrl = await refreshResultImageUrl({
        sessionId: record.sessionId,
        taskId: record.taskId,
        resultImageUrl: persistedResultImageUrl,
      })
    }

    restoreHistorySnapshot({
      sourceImageUrl: nextSourceImageUrl,
      resultImageUrl: nextResultImageUrl,
      prompt: record.prompt,
      status: record.status,
      taskId: record.taskId,
    })

    saveRecord({
      id: record.id,
      sessionId: record.sessionId,
      taskId: record.taskId,
      prompt: record.prompt,
      sourceImageUrl: persistedSourceImageUrl,
      resultImageUrl: persistedResultImageUrl,
      status: record.status,
    }, {
      moveToTop: false,
    })
  } catch {
    // 历史记录保底回退到原始快照，不阻断用户查看已有信息。
  } finally {
    isRestoringHistory.value = false
  }
}

function isPrivateOssUrl(url: string) {
  const normalized = url.trim()

  if (!normalized || normalized.includes('OSSAccessKeyId=')) {
    return false
  }

  if (normalized.startsWith('/uploads/')) {
    return true
  }

  try {
    const parsed = new URL(normalized)
    return /^https?:$/i.test(parsed.protocol) && /^\/uploads\//i.test(parsed.pathname)
  } catch {
    return false
  }
}

function normalizeHistoryAssetUrl(url: string) {
  const normalized = url.trim()

  if (!normalized) {
    return ''
  }

  try {
    const parsed = new URL(normalized)

    if (/^\/uploads\//i.test(parsed.pathname)) {
      return parsed.pathname
    }

    return normalized
  } catch {
    return normalized
  }
}

function handleMobileViewportChange(event: MediaQueryListEvent) {
  isMobileViewport.value = event.matches

  if (!event.matches) {
    isMobileSidebarOpen.value = false
  }

  syncMobilePromptOffset()
}

function handleFileSelect(event: Event) {
  if (!draftHistoryId.value || activeHistoryId.value) {
    draftHistoryId.value = createHistoryId()
    activeHistoryId.value = ''
  }

  onFileChange(event)
}

async function handleGenerate() {
  try {
    if (!draftHistoryId.value) {
      draftHistoryId.value = createHistoryId()
    }

    await generateNightImage()
    activeHistoryId.value = draftHistoryId.value

    if (historySourceImageUrl.value || historyResultImageUrl.value) {
      saveRecord({
        id: draftHistoryId.value,
        sessionId: sessionId.value || undefined,
        taskId: currentTaskId.value || undefined,
        prompt: customPrompt.value,
        sourceImageUrl: historySourceImageUrl.value,
        resultImageUrl: historyResultImageUrl.value,
        status: taskStatus.value,
      }, {
        moveToTop: true,
      })
    }
  } catch {
    // 失败状态已由 composable 写入 taskStatus，这里不再使用阻断式弹窗。
  }
}

function restoreImageDraft() {
  const draft = loadDraft()

  if (!draft) {
    draftHistoryId.value = createHistoryId()
    return
  }

  activeHistoryId.value = draft.activeHistoryId
  draftHistoryId.value = draft.draftHistoryId || draft.activeHistoryId || createHistoryId()
  restoreHistorySnapshot({
    activeView: draft.activeView,
    errorMessage: draft.errorMessage,
    loadingText: draft.loadingText,
    prompt: draft.prompt,
    resultImageUrl: draft.resultImageUrl,
    sourceImageUrl: draft.sourceImageUrl,
    status: draft.status,
    taskId: draft.currentTaskId,
  })

  if (draft.currentTaskId && !draft.resultImageUrl && !draft.status.startsWith('失败')) {
    void resumePendingTask(draft.currentTaskId, draft.sessionId)
    return
  }

  if (!draft.sourceImageUrl && !draft.resultImageUrl) {
    return
  }

  isRestoringHistory.value = true
  void (async () => {
    try {
      const nextSourceImageUrl = draft.sourceImageUrl && isPrivateOssUrl(draft.sourceImageUrl)
        ? (await $fetch<{ url: string }>('/api/resource/sign', {
            query: { url: draft.sourceImageUrl },
          })).url
        : draft.sourceImageUrl
      const nextResultImageUrl = draft.resultImageUrl
        ? await refreshResultImageUrl({
            sessionId: draft.sessionId,
            taskId: draft.currentTaskId,
            resultImageUrl: draft.resultImageUrl,
          })
        : ''

      restoreHistorySnapshot({
        activeView: draft.activeView,
        errorMessage: draft.errorMessage,
        loadingText: draft.loadingText,
        prompt: draft.prompt,
        resultImageUrl: nextResultImageUrl,
        sourceImageUrl: nextSourceImageUrl,
        status: draft.status,
        taskId: draft.currentTaskId,
      })
    } catch {
      // 草稿恢复失败时保持本地快照，避免阻断页面加载。
    } finally {
      isRestoringHistory.value = false
    }
  })()
}

function persistImageDraft() {
  const hasDraftContent = Boolean(
    historySourceImageUrl.value
    || historyResultImageUrl.value
    || customPrompt.value.trim()
    || taskStatus.value.trim()
    || currentTaskId.value.trim()
    || lastErrorMessage.value.trim(),
  )

  if (!hasDraftContent) {
    clearDraft()
    return
  }

  saveDraft({
    activeHistoryId: activeHistoryId.value,
    activeView: activeView.value,
    currentTaskId: currentTaskId.value,
    draftHistoryId: draftHistoryId.value,
    errorMessage: lastErrorMessage.value,
    loadingText: loadingText.value,
    prompt: customPrompt.value,
    resultImageUrl: historyResultImageUrl.value,
    sessionId: sessionId.value,
    sourceImageUrl: historySourceImageUrl.value,
    status: taskStatus.value,
    updatedAt: new Date().toISOString(),
  })
}

function bindBeforeUnload() {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('beforeunload', handleBeforeUnload)
}

function handleBeforeUnload() {
  if (isLoading.value) {
    markPendingReload()
    return
  }

  clearPendingReload()
}

function setupPromptShellObserver() {
  if (!window.ResizeObserver) {
    syncMobilePromptOffset()
    return
  }

  promptResizeObserver = new window.ResizeObserver(() => {
    syncMobilePromptOffset()
  })

  if (promptShellElement.value) {
    promptResizeObserver.observe(promptShellElement.value)
  }

  syncMobilePromptOffset()
}

function syncMobilePromptOffset() {
  if (!isMobileViewport.value || !promptShellElement.value) {
    mobilePromptOffset.value = '0px'
    return
  }

  mobilePromptOffset.value = `${Math.ceil(promptShellElement.value.getBoundingClientRect().height)}px`
}

function bindViewportListener(query: MediaQueryList | null, listener: (event: MediaQueryListEvent) => void) {
  if (!query) {
    return
  }

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener)
    return
  }

  const legacyQuery = query as MediaQueryList & {
    addListener?: (callback: (event: MediaQueryListEvent) => void) => void
  }

  if (typeof legacyQuery.addListener === 'function') {
    legacyQuery.addListener(listener)
  }
}

function unbindViewportListener(query: MediaQueryList | null, listener: (event: MediaQueryListEvent) => void) {
  if (!query) {
    return
  }

  if (typeof query.removeEventListener === 'function') {
    query.removeEventListener('change', listener)
    return
  }

  const legacyQuery = query as MediaQueryList & {
    removeListener?: (callback: (event: MediaQueryListEvent) => void) => void
  }

  if (typeof legacyQuery.removeListener === 'function') {
    legacyQuery.removeListener(listener)
  }
}
</script>

<template>
  <section class="image-layout" :class="{ 'image-layout--collapsed': !isSidebarExpanded }">
    <AppSidebarShell
      class="image-sidebar"
      :expanded="isSidebarExpanded"
      :mobile-open="isMobileSidebarOpen"
      subtitle="Night Studio"
      action-label="新建任务"
      collapsed-action-label="+"
      @toggle="toggleSidebar"
      @action="handleNewTask"
      @close-mobile="closeMobileSidebar"
    >
      <RecentRecordsPanel
        title="最近"
        :items="recentRecords"
        :active-id="selectedHistoryId"
        empty-text="暂无生成记录"
        show-clear
        show-delete
        @select="openHistory"
        @delete="handleDeleteRecord"
        @clear="handleClearRecords"
      />
    </AppSidebarShell>

    <main class="image-main" :style="imageMainStyle">
      <div class="image-scroll-region">
        <div class="studio-stage-card">
          <div class="stage-header">
            <div class="stage-title-group">
              <p class="section-label">
                Visual Stage
              </p>
              <h2 class="stage-title">
                {{ stageTitle }}
              </h2>
            </div>

            <div class="stage-tools">
              <div v-if="hasSourceImage" class="view-switch" role="tablist" aria-label="切换预览">
                <button
                  class="view-switch-button ui-button-reset ui-interactive-lift ui-disabled"
                  :class="{ 'view-switch-button--active': activeView === 'source' }"
                  type="button"
                  @click="setActiveView('source')"
                >
                  原图
                </button>
                <button
                  class="view-switch-button ui-button-reset ui-interactive-lift ui-disabled"
                  :class="{ 'view-switch-button--active': activeView === 'result' }"
                  type="button"
                  :disabled="!hasResultImage"
                  @click="setActiveView('result')"
                >
                  夜景
                </button>
              </div>
            </div>
          </div>

          <div class="image-stage" :class="stageFrameClasses">
            <div v-if="isRestoringHistory" class="empty-state empty-state--loading" aria-live="polite">
              <span class="empty-badge">RESTORE</span>
              <strong class="empty-title">正在恢复记录</strong>
              <span class="empty-description">
                正在刷新图片访问地址和任务状态，请稍候。
              </span>
            </div>
            <div v-else-if="displayedImageUrl" class="image-wrapper" :class="imageWrapperClasses">
              <button
                class="stage-image-button ui-button-reset"
                type="button"
                :aria-label="`点击预览${stageTitle}`"
                @click="openImagePreview"
              >
                <img :src="displayedImageUrl" :alt="stageTitle" class="stage-image">
              </button>

              <div v-if="isLoading && hasSourceImage" class="curtain-overlay" aria-hidden="true">
                <div class="curtain-sweep" />
                <div class="curtain-glow" />
                <div class="curtain-caption">
                  {{ loadingText }}
                </div>
              </div>

              <button
                v-if="hasResultImage && activeView === 'result'"
                class="download-float-button"
                aria-label="下载成片"
                type="button"
                @click.stop="downloadResult"
              >
                <span class="download-float-button__icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20">
                    <path
                      d="M10 3.75v8.5m0 0 3-3m-3 3-3-3m-3 5.25h12"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.7"
                    />
                  </svg>
                </span>
              </button>
            </div>

            <label v-else class="empty-state" for="source-file-input">
              <span class="empty-badge">NIGHT</span>
              <strong class="empty-title">拖入或上传一张白天参考图</strong>
              <span class="empty-description">
                建议选择主体清晰、透视明确的商业街景或建筑立面，以获得更稳定、更真实的夜景表达。
              </span>
            </label>
          </div>

          <div v-if="taskStatus" class="stage-footer">
            <p
              v-if="taskStatus"
              class="status-inline"
              :class="`status-inline--${statusVariant}`"
              aria-live="polite"
            >
              <span class="status-inline-dot" aria-hidden="true" />
              <span>{{ taskStatus }}</span>
            </p>

            <p v-if="isFailed && lastErrorMessage" class="status-detail status-detail--error">
              请检查图片访问权限、额度配置或稍后重试。
              <span class="status-detail-meta">{{ lastErrorMessage }}</span>
            </p>
          </div>
        </div>
        <div ref="promptShellElement" class="prompt-shell">
          <section class="prompt-card">
            <div class="prompt-header">
            <p class="section-label">
              Prompt Composer
            </p>
          </div>

          <textarea
            v-model="customPrompt"
            class="prompt-textarea"
            :class="{ 'prompt-textarea--error': isPromptTooLong }"
            placeholder="请描述你想要的夜景气质..."
          />

          <div class="prompt-meta">
            <p class="prompt-meta-count" :class="{ 'prompt-meta-count--error': isPromptTooLong }">
              {{ trimmedPromptLength }} / {{ MAX_CUSTOM_PROMPT_LENGTH }}
            </p>
          </div>

          <div class="prompt-actions">
            <button
              class="primary-button ui-button-reset ui-interactive-lift ui-disabled"
              type="button"
              :disabled="isLoading || isRestoringHistory || isPromptTooLong"
              @click="handleGenerate"
            >
              {{ primaryActionLabel }}
            </button>
          </div>

          <input
            id="source-file-input"
            class="visually-hidden"
            type="file"
            accept="image/*"
            @change="handleFileSelect"
          >
          </section>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <div
        v-if="isImagePreviewOpen && previewImageUrl"
        class="image-preview-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="previewImageTitle"
        @click.self="closeImagePreview"
      >
        <button
          class="image-preview-close ui-button-reset"
          type="button"
          aria-label="关闭预览"
          @click="closeImagePreview"
        >
          ×
        </button>

        <figure class="image-preview-frame">
          <div
            ref="previewViewportElement"
            class="image-preview-viewport"
            :class="{ 'image-preview-viewport--dragging': isPreviewDragging }"
            @wheel.prevent="handlePreviewWheel"
          >
            <img
              ref="previewImageElement"
              :src="previewImageUrl"
              :alt="previewImageTitle"
              class="image-preview-image"
              :style="previewTransformStyle"
              @pointerdown="handlePreviewPointerDown"
              @pointermove="handlePreviewPointerMove"
              @pointerup="handlePreviewPointerUp"
              @pointercancel="handlePreviewPointerUp"
            >
          </div>
        </figure>

        <figcaption class="image-preview-caption">
          {{ previewImageTitle }}
          <span class="image-preview-caption-meta">{{ previewScaleLabel }}</span>
        </figcaption>

        <button
          v-if="previewScale > 1"
          class="image-preview-reset ui-button-reset"
          type="button"
          aria-label="重置缩放"
          @click="resetPreviewZoom"
        >
          重置
        </button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.image-layout {
  position: relative;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 16px;
  background:
    radial-gradient(circle at top left, rgba(255, 244, 214, 0.4), transparent 22%),
    rgba(250, 250, 249, 0.72);
  box-shadow:
    0 24px 80px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(18px);
  transition:
    grid-template-columns 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.image-layout--collapsed {
  grid-template-columns: 88px minmax(0, 1fr);
}

.image-sidebar {
  background:
    linear-gradient(180deg, rgba(248, 247, 244, 0.96), rgba(240, 238, 233, 0.92)),
    rgba(244, 244, 245, 0.92);
}

.image-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.88), transparent 40%),
    rgba(250, 250, 249, 0.9);
}

.image-scroll-region {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px 16px 12px;
}

.studio-stage-card,
.prompt-card {
  position: relative;
  overflow: hidden;
  padding: 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.76)),
    rgba(255, 255, 255, 0.78);
  box-shadow:
    0 24px 80px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
}

.prompt-shell {
  flex-shrink: 0;
  padding-top: 16px;
  background: linear-gradient(180deg, rgba(250, 250, 249, 0), rgba(250, 250, 249, 0.96) 32%);
}

.section-label {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.stage-title {
  margin: 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  letter-spacing: -0.02em;
}

.stage-header,
.stage-tools,
.prompt-header,
.prompt-actions {
  display: flex;
  align-items: center;
}

.stage-header,
.prompt-header {
  justify-content: space-between;
  gap: 16px;
}

.stage-tools,
.prompt-actions {
  gap: 12px;
}

.stage-title {
  font-size: clamp(24px, 3vw, 28px);
  line-height: 1.15;
}

.image-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(62vh, 720px);
  margin-top: 24px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(250, 250, 249, 0.88), rgba(229, 231, 235, 0.82)),
    #f5f5f4;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.image-wrapper {
  position: relative;
  width: 100%;
  height: 420px;
}

.stage-image-button {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  cursor: zoom-in;
}

.image-wrapper--result {
  background: #080b13;
}

.image-wrapper--reveal::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(5, 8, 18, 0.92), rgba(8, 11, 19, 0.82) 42%, rgba(8, 11, 19, 0));
  box-shadow: 12px 0 32px rgba(251, 191, 36, 0.18);
  content: '';
  pointer-events: none;
  animation: resultRevealSweep 2.2s cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
}

.image-wrapper--reveal::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(251, 191, 36, 0), rgba(251, 191, 36, 0.22), rgba(255, 248, 220, 0));
  content: '';
  pointer-events: none;
  animation: resultRevealHighlight 2.2s cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
}

.stage-image {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 820px;
  object-fit: contain;
}

.stage-image-button:focus-visible {
  outline: 2px solid rgba(245, 158, 11, 0.88);
  outline-offset: -2px;
}

.image-stage--loading {
  background:
    radial-gradient(circle at top, rgba(255, 237, 213, 0.32), transparent 42%),
    linear-gradient(180deg, rgba(250, 250, 249, 0.88), rgba(229, 231, 235, 0.82)),
    #f5f5f4;
}

.curtain-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.curtain-sweep {
  position: relative;
  width: 68%;
  min-width: 360px;
  height: 100%;
  background:
    linear-gradient(180deg, rgba(10, 12, 24, 0.96), rgba(30, 20, 30, 0.84)),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.09) 0,
      rgba(255, 255, 255, 0.09) 18px,
      rgba(10, 15, 26, 0) 18px,
      rgba(10, 15, 26, 0) 28px
    );
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.28);
  animation: curtainSweepAcross 5.4s cubic-bezier(0.18, 0.82, 0.16, 1) infinite;
}

.curtain-sweep::after {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 24px;
  background:
    linear-gradient(180deg, rgba(251, 191, 36, 0.56), rgba(251, 191, 36, 0.14)),
    linear-gradient(90deg, rgba(255, 248, 220, 0.7), rgba(255, 248, 220, 0));
  content: '';
  box-shadow: 0 0 26px rgba(251, 191, 36, 0.24);
}

.curtain-sweep::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.18));
  content: '';
}

.curtain-glow {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 22%;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0), rgba(245, 158, 11, 0.24), rgba(245, 158, 11, 0));
  filter: blur(18px);
  animation: curtainGlowAcross 5.4s cubic-bezier(0.18, 0.82, 0.16, 1) infinite;
}

.curtain-caption {
  position: absolute;
  left: 50%;
  bottom: 28px;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(8, 14, 28, 0.52);
  color: #f8fafc;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.empty-state {
  display: flex;
  width: min(520px, 100%);
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
}

.empty-state--loading {
  cursor: default;
}

.empty-badge {
  padding: 8px 14px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #111827;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
}

.empty-title {
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  font-size: 30px;
  line-height: 1.3;
}

.empty-description {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.9;
}

.stage-footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  margin-top: 18px;
}

.status-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin: 0;
  color: #57534e;
  font-size: 13px;
  line-height: 1.7;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(circle at top, rgba(245, 158, 11, 0.12), transparent 24%),
    rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(12px);
}

.image-preview-frame {
  position: relative;
  z-index: 1;
  display: flex;
  max-width: min(92vw, 1440px);
  max-height: calc(88vh - 72px);
  margin: 0;
  flex-direction: column;
}

.image-preview-viewport {
  position: relative;
  z-index: 1;
  display: flex;
  max-width: min(92vw, 1440px);
  max-height: calc(88vh - 72px);
  align-items: center;
  justify-content: center;
  border-radius: 24px;
  cursor: grab;
  touch-action: none;
}

.image-preview-viewport--dragging {
  cursor: grabbing;
}

.image-preview-image {
  position: relative;
  z-index: 1;
  display: block;
  max-width: 100%;
  max-height: calc(88vh - 72px);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow:
    0 28px 72px rgba(0, 0, 0, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.08s ease-out;
  user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
}

.image-preview-caption {
  position: absolute;
  left: 50%;
  bottom: 20px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  max-width: min(calc(100vw - 40px), 720px);
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(16px);
  color: rgba(248, 250, 252, 0.88);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-align: center;
  text-transform: uppercase;
  transform: translateX(-50%);
  pointer-events: none;
}

.image-preview-caption-meta {
  color: rgba(248, 250, 252, 0.64);
  font-size: 11px;
}

.image-preview-close {
  position: absolute;
  z-index: 4;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
}

.image-preview-close:hover,
.image-preview-close:focus-visible {
  background: rgba(30, 41, 59, 0.92);
  transform: scale(1.04);
}

.image-preview-reset {
  position: absolute;
  z-index: 4;
  right: 76px;
  top: 20px;
  min-width: 64px;
  height: 44px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  font-size: 12px;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
  text-transform: uppercase;
}

.image-preview-reset:hover,
.image-preview-reset:focus-visible {
  background: rgba(30, 41, 59, 0.92);
  transform: scale(1.04);
}

.status-inline-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
  box-shadow: 0 0 0 6px rgba(120, 113, 108, 0.08);
}

.status-inline--neutral,
.status-inline--info {
  color: #57534e;
}

.status-inline--success {
  color: #047857;
}

.status-inline--success .status-inline-dot {
  box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.12);
}

.status-inline--error {
  color: #b45309;
}

.status-inline--error .status-inline-dot {
  box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.12);
}

.status-detail {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.7;
}

.status-detail--error {
  color: #92400e;
}

.status-detail-meta {
  display: block;
  margin-top: 4px;
  color: #b45309;
  word-break: break-word;
}

.view-switch {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
}

.view-switch-button {
  padding: 10px 14px;
  border-radius: 999px;
  background: transparent;
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
}

.view-switch-button--active {
  background: #fff;
  color: #111827;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.prompt-textarea {
  width: 100%;
  min-height: 92px;
  border: none;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 15px;
  line-height: 1.9;
  resize: none;
  outline: none;
}

.prompt-textarea--error {
  color: #9a3412;
}

.prompt-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 10px;
}

.prompt-meta-count {
  margin: 0;
  color: #78716c;
  font-size: 12px;
  line-height: 1.5;
}

.prompt-meta-count {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.prompt-meta-count--error {
  color: #b45309;
}

.ghost-button {
  padding: 12px 16px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #1f2937;
  font-size: 14px;
}

.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 32px;
  border-radius: 999px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 14px 30px rgba(17, 24, 39, 0.16);
}

.prompt-actions {
  justify-content: center;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
}

.download-float-button {
  position: absolute;
  right: 14px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(8, 12, 22, 0.36);
  color: #f8fafc;
  cursor: pointer;
  opacity: 0.58;
  backdrop-filter: blur(16px);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.download-float-button:hover {
  transform: translateY(-2px);
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(8, 12, 22, 0.76);
  opacity: 1;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.2);
}

.download-float-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.download-float-button__icon svg {
  width: 16px;
  height: 16px;
}

@keyframes curtainSweepAcross {
  0% {
    transform: translateX(-112%);
  }

  22% {
    transform: translateX(-96%);
  }

  100% {
    transform: translateX(158%);
  }
}

@keyframes curtainGlowAcross {
  0% {
    transform: translateX(-120%);
    opacity: 0;
  }

  18% {
    opacity: 0.16;
  }

  48% {
    opacity: 0.48;
  }

  100% {
    transform: translateX(300%);
    opacity: 0.72;
  }
}

@keyframes resultRevealSweep {
  0% {
    transform: translateX(0);
    opacity: 1;
  }

  78% {
    transform: translateX(76%);
    opacity: 1;
  }

  100% {
    transform: translateX(110%);
    opacity: 0;
  }
}

@keyframes resultRevealHighlight {
  0% {
    transform: translateX(-34%);
    opacity: 0;
  }

  24% {
    opacity: 1;
  }

  84% {
    transform: translateX(82%);
    opacity: 1;
  }

  100% {
    transform: translateX(108%);
    opacity: 0;
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1080px) {
  .image-layout {
    grid-template-columns: 1fr;
  }

  .image-scroll-region {
    padding-bottom: calc(var(--mobile-prompt-offset, 0px) + 16px);
  }

  .prompt-shell {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    background:
      linear-gradient(180deg, rgba(250, 250, 249, 0), rgba(250, 250, 249, 0.96) 26%, rgba(250, 250, 249, 1) 100%);
    pointer-events: none;
  }

  .prompt-card {
    pointer-events: auto;
  }

  .image-sidebar {
    border-right: none;
    border-bottom: none;
  }
}

@media (max-width: 960px) {
  .stage-header,
  .prompt-header,
  .stage-footer {
    align-items: flex-start;
  }

  .stage-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .prompt-actions {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .image-scroll-region {
    padding: 16px 12px calc(var(--mobile-prompt-offset, 0px) + 16px);
  }

  .prompt-shell {
    padding-right: 12px;
    padding-left: 12px;
  }

  .studio-stage-card,
  .prompt-card {
    padding: 20px;
    border-radius: 24px;
  }

  .stage-title,
  .empty-title {
    font-size: 24px;
  }

  .image-stage {
    min-height: 340px;
    border-radius: 22px;
  }

  .download-float-button {
    right: 10px;
    bottom: 2px;
  }

  .prompt-textarea {
    min-height: 42px;
  }

  .primary-button,
  .ghost-button {
    width: 100%;
  }
}
</style>
