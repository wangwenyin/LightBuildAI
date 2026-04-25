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

const quickQuestions = [
  '帮我写一段商业街夜景效果图的提示词',
  '分析一张沿街立面的灯光设计重点',
  '给我 3 条提高出图质感的建议',
]

const inputMessage = shallowRef('')
const isLoading = shallowRef(false)
const errorMessage = shallowRef('')
const currentModel = shallowRef('')
const currentRequestId = shallowRef('')
const messages = ref<ChatMessage[]>([
  {
    id: createMessageId(),
    role: 'assistant',
    content: '你好，我已接入 TokenHub 聊天模型。你可以直接提问，我会基于上下文连续回复。',
  },
])

const canSend = computed(() => Boolean(inputMessage.value.trim()) && !isLoading.value)
const hasDebugInfo = computed(() => Boolean(currentModel.value || currentRequestId.value))

function appendQuestion(question: string) {
  inputMessage.value = question
}

function clearConversation() {
  messages.value = [
    {
      id: createMessageId(),
      role: 'assistant',
      content: '会话已清空，你可以开始新的提问。',
    },
  ]
  currentRequestId.value = ''
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
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void sendMessage()
  }
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
</script>

<template>
  <div class="chat-shell">
    <section class="chat-card chat-card--conversation">
      <div class="chat-card-header">
        <div>
          <p class="section-eyebrow">
            对话区
          </p>
          <h2 class="section-title">
            TokenHub 聊天界面
          </h2>
        </div>

        <button class="secondary-button" type="button" @click="clearConversation">
          清空会话
        </button>
      </div>

      <div class="message-list">
        <article
          v-for="message in messages"
          :key="message.id"
          class="message-item"
          :class="`message-item--${message.role}`"
        >
          <span class="message-role">
            {{ message.role === 'assistant' ? 'AI' : '你' }}
          </span>
          <p class="message-content">
            {{ message.content }}
          </p>
        </article>

        <div v-if="isLoading" class="message-loading">
          AI 正在思考中...
        </div>
      </div>
    </section>

    <aside class="chat-card chat-card--sidebar">
      <div class="panel-block">
        <p class="section-eyebrow">
          输入区
        </p>
        <h2 class="section-title">
          发起一轮新对话
        </h2>
        <p class="panel-tip">
          输入消息后点击发送，或使用 <code>Ctrl/⌘ + Enter</code> 快捷发送。
        </p>

        <textarea
          v-model="inputMessage"
          class="chat-textarea"
          rows="8"
          placeholder="例如：请给我一套商业外立面夜景灯光设计建议"
          @keydown="handleKeydown"
        />

        <button
          class="primary-button"
          type="button"
          :disabled="!canSend"
          @click="sendMessage"
        >
          {{ isLoading ? '发送中...' : '发送消息' }}
        </button>
      </div>

      <div class="panel-block">
        <p class="section-eyebrow">
          快速提问
        </p>
        <div class="chip-list">
          <button
            v-for="question in quickQuestions"
            :key="question"
            class="chip-button"
            type="button"
            @click="appendQuestion(question)"
          >
            {{ question }}
          </button>
        </div>
      </div>

      <div v-if="hasDebugInfo || errorMessage" class="panel-block">
        <p class="section-eyebrow">
          调试信息
        </p>
        <dl class="debug-meta">
          <div v-if="currentModel" class="debug-meta-row">
            <dt>模型</dt>
            <dd>{{ currentModel }}</dd>
          </div>
          <div v-if="currentRequestId" class="debug-meta-row">
            <dt>请求 ID</dt>
            <dd>{{ currentRequestId }}</dd>
          </div>
          <div v-if="errorMessage" class="debug-meta-row">
            <dt>最近错误</dt>
            <dd>{{ errorMessage }}</dd>
          </div>
        </dl>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.chat-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
  gap: 24px;
}

.chat-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

.chat-card--conversation {
  padding: 24px;
}

.chat-card--sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
}

.chat-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.section-eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #64748b;
}

.section-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 620px;
  max-height: 72vh;
  overflow: auto;
  padding-right: 6px;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 88%;
  padding: 16px 18px;
  border-radius: 22px;
}

.message-item--assistant {
  align-self: flex-start;
  background: rgba(59, 130, 246, 0.08);
}

.message-item--user {
  align-self: flex-end;
  background: rgba(15, 23, 42, 0.92);
}

.message-role {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #64748b;
}

.message-item--user .message-role,
.message-item--user .message-content {
  color: #f8fafc;
}

.message-content {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
  color: #0f172a;
}

.message-loading {
  padding: 0 4px;
  font-size: 14px;
  color: #64748b;
}

.panel-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-tip {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: #64748b;
}

.chat-textarea {
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.78);
  font: inherit;
  color: #0f172a;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.chat-textarea:focus {
  border-color: rgba(59, 130, 246, 0.52);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.primary-button,
.secondary-button,
.chip-button {
  border: none;
  cursor: pointer;
  font: inherit;
}

.primary-button {
  padding: 14px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
  color: #f8fafc;
  font-weight: 700;
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.secondary-button {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.96);
  color: #334155;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip-button {
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
}

.debug-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
}

.debug-meta-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.92);
}

.debug-meta-row dt {
  font-weight: 600;
  color: #475569;
}

.debug-meta-row dd {
  margin: 0;
  max-width: 60%;
  text-align: right;
  color: #0f172a;
  word-break: break-word;
}

@media (max-width: 1100px) {
  .chat-shell {
    grid-template-columns: 1fr;
  }

  .message-list {
    min-height: 420px;
    max-height: none;
  }
}

@media (max-width: 640px) {
  .chat-card--conversation,
  .chat-card--sidebar {
    padding: 18px;
    border-radius: 22px;
  }

  .chat-card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .message-item {
    max-width: 100%;
  }

  .debug-meta-row {
    flex-direction: column;
  }

  .debug-meta-row dd {
    max-width: 100%;
    text-align: left;
  }
}
</style>
