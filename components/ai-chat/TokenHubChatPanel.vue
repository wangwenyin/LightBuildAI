<script setup lang="ts">
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

const quickQuestions = [
  '帮我整理一套商业街夜景提案思路',
  '把这段提示词改得更高级、更像真实摄影',
  '给我 3 条提升夜景出图质感的具体建议',
  '分析这张沿街立面的灯光层级应该怎么做',
]

const inputMessage = shallowRef('')
const isLoading = shallowRef(false)
const errorMessage = shallowRef('')
const currentModel = shallowRef('')
const currentRequestId = shallowRef('')
const messages = ref<ChatMessage[]>([])
const messageListRef = useTemplateRef<HTMLDivElement>('messageListRef')

const canSend = computed(() => Boolean(inputMessage.value.trim()) && !isLoading.value)
const hasConversation = computed(() => messages.value.length > 0)
const sidebarActions = computed(() => [
  {
    title: '新对话',
    description: '清空上下文，重新开始提问',
    action: clearConversation,
  },
  {
    title: '商业夜景',
    description: '围绕夜景生成、灯光与提案表达继续发问',
    action: () => appendQuestion('请从商业价值、灯光层级、街景氛围三个角度分析这张夜景图应该怎么优化'),
  },
])

watch(
  () => [messages.value.length, isLoading.value],
  async () => {
    await nextTick()
    const container = messageListRef.value

    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  },
)

function appendQuestion(question: string) {
  inputMessage.value = question
}

function clearConversation() {
  messages.value = []
  currentRequestId.value = ''
  currentModel.value = ''
  errorMessage.value = ''
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
  <section class="chat-layout">
    <aside class="chat-sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">
          LB
        </div>
        <div>
          <p class="brand-name">
            LightBuild AI
          </p>
          <p class="brand-subtitle">
            Chat Workspace
          </p>
        </div>
      </div>

      <button class="new-chat-button" type="button" @click="clearConversation">
        新建聊天
      </button>

      <div class="sidebar-section">
        <p class="sidebar-label">
          快捷操作
        </p>
        <button
          v-for="item in sidebarActions"
          :key="item.title"
          class="sidebar-card"
          type="button"
          @click="item.action()"
        >
          <span class="sidebar-card-title">{{ item.title }}</span>
          <span class="sidebar-card-description">{{ item.description }}</span>
        </button>
      </div>

      <div class="sidebar-section">
        <p class="sidebar-label">
          灵感问题
        </p>
        <button
          v-for="question in quickQuestions"
          :key="question"
          class="sidebar-link"
          type="button"
          @click="appendQuestion(question)"
        >
          {{ question }}
        </button>
      </div>

      <div class="sidebar-footer">
        <p class="sidebar-meta">
          {{ currentModel || 'TokenHub Chat' }}
        </p>
        <p v-if="currentRequestId" class="sidebar-request">
          Request ID: {{ currentRequestId }}
        </p>
      </div>
    </aside>

    <main class="chat-main">
      <div ref="messageListRef" class="chat-stream">
        <div v-if="!hasConversation" class="chat-welcome">
          <p class="welcome-kicker">
            LIGHTBUILD CONVERSATION
          </p>
          <h1 class="welcome-title">
            今天想一起打磨哪一段夜景表达？
          </h1>
          <p class="welcome-description">
            这里的布局参考了 `chatgpt.com` 当前公开聊天页的核心结构：左侧导航，主区域居中，底部固定输入器；但视觉上收敛为更温和的建筑与提案语境。
          </p>

          <div class="welcome-grid">
            <button
              v-for="question in quickQuestions"
              :key="question"
              class="welcome-card"
              type="button"
              @click="appendQuestion(question)"
            >
              {{ question }}
            </button>
          </div>
        </div>

        <div v-else class="message-thread">
          <article
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="`message-row--${message.role}`"
          >
            <div class="message-avatar">
              {{ message.role === 'assistant' ? 'AI' : '你' }}
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
              AI
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
  min-height: calc(100vh - 210px);
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 32px;
  background: rgba(250, 250, 249, 0.72);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

.chat-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 22px;
  border-right: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(244, 244, 245, 0.92);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
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
  font-size: 13px;
  line-height: 1.7;
}

.new-chat-button,
.sidebar-card,
.sidebar-link,
.welcome-card,
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

.new-chat-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  border-radius: 16px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
}

.new-chat-button:hover,
.send-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-label,
.welcome-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.sidebar-card,
.sidebar-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 14px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  color: #111827;
  text-align: left;
}

.sidebar-card:hover,
.sidebar-link:hover,
.welcome-card:hover {
  background: #fff;
  border-color: rgba(17, 24, 39, 0.14);
}

.sidebar-card-title {
  font-size: 14px;
  font-weight: 700;
}

.sidebar-card-description {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.sidebar-link {
  padding: 12px 14px;
  color: #374151;
  font-size: 13px;
  line-height: 1.7;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 8px;
}

.chat-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.88), transparent 40%),
    rgba(250, 250, 249, 0.9);
}

.chat-stream {
  flex: 1;
  overflow: auto;
  padding: 40px 24px 20px;
}

.chat-welcome,
.message-thread,
.composer-shell {
  width: min(860px, 100%);
  margin: 0 auto;
}

.chat-welcome {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  padding: 32px 0 64px;
}

.welcome-title {
  margin: 14px 0 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  font-size: clamp(34px, 5vw, 52px);
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.welcome-description {
  max-width: 760px;
  margin-top: 18px;
}

.welcome-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 28px;
}

.welcome-card {
  min-height: 88px;
  padding: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.74);
  color: #111827;
  font-size: 14px;
  line-height: 1.8;
  text-align: left;
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
  padding: 16px 18px;
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
  position: sticky;
  bottom: 0;
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

  .chat-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(17, 24, 39, 0.08);
  }

  .welcome-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .chat-layout {
    min-height: auto;
    border-radius: 24px;
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
    font-size: 34px;
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
