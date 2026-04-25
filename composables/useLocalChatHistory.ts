export type LocalChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type LocalChatSession = {
  id: string
  title: string
  preview: string
  updatedAt: string
  messages: LocalChatMessage[]
}

const CHAT_HISTORY_STORAGE_KEY = 'lightbuild:chat-sessions'
const MAX_CHAT_SESSIONS = 20

function createSessionTitle(messages: LocalChatMessage[]) {
  const firstUserMessage = messages.find(message => message.role === 'user')?.content ?? ''
  const normalized = firstUserMessage.replace(/\s+/g, ' ').trim()
  return normalized.slice(0, 20) || '新对话'
}

export function useLocalChatHistory() {
  const sessions = shallowRef<LocalChatSession[]>([])

  function loadSessions() {
    if (!import.meta.client) {
      return
    }

    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) as LocalChatSession[] : []
      sessions.value = Array.isArray(parsed) ? parsed : []
    } catch {
      sessions.value = []
    }
  }

  function persistSessions(nextSessions: LocalChatSession[]) {
    sessions.value = nextSessions

    if (!import.meta.client) {
      return
    }

    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(nextSessions))
  }

  function saveSession(sessionId: string, messages: LocalChatMessage[]) {
    if (messages.length === 0) {
      return
    }

    const lastMessage = messages[messages.length - 1]?.content || ''
    const title = createSessionTitle(messages)
    const preview = lastMessage.slice(0, 36)
    const updatedAt = new Date().toISOString()

    const nextSession: LocalChatSession = {
      id: sessionId,
      title,
      preview,
      updatedAt,
      messages,
    }

    const deduped = sessions.value.filter(session => session.id !== sessionId)
    persistSessions([nextSession, ...deduped].slice(0, MAX_CHAT_SESSIONS))
  }

  function getSession(sessionId: string) {
    return sessions.value.find(session => session.id === sessionId) ?? null
  }

  function getLatestSession() {
    return sessions.value[0] ?? null
  }

  function deleteSession(sessionId: string) {
    persistSessions(sessions.value.filter(session => session.id !== sessionId))
  }

  function clearSessions() {
    persistSessions([])
  }

  return {
    clearSessions,
    deleteSession,
    sessions,
    getLatestSession,
    getSession,
    loadSessions,
    saveSession,
  }
}
