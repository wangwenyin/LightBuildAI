<script setup lang="ts">
import AppSidebarShell from '~/components/shared/AppSidebarShell.vue'
import RecentRecordsPanel from '~/components/shared/RecentRecordsPanel.vue'
import { useLocalChatDraft } from '~/composables/useLocalChatDraft'
import { usePendingReloadResume } from '~/composables/usePendingReloadResume'
import { useLocalChatHistory } from '~/composables/useLocalChatHistory'
import { useWorkspaceBridge } from '~/composables/useWorkspaceBridge'
import { useTaskCenter, type TrackedTask } from '~/composables/useTaskCenter'
import { useClientSession } from '~/composables/useClientSession'

import type { AgentStep, AgentStreamEvent, ChatResponsePayload } from '~/shared/agent'

const props = withDefaults(defineProps<{
  mobileSidebarOpen?: boolean
}>(), {
  mobileSidebarOpen: false,
})

const emit = defineEmits<{
  'update:mobileSidebarOpen': [value: boolean]
  'switch-tab': [value: 'image' | 'chat']
}>()

const { handoffToImageStudio: handoffToImageStudioBridge, pendingFeedback, consumeImageResult } = useWorkspaceBridge()
const { trackTask, onTaskUpdate, tasks: trackedTasks } = useTaskCenter()
/** taskId → 消息 id，用于把统一任务源的更新写回对应消息卡片 */
const chatTaskLinks = ref<Record<string, string>>({})
let unsubscribeTaskUpdate: (() => void) | null = null

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  steps?: AgentStep[]
}

type ChatResponse = ChatResponsePayload

type MessageBlock =
  | { type: 'heading', level: 1 | 2 | 3, content: string }
  | { type: 'paragraph', content: string }
  | { type: 'list', items: string[] }
  | { type: 'quote', content: string }
  | { type: 'divider' }
  | { type: 'code', content: string }

type HeadingBlock = Extract<MessageBlock, { type: 'heading' }>
type ListBlock = Extract<MessageBlock, { type: 'list' }>

const inputMessage = shallowRef('')
const isLoading = shallowRef(false)
const errorMessage = shallowRef('')
/** 步数预算用尽提示（非错误，附在消息上展示） */
const stepLimitNotice = shallowRef('')
const currentModel = shallowRef('')
const currentRequestId = shallowRef('')
const messages = ref<ChatMessage[]>([])
const messageListRef = shallowRef<HTMLDivElement | null>(null)
const composerInputRef = shallowRef<HTMLTextAreaElement | null>(null)
const activeSessionId = shallowRef('')
const lastSubmittedMessage = shallowRef('')
const isSidebarExpanded = shallowRef(true)
const isMobileViewport = shallowRef(false)
const isChatStreamOverflowing = shallowRef(false)
const isComposing = shallowRef(false)
let chatStreamResizeObserver: ResizeObserver | null = null
let chatStreamMutationObserver: MutationObserver | null = null
let mobileViewportQuery: MediaQueryList | null = null
const { clearSessions, deleteSession, getLatestSession, getSession, loadSessions, saveSession, sessions } = useLocalChatHistory()
const { clearDraft, loadDraft, saveDraft } = useLocalChatDraft()
const { clearPendingReload, consumePendingReload, markPendingReload } = usePendingReloadResume('chat')

const canSend = computed(() => Boolean(inputMessage.value.trim()) && !isLoading.value)
const hasConversation = computed(() => messages.value.length > 0)
const chatStreamClasses = computed(() => ({
  'chat-stream--scrollable': isChatStreamOverflowing.value,
}))
const recentSessions = computed(() => sessions.value.map(session => ({
  id: session.id,
  title: session.title,
  subtitle: session.preview,
  meta: formatRelativeTime(session.updatedAt),
})))
const isMobileSidebarOpen = computed({
  get: () => props.mobileSidebarOpen,
  set: value => emit('update:mobileSidebarOpen', value),
})

watch(
  () => [messages.value.length, isLoading.value],
  async () => {
    await nextTick()
    const container = messageListRef.value

    if (!container) {
      return
    }

    updateChatStreamOverflow()

    if (isChatStreamOverflowing.value) {
      container.scrollTop = container.scrollHeight
    }
  },
)

onMounted(() => {
  setupMobileViewportWatcher()
  loadSessions()
  bindBeforeUnload()

  // 订阅统一任务源：无论任务从哪提交，成图后这里都能把消息卡片刷新（P0-1 / P0-3）
  unsubscribeTaskUpdate = onTaskUpdate(handleTrackedTaskUpdate)

  if (consumePendingReload()) {
    restoreChatDraft()
  } else {
    clearDraft()
    activeSessionId.value = createSessionId()
  }

  nextTick(() => {
    setupChatStreamObservers()
    updateChatStreamOverflow()
  })
})

onBeforeUnmount(() => {
  unsubscribeTaskUpdate?.()
  unsubscribeTaskUpdate = null
  chatStreamResizeObserver?.disconnect()
  chatStreamMutationObserver?.disconnect()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('resize', scheduleChatStreamMeasure)
  unbindViewportListener(mobileViewportQuery, handleMobileViewportChange)
})

/** 统一任务源更新 → 找到对应消息并回写卡片 */
function handleTrackedTaskUpdate(task: TrackedTask) {
  const messageId = chatTaskLinks.value[task.taskId]

  if (!messageId) {
    return
  }

  const message = messages.value.find(item => item.id === messageId)

  if (message) {
    applyTaskResultToMessage(message, task)
  }
}

/** 生成面板出图完成后的回流（P0-3）：更新对应消息，或提示用户 */
function applyImageResultFeedback() {
  const feedback = consumeImageResult()

  if (!feedback) {
    return
  }

  const linkedId = chatTaskLinks.value[feedback.taskId]
  const tracked = trackedTasks.value[feedback.taskId]

  if (!linkedId) {
    // 聊天里没发起过这个任务（用户在生成面板自己出的图）：不打扰，仅记录
    if (tracked && tracked.origin !== 'image-studio') {
      return
    }

    return
  }

  const message = messages.value.find(item => item.id === linkedId)

  if (message && tracked) {
    applyTaskResultToMessage(message, tracked)
  }
}

// 生成面板回流时同步更新（KeepAlive 下组件可能未卸载，用 watch 而不是 onActivated）
watch(pendingFeedback, () => {
  applyImageResultFeedback()
})

onActivated(() => {
  applyImageResultFeedback()
})

watch(
  () => [
    activeSessionId.value,
    currentModel.value,
    currentRequestId.value,
    errorMessage.value,
    inputMessage.value,
    isLoading.value,
    lastSubmittedMessage.value,
    messages.value,
  ],
  () => {
    persistChatDraft()
  },
  { deep: true },
)

function clearConversation() {
  activeSessionId.value = createSessionId()
  messages.value = []
  currentRequestId.value = ''
  currentModel.value = ''
  errorMessage.value = ''
  inputMessage.value = ''
  lastSubmittedMessage.value = ''
  clearDraft()
  clearPendingReload()
  scheduleChatStreamMeasure()
  closeMobileSidebar()
}

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

function handleDeleteSession(sessionId: string) {
  deleteSession(sessionId)

  if (activeSessionId.value !== sessionId) {
    return
  }

  const latestSession = getLatestSession()

  if (latestSession) {
    openSession(latestSession.id)
    return
  }

  clearConversation()
}

function handleClearSessions() {
  clearSessions()
  clearConversation()
}

const liveEvents = shallowRef<AgentStreamEvent[]>([])

/** 把最新的流式事件翻译成一句人能看懂的进度提示 */
const liveStatusText = computed(() => {
  const events = liveEvents.value

  if (events.length === 0) {
    return ''
  }

  const last = events[events.length - 1]!

  if (last.type === 'start') {
    return '正在连接模型…'
  }

  if (last.type === 'iteration') {
    return `第 ${last.index} 轮推理…`
  }

  if (last.type === 'tool') {
    return `正在执行：${getToolLabel(last.name)}`
  }

  if (last.type === 'rewrite') {
    return `自检未通过，正在重写（第 ${last.attempt} 次）`
  }

  if (last.type === 'thought') {
    return '正在思考…'
  }

  // 已在输出正文时，不再显示状态条（正文本身可见）
  return ''
})

async function sendMessage(messageOverride?: string) {
  const liveInputValue = composerInputRef.value?.value ?? inputMessage.value
  const text = (messageOverride ?? liveInputValue).trim()

  if (!text || isLoading.value) {
    return
  }

  const history = messages.value.map(({ role, content }) => ({ role, content }))
  messages.value.push({
    id: createMessageId(),
    role: 'user',
    content: text,
  })
  lastSubmittedMessage.value = text
  if (!messageOverride) {
    inputMessage.value = ''
  }
  isLoading.value = true
  errorMessage.value = ''
  stepLimitNotice.value = ''
  liveEvents.value = []
  saveSession(activeSessionId.value || createSessionId(), messages.value)

  // 预置一条空的 assistant 消息，流式过程中原地填充
  const assistantId = createMessageId()
  messages.value.push({
    id: assistantId,
    role: 'assistant',
    content: '',
    steps: [],
  })
  const assistantMessage = messages.value[messages.value.length - 1]!

  try {
    await streamChat({ message: text, history }, {
      onEvent: (payload) => {
        liveEvents.value = [...liveEvents.value, payload]

        if (payload.type === 'delta') {
          assistantMessage.content += payload.text
          return
        }

        if (payload.type === 'thought' || payload.type === 'tool') {
          assistantMessage.steps = [...(assistantMessage.steps ?? []), payload]
          return
        }

        if (payload.type === 'done') {
          // 以服务端汇总为准，保证落库内容完整一致
          assistantMessage.content = payload.reply
          assistantMessage.steps = payload.steps ?? assistantMessage.steps
          currentModel.value = payload.model
          currentRequestId.value = payload.requestId ?? ''

          // Agent 若已提交出图任务，登记到统一状态源继续追踪到成图（P0-1）
          trackGenerationFromMessage(assistantMessage)

          // 步数达到上限：这是「提示」而非「错误」——结论通常已经可用
          if (payload.truncated) {
            stepLimitNotice.value = `本次推理用满了 ${payload.iterations} 步预算，结论已尽量给全。如需更完整的推演，可以再追问一句让它继续。`
          } else {
            stepLimitNotice.value = ''
          }
        }
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '发送失败，请稍后重试'
    errorMessage.value = message

    if (!assistantMessage.content) {
      // 没拿到任何内容就失败了，移除占位消息，避免留空气泡
      messages.value = messages.value.filter(item => item.id !== assistantId)
    }
  } finally {
    saveSession(activeSessionId.value || createSessionId(), messages.value)
    isLoading.value = false
  }
}

/** 解析 SSE 流（fetch + ReadableStream） */
async function streamChat(
  body: { message: string, history: Array<{ role: string, content: string }> },
  handlers: { onEvent: (event: AgentStreamEvent) => void },
) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok || !response.body) {
    let detail = ''

    try {
      const payload = await response.json()
      detail = payload?.statusMessage || payload?.message || ''
    } catch {
      detail = ''
    }

    throw new Error(detail || `请求失败（${response.status}）`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      const dataLine = frame
        .split('\n')
        .find(line => line.startsWith('data:'))

      if (!dataLine) {
        continue
      }

      try {
        handlers.onEvent(JSON.parse(dataLine.slice(5).trim()) as AgentStreamEvent)
      } catch {
        // 忽略无法解析的帧
      }
    }
  }
}

function retryLastMessage() {
  if (!lastSubmittedMessage.value || isLoading.value) {
    return
  }

  void sendMessage(lastSubmittedMessage.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !isComposing.value) {
    event.preventDefault()
    void sendMessage()
  }
}

function handleSubmit() {
  if (isComposing.value) {
    return
  }

  void sendMessage()
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createSessionId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function openSession(sessionId: string) {
  const session = getSession(sessionId)

  if (!session) {
    return
  }

  activeSessionId.value = session.id
  messages.value = session.messages.map(message => ({ ...message }))
  inputMessage.value = ''
  currentModel.value = ''
  currentRequestId.value = ''
  errorMessage.value = ''
  isLoading.value = false
  lastSubmittedMessage.value = ''
  closeMobileSidebar()
  nextTick(() => {
    setupChatStreamObservers()
    updateChatStreamOverflow()
  })
}

function restoreChatDraft() {
  const draft = loadDraft()

  if (!draft) {
    activeSessionId.value = createSessionId()
    return
  }

  activeSessionId.value = draft.activeSessionId || createSessionId()
  currentModel.value = draft.currentModel
  currentRequestId.value = draft.currentRequestId
  inputMessage.value = draft.inputMessage
  lastSubmittedMessage.value = draft.lastSubmittedMessage
  messages.value = draft.messages.map(message => ({ ...message }))

  if (draft.isLoading) {
    isLoading.value = false
    errorMessage.value = draft.errorMessage || '页面刷新后，上一次请求已中断，请重新发送上一条消息。'
    saveSession(activeSessionId.value, messages.value)
    return
  }

  isLoading.value = false
  errorMessage.value = draft.errorMessage
}

function persistChatDraft() {
  const hasDraftContent = Boolean(
    inputMessage.value.trim()
    || lastSubmittedMessage.value.trim()
    || messages.value.length
    || errorMessage.value.trim()
    || currentModel.value.trim()
    || currentRequestId.value.trim(),
  )

  if (!hasDraftContent) {
    clearDraft()
    return
  }

  saveDraft({
    activeSessionId: activeSessionId.value,
    currentModel: currentModel.value,
    currentRequestId: currentRequestId.value,
    errorMessage: errorMessage.value,
    inputMessage: inputMessage.value,
    isLoading: isLoading.value,
    lastSubmittedMessage: lastSubmittedMessage.value,
    messages: messages.value.map(message => ({ ...message })),
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

function setupMobileViewportWatcher() {
  mobileViewportQuery = window.matchMedia('(max-width: 1080px)')
  isMobileViewport.value = mobileViewportQuery.matches
  isMobileSidebarOpen.value = false
  bindViewportListener(mobileViewportQuery, handleMobileViewportChange)
}

function handleMobileViewportChange(event: MediaQueryListEvent) {
  isMobileViewport.value = event.matches

  if (!event.matches) {
    isMobileSidebarOpen.value = false
  }
}

function setupChatStreamObservers() {
  const container = messageListRef.value

  if (!container) {
    return
  }

  chatStreamResizeObserver?.disconnect()
  chatStreamMutationObserver?.disconnect()

  chatStreamResizeObserver = new ResizeObserver(scheduleChatStreamMeasure)
  chatStreamResizeObserver.observe(container)

  chatStreamMutationObserver = new MutationObserver(scheduleChatStreamMeasure)
  chatStreamMutationObserver.observe(container, {
    childList: true,
    characterData: true,
    subtree: true,
  })

  window.removeEventListener('resize', scheduleChatStreamMeasure)
  window.addEventListener('resize', scheduleChatStreamMeasure)
}

function scheduleChatStreamMeasure() {
  window.requestAnimationFrame(updateChatStreamOverflow)
}

function updateChatStreamOverflow() {
  const container = messageListRef.value

  if (!container) {
    isChatStreamOverflowing.value = false
    return
  }

  isChatStreamOverflowing.value = container.scrollHeight - container.clientHeight > 1
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

function formatInlineParts(content: string) {
  const parts: Array<{ type: 'text' | 'strong' | 'code', content: string }> = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0

  for (const match of content.matchAll(pattern)) {
    const matchedText = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, index),
      })
    }

    if (matchedText.startsWith('`')) {
      parts.push({
        type: 'code',
        content: matchedText.slice(1, -1),
      })
    } else {
      parts.push({
        type: 'strong',
        content: matchedText.slice(2, -2),
      })
    }

    lastIndex = index + matchedText.length
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex),
    })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }]
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const normalized = content.replace(/\r\n/g, '\n').trim()

  if (!normalized) {
    return [{ type: 'paragraph', content: '' }]
  }

  const segments = normalized.split('\n\n')

  return segments.map((segment) => {
    const trimmed = segment.trim()

    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
      return {
        type: 'code',
        content: trimmed.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, ''),
      }
    }

    if (/^---+$/.test(trimmed) || /^___+$/.test(trimmed)) {
      return { type: 'divider' }
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)

    if (headingMatch) {
      return {
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2],
      }
    }

    if (trimmed.split('\n').every(line => line.trim().startsWith('>'))) {
      return {
        type: 'quote',
        content: trimmed.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n'),
      }
    }

    const listItems = trimmed
      .split('\n')
      .map(item => item.trim())
      .filter(item => /^([-*]|\d+\.)\s+/.test(item))
      .map(item => item.replace(/^([-*]|\d+\.)\s+/, ''))

    if (listItems.length > 0 && listItems.length === trimmed.split('\n').filter(Boolean).length) {
      return {
        type: 'list',
        items: listItems,
      }
    }

    return {
      type: 'paragraph',
      content: trimmed,
    }
  })
}

function isHeadingBlock(block: MessageBlock): block is HeadingBlock {
  return block.type === 'heading'
}

function isListBlock(block: MessageBlock): block is ListBlock {
  return block.type === 'list'
}

/* ---------------- 提示词代码块的三个 action（P1-5） ---------------- */

/** 记录「刚刚复制成功」的代码块 key，用于给出瞬时反馈 */
const copiedBlockKey = shallowRef('')
let copiedBlockTimer: number | null = null

/** 正在就地编辑的代码块 key 与其草稿内容 */
const editingBlockKey = shallowRef('')
const editingBlockDraft = shallowRef('')

function isPromptBlock(block: MessageBlock, message: ChatMessage) {
  // 只把「最终回答里的代码块」当作提示词候选，避免对普通代码片段误报
  return block.type === 'code'
    && Boolean(block.content.trim())
    && message.role === 'assistant'
    && block.content.trim().length >= 20
}

/** 取代码块内容（模板里用于类型收窄，避免直接访问联合类型的字段） */
function getCodeBlockContent(block: MessageBlock) {
  return block.type === 'code' ? block.content : ''
}

async function copyPromptBlock(key: string, content: string) {
  try {
    await navigator.clipboard.writeText(content)
  } catch {
    // 剪贴板不可用（如非安全上下文）时降级为选中文本，仍让用户能手动复制
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  copiedBlockKey.value = key

  if (copiedBlockTimer) {
    window.clearTimeout(copiedBlockTimer)
  }

  copiedBlockTimer = window.setTimeout(() => {
    copiedBlockKey.value = ''
    copiedBlockTimer = null
  }, 1800)
}

function startEditPromptBlock(key: string, content: string) {
  editingBlockKey.value = key
  editingBlockDraft.value = content
}

function cancelEditPromptBlock() {
  editingBlockKey.value = ''
  editingBlockDraft.value = ''
}

/** 「编辑后发送」：把改好的提示词作为新一轮用户输入发出去，让 Agent 重新自检 */
function submitEditedPromptBlock() {
  const draft = editingBlockDraft.value.trim()

  if (!draft) {
    return
  }

  cancelEditPromptBlock()
  void sendMessage(`这是我调整后的提示词，请重新自检并给出最终版本：\n\n${draft}`)
}

/** 「用这条出图」：直接把这个代码块的内容送到统一任务源出图 */
async function generateFromPromptBlock(message: ChatMessage, content: string) {
  const key = `${message.id}-inline`

  if (inlineGeneratingBlockKey.value) {
    return
  }

  inlineGeneratingBlockKey.value = key
  inlineGenerateError.value = ''

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: content.trim(), origin: 'chat-inline' }),
    })

    const body = await response.json().catch(() => null) as Record<string, unknown> | null

    if (!response.ok) {
      throw new Error(typeof body?.message === 'string' ? body.message : `出图请求失败 (${response.status})`)
    }

    const taskId = typeof body?.taskId === 'string' ? body.taskId : ''
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : ''

    if (!taskId && !imageUrl) {
      throw new Error('出图服务未返回任务信息，请稍后重试')
    }

    message.steps = [
      ...(message.steps || []),
      {
        type: 'tool',
        name: 'generate_night_image',
        args: { prompt: content.trim() },
        result: { ...(body || {}), taskId, imageUrl, status: body?.status ?? 'submitted', origin: 'chat-inline', enabled: true },
        ok: true,
        durationMs: 0,
      },
    ]

    if (taskId) {
      trackTask({
        taskId,
        origin: 'chat-inline',
        prompt: content.trim(),
        sessionId: useClientSession().sessionId.value,
        imageUrl,
      })
      chatTaskLinks.value = { ...chatTaskLinks.value, [taskId]: message.id }
    }
  } catch (error) {
    inlineGenerateError.value = error instanceof Error ? error.message : '出图失败，请稍后重试'
  } finally {
    inlineGeneratingBlockKey.value = ''
  }
}

function getHeadingTag(block: HeadingBlock) {
  return block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
}

const TOOL_LABELS: Record<string, string> = {
  get_prompt_guide: '检索提示词规范',
  compose_night_prompt: '组装夜景提示词',
  review_night_prompt: '自检提示词',
  generate_night_image: '触发夜景渲染',
}

function getToolLabel(name: string) {
  return TOOL_LABELS[name] || name
}

function countToolSteps(steps?: AgentStep[]) {
  return steps ? steps.filter(step => step.type === 'tool').length : 0
}

/** 从消息的步骤里提取「Agent 出图」结果（若本次对话触发了出图） */
function extractGeneration(steps?: AgentStep[]) {
  if (!steps) {
    return null
  }

  const toolStep = [...steps]
    .reverse()
    .find(step => step.type === 'tool' && step.name === 'generate_night_image')

  if (!toolStep || toolStep.type !== 'tool') {
    return null
  }

  const result = toolStep.result as Record<string, unknown> | null

  if (!result || typeof result !== 'object') {
    return null
  }

  return {
    enabled: result.enabled !== false,
    ok: toolStep.ok,
    taskId: typeof result.taskId === 'string' ? result.taskId : '',
    status: typeof result.status === 'string' ? result.status : '',
    imageUrl: typeof result.imageUrl === 'string' ? result.imageUrl : '',
    provider: typeof result.provider === 'string' ? result.provider : '',
    message: typeof result.message === 'string' ? result.message : '',
    error: typeof result.error === 'string' ? result.error : '',
    /** 出图来源：聊天内点按钮补出图时标记为 chat-inline，便于跨 tab 交接时区分 */
    origin: typeof result.origin === 'string' ? result.origin : '',
  }
}

/** 从消息步骤里提取 Agent 最终产出的提示词文本（代码块优先） */
function extractPromptText(steps?: AgentStep[]) {
  const finalStep = steps ? [...steps].reverse().find(step => step.type === 'final' && step.text) : null

  if (!finalStep || finalStep.type !== 'final') {
    return ''
  }

  const match = finalStep.text.match(/```[a-z]*\n?([\s\S]*?)```/i)

  return match?.[1]?.trim() || ''
}

/** 把 Agent 的成果带到「夜景生成」tab 继续操作 */
function handoffToImageStudio(message: ChatMessage) {
  const generation = extractGeneration(message.steps)

  handoffGenerationToImageStudio({
    generation,
    prompt: extractPromptText(message.steps),
    origin: generation?.origin === 'chat-inline' ? 'chat-inline' : 'chat-agent',
  })
}

function handoffGenerationToImageStudio(payload: {
  generation: ReturnType<typeof extractGeneration>
  prompt: string
  origin: 'chat-agent' | 'chat-inline'
}) {
  const { generation, prompt, origin } = payload

  handoffToImageStudioBridge({
    prompt: prompt || undefined,
    taskId: generation?.taskId || undefined,
    imageUrl: generation?.imageUrl || undefined,
    source: origin,
  })
  emit('switch-tab', 'image')
}

type GenerationCardView = {
  variant: 'done' | 'failed' | 'running' | 'submitted'
  badge: string
  taskId: string
  imageUrl: string
  provider: string
  statusLabel: string
  note: string
}

/**
 * 出图结果卡片的展示模型：**以统一任务状态源为准**，
 * 没有任务记录时回退到消息 steps 里的工具结果（P0-1 的关键衔接点）。
 */
function resolveGenerationCard(message: ChatMessage): GenerationCardView | null {
  const fromSteps = extractGeneration(message.steps)

  if (!fromSteps) {
    return null
  }

  const tracked = fromSteps.taskId ? trackedTasks.value[fromSteps.taskId] : null

  const taskId = tracked?.taskId || fromSteps.taskId
  const imageUrl = tracked?.imageUrl || fromSteps.imageUrl
  const status = tracked?.status || fromSteps.status
  const statusText = tracked?.statusText || ''
  const error = tracked?.errorMessage || fromSteps.error

  if (status === 'failed') {
    return {
      variant: 'failed',
      badge: '渲染失败',
      taskId,
      imageUrl: '',
      provider: fromSteps.provider,
      statusLabel: statusText || '失败',
      note: error || '渲染未成功，可稍后重试或调整提示词。',
    }
  }

  if (imageUrl) {
    return {
      variant: 'done',
      badge: '渲染完成',
      taskId,
      imageUrl,
      provider: fromSteps.provider,
      statusLabel: statusText || '已完成',
      note: '',
    }
  }

  if (taskId) {
    return {
      variant: 'running',
      badge: '渲染中',
      taskId,
      imageUrl: '',
      provider: fromSteps.provider,
      statusLabel: statusText || '渲染中…',
      note: '成图后会自动出现在这里，也可以切到「夜景生成」查看完整进度。',
    }
  }

  return {
    variant: 'submitted',
    badge: '未出图',
    taskId: '',
    imageUrl: '',
    provider: '',
    statusLabel: '',
    note: fromSteps.message || '本次没有触发出图，可在下方直接用提示词渲染。',
  }
}

/** 直接在聊天里出图（Agent 未触发时，用最终提示词就地补一次） */
const isInlineGenerating = shallowRef(false)
/** 正在「用这条出图」的代码块 key（P1-5） */
const inlineGeneratingBlockKey = shallowRef('')
const inlineGenerateError = shallowRef('')

async function generateInlineFromMessage(message: ChatMessage) {
  const prompt = extractPromptText(message.steps) || message.content

  if (!prompt.trim() || isInlineGenerating.value) {
    return
  }

  isInlineGenerating.value = true
  inlineGenerateError.value = ''

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
    })

    const body = await response.json().catch(() => null) as Record<string, unknown> | null

    if (!response.ok) {
      throw new Error(typeof body?.message === 'string' ? body.message : `出图请求失败 (${response.status})`)
    }

    const taskId = typeof body?.taskId === 'string' ? body.taskId : ''
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : ''

    if (!taskId && !imageUrl) {
      throw new Error('出图服务未返回任务信息，请稍后重试')
    }

    message.steps = [
      ...(message.steps || []),
      {
        type: 'tool',
        name: 'generate_night_image',
        args: { prompt: prompt.trim() },
        result: { ...(body || {}), taskId, imageUrl, status: body?.status ?? 'submitted', origin: 'chat-inline', enabled: true },
        ok: true,
        durationMs: 0,
      },
    ]

    // 登记到统一任务状态源，由它负责轮询到成图（P0-1）
    if (taskId) {
      const tracked = trackTask({
        taskId,
        origin: 'chat-inline',
        prompt: prompt.trim(),
        sessionId: useClientSession().sessionId.value,
        imageUrl,
      })

      chatTaskLinks.value = {
        ...chatTaskLinks.value,
        [taskId]: message.id,
      }

      if (tracked.status === 'done' && tracked.imageUrl) {
        applyTaskResultToMessage(message, tracked)
      }
    }
  } catch (error) {
    inlineGenerateError.value = error instanceof Error ? error.message : '出图失败，请稍后重试'
  } finally {
    isInlineGenerating.value = false
  }
}

/** 把统一任务源里的最新结果写回某条消息的 steps，让卡片实时反映进度（P0-1） */
function applyTaskResultToMessage(message: ChatMessage, task: TrackedTask) {
  const steps = [...(message.steps || [])]
  const index = steps.findIndex(
    step => step.type === 'tool'
      && step.name === 'generate_night_image'
      && (step.result as Record<string, unknown> | null)?.taskId === task.taskId,
  )

  const patch = {
    taskId: task.taskId,
    status: task.status,
    imageUrl: task.imageUrl,
    statusText: task.statusText,
    error: task.status === 'failed' ? task.errorMessage : '',
  }

  if (index >= 0) {
    const step = steps[index]!

    if (step.type === 'tool') {
      steps[index] = {
        ...step,
        ok: task.status !== 'failed',
        result: { ...(step.result as Record<string, unknown> || {}), ...patch },
      }
    }
  } else {
    steps.push({
      type: 'tool',
      name: 'generate_night_image',
      args: { prompt: task.prompt },
      result: { ...patch, enabled: true },
      ok: task.status !== 'failed',
      durationMs: 0,
    })
  }

  message.steps = steps
}

/** 从 Agent 的 steps 里找出它这次提交的出图任务，并登记到统一状态源（P0-1） */
function trackGenerationFromMessage(message: ChatMessage) {
  const generation = extractGeneration(message.steps)

  if (!generation?.taskId) {
    return
  }

  const tracked = trackTask({
    taskId: generation.taskId,
    origin: 'chat-agent',
    prompt: extractPromptText(message.steps),
    sessionId: useClientSession().sessionId.value,
    imageUrl: generation.imageUrl,
  })

  chatTaskLinks.value = {
    ...chatTaskLinks.value,
    [generation.taskId]: message.id,
  }

  if (tracked.status === 'done' && tracked.imageUrl) {
    applyTaskResultToMessage(message, tracked)
  }
}

function summarizeStepResult(step: AgentStep) {
  if (step.type !== 'tool') {
    return ''
  }

  const result = step.result

  if (!result || typeof result !== 'object') {
    return String(result ?? '')
  }

  const record = result as Record<string, unknown>

  if (typeof record.error === 'string') {
    return `错误：${record.error}`
  }

  if (record.enabled === false && typeof record.message === 'string') {
    return record.message
  }

  const parts: string[] = []

  if (typeof record.score === 'number') {
    parts.push(`得分 ${record.score}`)
  }

  if (Array.isArray(record.missing) && record.missing.length > 0) {
    parts.push(`缺失 ${record.missing.length} 项`)
  }

  if (typeof record.taskId === 'string') {
    parts.push(`任务 ${record.taskId}`)
  }

  if (typeof record.status === 'string') {
    parts.push(`状态 ${record.status}`)
  }

  if (parts.length === 0) {
    const text = JSON.stringify(result)
    return text.length > 120 ? `${text.slice(0, 120)}...` : text
  }

  return parts.join(' · ')
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
  <section class="chat-layout" :class="{ 'chat-layout--collapsed': !isSidebarExpanded }">
    <AppSidebarShell
      class="chat-sidebar"
      :expanded="isSidebarExpanded"
      :mobile-open="isMobileSidebarOpen"
      subtitle="Chat Studio"
      action-label="新建聊天"
      collapsed-action-label="+"
      @toggle="toggleSidebar"
      @action="clearConversation"
      @close-mobile="closeMobileSidebar"
    >
      <RecentRecordsPanel
        title="最近"
        :items="recentSessions"
        :active-id="activeSessionId"
        empty-text="暂无聊天记录"
        show-clear
        show-delete
        @select="openSession"
        @delete="handleDeleteSession"
        @clear="handleClearSessions"
      />

      <template #footer>
        <p v-if="currentRequestId" class="sidebar-request">
          Request ID: {{ currentRequestId }}
        </p>
        <p class="sidebar-meta">
          {{ currentModel || 'TokenHub Chat' }}
        </p>
      </template>
    </AppSidebarShell>

    <main class="chat-main">
      <div ref="messageListRef" class="chat-stream" :class="chatStreamClasses">
        <div v-if="!hasConversation" class="chat-welcome">
          <p class="welcome-kicker">
            LIGHTBUILD CONVERSATION
          </p>
          <h1 class="welcome-title">
            今天想一起打磨哪一段夜景表达？
          </h1>
          <p class="welcome-description">
            描述你的夜景需求：我会先检索提示词规范，再组装成完整提示词并做自检，最后把可直接使用的结果给你。
          </p>
        </div>

        <div v-else class="message-thread">
          <article
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="`message-row--${message.role}`"
          >
            <div class="message-avatar">
              {{ message.role === 'assistant' ? 'LB' : '你' }}
            </div>
            <div class="message-bubble">
              <details
                v-if="message.role === 'assistant' && message.steps && message.steps.length"
                class="agent-trace"
              >
                <summary class="agent-trace__summary">
                  思考过程 · {{ countToolSteps(message.steps) }} 次工具调用
                </summary>
                <ol class="agent-trace__list">
                  <li
                    v-for="(step, stepIndex) in message.steps"
                    :key="`${message.id}-step-${stepIndex}`"
                    class="agent-trace__item"
                  >
                    <template v-if="step.type === 'thought'">
                      <span class="agent-trace__badge">思考</span>
                      <span class="agent-trace__text">{{ step.text }}</span>
                    </template>
                    <template v-else-if="step.type === 'tool'">
                      <span class="agent-trace__badge" :class="{ 'agent-trace__badge--error': !step.ok }">
                        {{ step.ok ? '工具' : '失败' }}
                      </span>
                      <span class="agent-trace__text">
                        <strong>{{ getToolLabel(step.name) }}</strong>
                        <em class="agent-trace__meta">{{ step.durationMs }}ms</em>
                        <span class="agent-trace__result">{{ summarizeStepResult(step) }}</span>
                      </span>
                    </template>
                    <template v-else-if="step.type === 'rewrite'">
                      <span class="agent-trace__badge agent-trace__badge--rewrite">重写</span>
                      <span class="agent-trace__text">
                        自检未通过，第 {{ step.attempt }} 次回炉
                        <span class="agent-trace__result">{{ step.reason }}</span>
                      </span>
                    </template>
                    <template v-else-if="step.type === 'final'">
                      <span class="agent-trace__badge agent-trace__badge--final">结论</span>
                      <span class="agent-trace__text">已给出最终回答</span>
                    </template>
                  </li>
                </ol>
              </details>

              <template v-for="(block, blockIndex) in parseMessageBlocks(message.content)" :key="`${message.id}-${blockIndex}`">
                <component
                  v-if="isHeadingBlock(block)"
                  :is="getHeadingTag(block)"
                  class="message-heading"
                >
                  {{ block.content }}
                </component>
                <blockquote v-else-if="block.type === 'quote'" class="message-quote">
                  {{ block.content }}
                </blockquote>
                <hr v-else-if="block.type === 'divider'" class="message-divider">
                <p v-else-if="block.type === 'paragraph'" class="message-content">
                  <template v-for="(part, partIndex) in formatInlineParts(block.content)" :key="`${message.id}-${blockIndex}-${partIndex}`">
                    <strong v-if="part.type === 'strong'" class="message-strong">{{ part.content }}</strong>
                    <code v-else-if="part.type === 'code'" class="message-inline-code">{{ part.content }}</code>
                    <template v-else>{{ part.content }}</template>
                  </template>
                </p>
                <ul v-else-if="isListBlock(block)" class="message-list-block">
                  <li v-for="item in block.items" :key="item" class="message-list-item">
                    <template v-for="(part, partIndex) in formatInlineParts(item)" :key="`${item}-${partIndex}`">
                      <strong v-if="part.type === 'strong'" class="message-strong">{{ part.content }}</strong>
                      <code v-else-if="part.type === 'code'" class="message-inline-code">{{ part.content }}</code>
                      <template v-else>{{ part.content }}</template>
                    </template>
                  </li>
                </ul>
                <pre v-else class="message-code-block"><code>{{ block.content }}</code></pre>

                <!-- 提示词代码块：复制 / 编辑后发送 / 用这条出图（P1-5） -->
                <div
                  v-if="isPromptBlock(block, message)"
                  class="prompt-actions"
                >
                  <div class="prompt-actions__bar">
                    <span class="prompt-actions__label">提示词</span>

                    <button
                      class="prompt-actions__button ui-button-reset"
                      type="button"
                      @click="copyPromptBlock(`${message.id}-${blockIndex}`, getCodeBlockContent(block))"
                    >
                      {{ copiedBlockKey === `${message.id}-${blockIndex}` ? '已复制 ✓' : '复制' }}
                    </button>

                    <button
                      class="prompt-actions__button ui-button-reset"
                      type="button"
                      @click="editingBlockKey === `${message.id}-${blockIndex}`
                        ? cancelEditPromptBlock()
                        : startEditPromptBlock(`${message.id}-${blockIndex}`, getCodeBlockContent(block))"
                    >
                      {{ editingBlockKey === `${message.id}-${blockIndex}` ? '取消编辑' : '编辑后发送' }}
                    </button>

                    <button
                      class="prompt-actions__button prompt-actions__button--primary ui-button-reset"
                      type="button"
                      :disabled="Boolean(inlineGeneratingBlockKey)"
                      @click="generateFromPromptBlock(message, getCodeBlockContent(block))"
                    >
                      {{ inlineGeneratingBlockKey === `${message.id}-inline` ? '正在出图…' : '用这条出图' }}
                    </button>
                  </div>

                  <div
                    v-if="editingBlockKey === `${message.id}-${blockIndex}`"
                    class="prompt-actions__editor"
                  >
                    <textarea
                      v-model="editingBlockDraft"
                      class="prompt-actions__textarea"
                      rows="6"
                      placeholder="在这里调整提示词，发送后 Agent 会重新自检"
                    />
                    <div class="prompt-actions__editor-footer">
                      <span class="prompt-actions__hint">{{ editingBlockDraft.trim().length }} 字</span>
                      <button
                        class="prompt-actions__button prompt-actions__button--primary ui-button-reset"
                        type="button"
                        :disabled="!editingBlockDraft.trim() || isLoading"
                        @click="submitEditedPromptBlock"
                      >
                        发送调整
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <section
                v-if="message.role === 'assistant' && resolveGenerationCard(message)"
                class="generation-card"
              >
                <header class="generation-card__head">
                  <span
                    class="generation-card__badge"
                    :class="{
                      'generation-card__badge--live': resolveGenerationCard(message)!.variant === 'done',
                      'generation-card__badge--error': resolveGenerationCard(message)!.variant === 'failed',
                    }"
                  >
                    {{ resolveGenerationCard(message)!.badge }}
                  </span>
                  <span class="generation-card__title">夜景渲染</span>
                  <span
                    v-if="resolveGenerationCard(message)!.variant === 'running'"
                    class="generation-card__spinner"
                    aria-hidden="true"
                  />
                </header>

                <a
                  v-if="resolveGenerationCard(message)!.imageUrl"
                  class="generation-card__preview"
                  :href="resolveGenerationCard(message)!.imageUrl"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <img :src="resolveGenerationCard(message)!.imageUrl" alt="Agent 出图结果">
                </a>

                <div v-else-if="resolveGenerationCard(message)!.variant === 'running'" class="generation-card__skeleton">
                  <span class="generation-card__skeleton-line" />
                  <span class="generation-card__skeleton-line generation-card__skeleton-line--short" />
                </div>

                <dl class="generation-card__meta">
                  <div v-if="resolveGenerationCard(message)!.taskId" class="generation-card__meta-row">
                    <dt>任务 ID</dt>
                    <dd>{{ resolveGenerationCard(message)!.taskId }}</dd>
                  </div>
                  <div v-if="resolveGenerationCard(message)!.statusLabel" class="generation-card__meta-row">
                    <dt>状态</dt>
                    <dd>{{ resolveGenerationCard(message)!.statusLabel }}</dd>
                  </div>
                  <div v-if="resolveGenerationCard(message)!.provider" class="generation-card__meta-row">
                    <dt>通道</dt>
                    <dd>{{ resolveGenerationCard(message)!.provider }}</dd>
                  </div>
                </dl>

                <p
                  v-if="resolveGenerationCard(message)!.note"
                  class="generation-card__note"
                  :class="{ 'generation-card__note--error': resolveGenerationCard(message)!.variant === 'failed' }"
                >
                  {{ resolveGenerationCard(message)!.note }}
                </p>

                <div class="generation-card__actions">
                  <button
                    class="generation-card__button generation-card__button--primary ui-button-reset"
                    type="button"
                    @click="handoffToImageStudio(message)"
                  >
                    {{ resolveGenerationCard(message)!.variant === 'done' ? '在「夜景生成」中查看' : '去「夜景生成」查看进度' }}
                  </button>
                  <a
                    v-if="resolveGenerationCard(message)!.imageUrl"
                    class="generation-card__button ui-button-reset"
                    :href="resolveGenerationCard(message)!.imageUrl"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    查看原图
                  </a>
                  <a
                    v-if="resolveGenerationCard(message)!.imageUrl"
                    class="generation-card__button ui-button-reset"
                    :href="resolveGenerationCard(message)!.imageUrl"
                    download
                    rel="noreferrer noopener"
                  >
                    下载成图
                  </a>
                </div>
              </section>

              <section
                v-else-if="message.role === 'assistant' && !isLoading && extractPromptText(message.steps)"
                class="generation-card generation-card--prompt"
              >
                <header class="generation-card__head">
                  <span class="generation-card__badge">提示词就绪</span>
                  <span class="generation-card__title">这条提示词还没有渲染</span>
                </header>

                <p class="generation-card__note">
                  Agent 已给出自检通过的提示词，但本次没有触发出图。可以直接在这里渲染，或带到「夜景生成」里微调参数。
                </p>

                <p v-if="inlineGenerateError" class="generation-card__note generation-card__note--error">
                  {{ inlineGenerateError }}
                </p>

                <div class="generation-card__actions">
                  <button
                    class="generation-card__button generation-card__button--primary ui-button-reset"
                    type="button"
                    :disabled="isInlineGenerating"
                    @click="generateInlineFromMessage(message)"
                  >
                    {{ isInlineGenerating ? '正在渲染…' : '直接出图' }}
                  </button>
                  <button
                    class="generation-card__button ui-button-reset"
                    type="button"
                    @click="handoffToImageStudio(message)"
                  >
                    去「夜景生成」微调
                  </button>
                </div>
              </section>

              <p
                v-if="message.role === 'assistant' && stepLimitNotice"
                class="step-limit-notice"
              >
                <span class="step-limit-notice__badge">步数提醒</span>
                <span>{{ stepLimitNotice }}</span>
              </p>
            </div>
          </article>

          <div v-if="isLoading" class="message-row message-row--assistant">
            <div class="message-avatar">
              LB
            </div>
            <div class="message-bubble message-bubble--loading">
              <template v-if="liveStatusText">
                <span class="live-status">{{ liveStatusText }}</span>
              </template>
              <template v-else>
                <span class="typing-dot" />
                <span class="typing-dot" />
                <span class="typing-dot" />
              </template>
            </div>
          </div>
        </div>
      </div>

      <form class="composer-shell" @submit.prevent="handleSubmit">
        <p v-if="errorMessage" class="composer-error">
          {{ errorMessage }}
        </p>
        <button
          v-if="errorMessage && lastSubmittedMessage && !isLoading"
          class="composer-retry ui-button-reset"
          type="button"
          @click="retryLastMessage"
        >
          重新发送上一条
        </button>

        <div class="composer-card">
          <textarea
            ref="composerInputRef"
            v-model="inputMessage"
            class="composer-input"
            rows="1"
            placeholder="给 LightBuild AI 发送消息"
            @keydown="handleKeydown"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
          />

          <div class="composer-footer">
            <p class="composer-tip">
              Enter 发送，Shift + Enter 换行
            </p>

            <button
              class="send-button ui-button-reset ui-interactive-lift ui-disabled"
              type="submit"
              :disabled="!canSend"
            >
              {{ isLoading ? '发送中...' : '发送' }}
            </button>
          </div>
        </div>
      </form>
    </main>
  </section>
</template>

<style scoped>
.chat-layout {
  position: relative;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 16px;
  background: rgba(250, 250, 249, 0.72);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
  transition:
    grid-template-columns 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.chat-layout--collapsed {
  grid-template-columns: 88px minmax(0, 1fr);
}

.chat-sidebar {
  background: rgba(244, 244, 245, 0.92);
}

.brand-subtitle,
.sidebar-request,
.sidebar-meta,
.composer-tip,
.composer-error,
.welcome-kicker,
.welcome-description {
  margin: 0;
  color: #6b7280;
}

.brand-subtitle,
.sidebar-request,
.sidebar-meta,
.composer-tip,
.composer-error,
.welcome-description {
  font-size: 12px;
  line-height: 1.7;
}

.sidebar-request,
.sidebar-meta {
  width: 100%;
  text-align: center;
}

.sidebar-meta {
  margin-top: auto;
}

.welcome-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.chat-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.88), transparent 40%),
    rgba(250, 250, 249, 0.9);
}

.chat-stream {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 40px 24px 20px;
}

.chat-stream--scrollable {
  overflow-x: hidden;
  overflow-y: auto;
}

.chat-welcome,
.message-thread,
.composer-shell {
  width: min(860px, 100%);
  margin: 0 auto;
}

.chat-welcome {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding: 32px 0;
}

.welcome-title {
  margin: 14px 0 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  font-size: clamp(34px, 5vw, 28px);
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.welcome-description {
  max-width: 760px;
  margin-top: 18px;
}

.message-thread {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 24px;
}

.message-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.message-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: rgba(17, 24, 39, 0.08);
  color: #111827;
  font-size: 13px;
  font-weight: 700;
}

.message-row--user .message-avatar {
  background: #111827;
  color: #f9fafb;
}

.message-bubble {
  padding: 12px 16px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.84);
}

.message-row--assistant .message-bubble {
  background: transparent;
  border-color: transparent;
  padding-left: 0;
  padding-right: 0;
}

.message-row--user .message-bubble {
  background: #ffffff;
}

.message-content {
  margin: 0;
  color: #111827;
  font-size: 15px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-content + .message-content,
.message-heading + .message-content,
.message-content + .message-heading,
.message-heading + .message-list-block,
.message-list-block + .message-heading,
.message-divider + .message-content,
.message-content + .message-divider,
.message-quote + .message-content,
.message-content + .message-quote,
.message-content + .message-list-block,
.message-list-block + .message-content,
.message-code-block + .message-content,
.message-content + .message-code-block,
.message-heading + .message-code-block,
.message-code-block + .message-heading {
  margin-top: 14px;
}

.message-heading {
  margin: 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  line-height: 1.35;
  letter-spacing: -0.02em;
}

.message-heading:is(h2) {
  font-size: 26px;
}

.message-heading:is(h3) {
  font-size: 21px;
}

.message-heading:is(h4) {
  font-size: 18px;
}

.message-list-block {
  margin: 0;
  padding-left: 20px;
  color: #111827;
}

.message-list-item {
  margin: 0;
  font-size: 15px;
  line-height: 1.9;
}

.message-list-item + .message-list-item {
  margin-top: 4px;
}

.message-code-block {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 16px;
  background: rgba(17, 24, 39, 0.04);
  color: #111827;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---- 提示词代码块 action bar（P1-5） ---- */
.prompt-actions {
  margin: 8px 0 4px;
}

.prompt-actions__bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 12px;
  background: #fafaf9;
}

.prompt-actions__label {
  margin-right: 2px;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.prompt-actions__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 11px;
  border: 1px solid rgba(17, 24, 39, 0.12);
  border-radius: 999px;
  background: #ffffff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
}

.prompt-actions__button:hover:not(:disabled) {
  border-color: rgba(17, 24, 39, 0.28);
  background: #f3f4f6;
}

.prompt-actions__button:disabled {
  opacity: 0.55;
  cursor: progress;
}

.prompt-actions__button--primary {
  border-color: transparent;
  background: #111827;
  color: #ffffff;
}

.prompt-actions__button--primary:hover:not(:disabled) {
  background: #1f2937;
}

.prompt-actions__editor {
  margin-top: 8px;
  padding: 10px;
  border: 1px dashed rgba(17, 24, 39, 0.16);
  border-radius: 12px;
  background: #ffffff;
}

.prompt-actions__textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid rgba(17, 24, 39, 0.12);
  border-radius: 10px;
  background: #fafaf9;
  color: #111827;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.65;
  resize: vertical;
}

.prompt-actions__textarea:focus {
  outline: none;
  border-color: rgba(17, 24, 39, 0.32);
  background: #ffffff;
}

.prompt-actions__editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.prompt-actions__hint {
  color: #9ca3af;
  font-size: 12px;
}

.message-quote {  margin: 0;
  padding: 12px 16px;
  border-left: 3px solid rgba(17, 24, 39, 0.18);
  background: rgba(17, 24, 39, 0.03);
  color: #374151;
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
}

.message-divider {
  margin: 0;
  border: none;
  border-top: 1px solid rgba(17, 24, 39, 0.1);
}

.message-strong {
  font-weight: 700;
}

.message-inline-code {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.04);
  color: #111827;
  font-size: 0.92em;
}

.agent-trace {
  margin-bottom: 14px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 14px;
  background: rgba(17, 24, 39, 0.02);
}

.agent-trace__summary {
  padding: 10px 14px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  user-select: none;
}

.agent-trace__list {
  margin: 0;
  padding: 0 14px 12px;
  list-style: none;
}

.agent-trace__item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 5px 0;
  color: #374151;
  font-size: 12.5px;
  line-height: 1.7;
}

.agent-trace__item + .agent-trace__item {
  border-top: 1px dashed rgba(17, 24, 39, 0.06);
}

.agent-trace__badge {
  flex-shrink: 0;
  min-width: 38px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.08);
  color: #111827;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.agent-trace__badge--error {
  background: rgba(185, 28, 28, 0.12);
  color: #b91c1c;
}

.agent-trace__badge--final {
  background: rgba(21, 128, 61, 0.12);
  color: #15803d;
}

.agent-trace__badge--rewrite {
  background: rgba(180, 83, 9, 0.12);
  color: #b45309;
}

.agent-trace__text {
  min-width: 0;
}

.agent-trace__meta {
  margin-left: 6px;
  color: #9ca3af;
  font-size: 11px;
  font-style: normal;
}

.agent-trace__result {
  display: block;
  color: #6b7280;
  word-break: break-word;
}

.message-bubble--loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.generation-card {
  margin-top: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #fafaf9);
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04);
}

.generation-card--prompt {
  border-style: dashed;
  background: #fafaf9;
}

.step-limit-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  padding: 9px 12px;
  border: 1px solid rgba(180, 83, 9, 0.22);
  border-radius: 10px;
  background: rgba(251, 191, 36, 0.09);
  color: #78350f;
  font-size: 12.5px;
  line-height: 1.6;
}

.step-limit-notice__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(180, 83, 9, 0.14);
  color: #92400e;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.generation-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.generation-card__badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
  color: #4b5563;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.generation-card__badge--live {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.generation-card__badge--error {
  background: rgba(185, 28, 28, 0.1);
  color: #b91c1c;
}

.generation-card__title {
  color: #111827;
  font-size: 13px;
  font-weight: 600;
}

.generation-card__preview {
  display: block;
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 10px;
  background: #0b0b0f;
}

.generation-card__preview img {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: contain;
}

.generation-card__spinner {
  width: 12px;
  height: 12px;
  margin-left: auto;
  border: 2px solid rgba(17, 24, 39, 0.14);
  border-top-color: #6b7280;
  border-radius: 999px;
  animation: generation-card-spin 0.8s linear infinite;
}

@keyframes generation-card-spin {
  to { transform: rotate(360deg); }
}

.generation-card__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 18px 16px;
  border: 1px dashed rgba(17, 24, 39, 0.12);
  border-radius: 10px;
  background: #f9fafb;
}

.generation-card__skeleton-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(17,24,39,0.06), rgba(17,24,39,0.12), rgba(17,24,39,0.06));
  background-size: 200% 100%;
  animation: generation-card-shimmer 1.4s ease-in-out infinite;
}

.generation-card__skeleton-line--short {
  width: 52%;
}

@keyframes generation-card-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.generation-card__meta {
  display: grid;
  gap: 6px;
  margin: 0 0 12px;
}

.generation-card__meta-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.generation-card__meta-row dt {
  flex-shrink: 0;
  width: 56px;
  color: #9ca3af;
  font-size: 12px;
}

.generation-card__meta-row dd {
  margin: 0;
  color: #374151;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.generation-card__note {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.generation-card__note--error {
  color: #b91c1c;
}

.generation-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.generation-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(17, 24, 39, 0.14);
  border-radius: 999px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.18s ease, background 0.18s ease, opacity 0.18s ease;
}

.generation-card__button:hover:not(:disabled) {
  border-color: rgba(17, 24, 39, 0.3);
  background: #f9fafb;
}

.generation-card__button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.generation-card__button--primary {
  border-color: transparent;
  background: #111827;
  color: #ffffff;
}

.generation-card__button--primary:hover:not(:disabled) {
  background: #1f2937;
}

.live-status {
  color: #6b7280;
  font-size: 13px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.34);
  animation: pulse 1.1s ease-in-out infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.16s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.32s;
}

.composer-shell {
  flex-shrink: 0;
  padding: 0 24px 24px;
  background: linear-gradient(180deg, rgba(250, 250, 249, 0), rgba(250, 250, 249, 0.96) 32%);
}

.composer-error {
  margin-bottom: 10px;
  color: #b91c1c;
}

.composer-retry {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  margin-bottom: 10px;
  padding: 0 12px;
  border: 1px solid rgba(185, 28, 28, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #991b1b;
  font-size: 12px;
  font-weight: 600;
}

.composer-card {
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px);
}

.composer-input {
  width: 100%;
  min-height: 92px;
  padding: 20px 22px 12px;
  border: none;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 15px;
  line-height: 1.8;
  resize: none;
  outline: none;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 16px 18px;
}

.send-button {
  min-width: 88px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.28;
    transform: scale(0.9);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 1080px) {
  .chat-layout {
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .chat-layout--collapsed {
    grid-template-columns: 1fr;
  }

  .chat-sidebar {
    border-right: none;
    border-bottom: none;
  }

}

@media (max-width: 640px) {
  .chat-layout {
    min-height: auto;
    border-radius: 8px;
  }

  .chat-sidebar,
  .chat-stream,
  .composer-shell {
    padding-left: 16px;
    padding-right: 16px;
  }

  .chat-stream {
    padding-top: 24px;
  }

  .welcome-title {
    font-size: 24px;
  }

  .composer-card {
    border-radius: 22px;
  }

  .composer-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .send-button {
    width: 100%;
  }
}
</style>
