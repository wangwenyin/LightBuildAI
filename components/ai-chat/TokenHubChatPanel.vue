<script setup lang="ts">
import RecentRecordsPanel from '~/components/shared/RecentRecordsPanel.vue'
import { useLocalChatHistory, type LocalChatMessage } from '~/composables/useLocalChatHistory'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

type ChatResponse = {
  reply: string
  model: string
  requestId?: string
}

type MessageBlock =
  | { type: 'heading', level: 1 | 2 | 3, content: string }
  | { type: 'paragraph', content: string }
  | { type: 'list', items: string[] }
  | { type: 'quote', content: string }
  | { type: 'divider' }
  | { type: 'code', content: string }

const inputMessage = shallowRef('')
const isLoading = shallowRef(false)
const errorMessage = shallowRef('')
const currentModel = shallowRef('')
const currentRequestId = shallowRef('')
const messages = ref<ChatMessage[]>([])
const messageListRef = useTemplateRef<HTMLDivElement>('messageListRef')
const activeSessionId = shallowRef('')
const isSidebarExpanded = shallowRef(true)
const isChatStreamOverflowing = shallowRef(false)
let chatStreamResizeObserver: ResizeObserver | null = null
let chatStreamMutationObserver: MutationObserver | null = null
const { clearSessions, deleteSession, getLatestSession, getSession, loadSessions, saveSession, sessions } = useLocalChatHistory()

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
  loadSessions()

  const latestSession = getLatestSession()

  if (latestSession) {
    openSession(latestSession.id)
    return
  }

  activeSessionId.value = createSessionId()

  nextTick(() => {
    setupChatStreamObservers()
    updateChatStreamOverflow()
  })
})

onBeforeUnmount(() => {
  chatStreamResizeObserver?.disconnect()
  chatStreamMutationObserver?.disconnect()
  window.removeEventListener('resize', scheduleChatStreamMeasure)
})

function clearConversation() {
  activeSessionId.value = createSessionId()
  messages.value = []
  currentRequestId.value = ''
  currentModel.value = ''
  errorMessage.value = ''
  scheduleChatStreamMeasure()
}

function toggleSidebar() {
  isSidebarExpanded.value = !isSidebarExpanded.value
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

async function sendMessage() {
  const text = inputMessage.value.trim()

  if (!text || isLoading.value) {
    return
  }

  const history = messages.value.map(({ role, content }) => ({ role, content }))
  messages.value.push({
    id: createMessageId(),
    role: 'user',
    content: text,
  })
  inputMessage.value = ''
  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body: {
        message: text,
        history,
      },
    })

    currentModel.value = response.model
    currentRequestId.value = response.requestId ?? ''
    messages.value.push({
      id: createMessageId(),
      role: 'assistant',
      content: response.reply,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '发送失败，请稍后重试'
    errorMessage.value = message
    messages.value.push({
      id: createMessageId(),
      role: 'assistant',
      content: `当前请求失败：${message}`,
    })
  } finally {
    saveSession(activeSessionId.value || createSessionId(), messages.value as LocalChatMessage[])
    isLoading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendMessage()
  }
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
  errorMessage.value = ''
  nextTick(() => {
    setupChatStreamObservers()
    updateChatStreamOverflow()
  })
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
</script>

<template>
  <section class="chat-layout" :class="{ 'chat-layout--collapsed': !isSidebarExpanded }">
    <aside class="chat-sidebar">
      <div class="sidebar-top">
        <div class="sidebar-brand" :class="{ 'sidebar-brand--collapsed': !isSidebarExpanded }">
          <div class="brand-mark">
            LB
          </div>

          <div v-if="isSidebarExpanded" class="brand-copy">
            <p class="brand-name">LightBuild</p>
            <p class="brand-subtitle">Chat Studio</p>
          </div>
        </div>

        <button
          class="sidebar-toggle"
          :class="{ 'sidebar-toggle--collapsed': !isSidebarExpanded }"
          type="button"
          :aria-label="isSidebarExpanded ? '收起侧边栏' : '展开侧边栏'"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5.75 6.75h12.5M5.75 12h12.5M5.75 17.25h12.5M8.75 4.75 5.25 8l3.5 3.25"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
          </svg>
        </button>
      </div>

      <button class="new-chat-button" type="button" @click="clearConversation">
        <svg v-if="!isSidebarExpanded" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.8"
          />
        </svg>
        <span v-else>新建聊天</span>
      </button>

      <RecentRecordsPanel
        v-if="isSidebarExpanded"
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

      <div v-if="isSidebarExpanded" class="sidebar-footer">
        <p class="sidebar-meta">
          {{ currentModel || 'TokenHub Chat' }}
        </p>
        <p v-if="currentRequestId" class="sidebar-request">
          Request ID: {{ currentRequestId }}
        </p>
      </div>
    </aside>

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
            保留清晰的对话结构与克制的留白，让讨论更聚焦在方案、表达与判断本身。
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
              <template v-for="(block, blockIndex) in parseMessageBlocks(message.content)" :key="`${message.id}-${blockIndex}`">
                <component
                  :is="block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'"
                  v-if="block.type === 'heading'"
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
                <ul v-else-if="block.type === 'list'" class="message-list-block">
                  <li v-for="item in block.items" :key="item" class="message-list-item">
                    <template v-for="(part, partIndex) in formatInlineParts(item)" :key="`${item}-${partIndex}`">
                      <strong v-if="part.type === 'strong'" class="message-strong">{{ part.content }}</strong>
                      <code v-else-if="part.type === 'code'" class="message-inline-code">{{ part.content }}</code>
                      <template v-else>{{ part.content }}</template>
                    </template>
                  </li>
                </ul>
                <pre v-else class="message-code-block"><code>{{ block.content }}</code></pre>
              </template>
            </div>
          </article>

          <div v-if="isLoading" class="message-row message-row--assistant">
            <div class="message-avatar">
              LB
            </div>
            <div class="message-bubble message-bubble--loading">
              <span class="typing-dot" />
              <span class="typing-dot" />
              <span class="typing-dot" />
            </div>
          </div>
        </div>
      </div>

      <div class="composer-shell">
        <p v-if="errorMessage" class="composer-error">
          {{ errorMessage }}
        </p>

        <div class="composer-card">
          <textarea
            v-model="inputMessage"
            class="composer-input"
            rows="1"
            placeholder="给 LightBuild AI 发送消息"
            @keydown="handleKeydown"
          />

          <div class="composer-footer">
            <p class="composer-tip">
              Enter 发送，Shift + Enter 换行
            </p>

            <button
              class="send-button"
              type="button"
              :disabled="!canSend"
              @click="sendMessage"
            >
              {{ isLoading ? '发送中...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  </section>
</template>

<style scoped>
.chat-layout {
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
}

.chat-layout--collapsed {
  grid-template-columns: 88px minmax(0, 1fr);
}

.chat-layout--collapsed .chat-sidebar {
  align-items: center;
  padding-inline: 14px;
}

.chat-layout--collapsed .sidebar-top {
  width: 100%;
  justify-content: center;
  .sidebar-brand {
    display: none;
  }
}

.chat-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 22px;
  border-right: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(244, 244, 245, 0.92);
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-brand--collapsed {
  width: 100%;
  justify-content: center;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 30% 30%, rgba(245, 158, 11, 0.92), rgba(180, 83, 9, 0.96) 70%),
    #111827;
  color: #fff7ed;
  font-size: 14px;
  font-weight: 700;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 12px 28px rgba(180, 83, 9, 0.2);
  transition: transform 0.24s ease, box-shadow 0.24s ease;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-brand:hover .brand-mark {
  transform: translateY(-1px) scale(1.02);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 16px 36px rgba(180, 83, 9, 0.24);
}

.brand-name {
  margin: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 700;
}

.brand-subtitle,
.sidebar-label,
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

.sidebar-toggle,
.new-chat-button,
.sidebar-card,
.sidebar-link,
.send-button {
  border: none;
  font: inherit;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.72);
  color: #374151;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.sidebar-toggle svg,
.new-chat-button svg {
  width: 18px;
  height: 18px;
}

.sidebar-toggle--collapsed svg {
  transform: scaleX(-1);
}

.new-chat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 20px;
  border-radius: 16px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 1px;
}

.new-chat-button:hover,
.sidebar-toggle:hover,
.send-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.sidebar-label,
.welcome-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.sidebar-footer {
  margin-top: auto;
  padding-top: 8px;
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

.message-quote {
  margin: 0;
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

.message-bubble--loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.send-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
  }

  .chat-layout--collapsed {
    grid-template-columns: 1fr;
  }

  .chat-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(17, 24, 39, 0.08);
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

  .chat-sidebar {
    padding-top: 16px;
    padding-bottom: 16px;
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
