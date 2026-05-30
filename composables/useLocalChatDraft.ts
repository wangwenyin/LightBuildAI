export type LocalChatDraftMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type LocalChatDraft = {
  activeSessionId: string
  currentModel: string
  currentRequestId: string
  errorMessage: string
  inputMessage: string
  isLoading: boolean
  lastSubmittedMessage: string
  messages: LocalChatDraftMessage[]
  updatedAt: string
}

const CHAT_DRAFT_STORAGE_KEY = 'lightbuild:chat-draft'

export function useLocalChatDraft() {
  function loadDraft() {
    if (!import.meta.client) {
      return null
    }

    try {
      const raw = window.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)

      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as Partial<LocalChatDraft>

      if (!parsed || typeof parsed !== 'object') {
        return null
      }

      return {
        activeSessionId: typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : '',
        currentModel: typeof parsed.currentModel === 'string' ? parsed.currentModel : '',
        currentRequestId: typeof parsed.currentRequestId === 'string' ? parsed.currentRequestId : '',
        errorMessage: typeof parsed.errorMessage === 'string' ? parsed.errorMessage : '',
        inputMessage: typeof parsed.inputMessage === 'string' ? parsed.inputMessage : '',
        isLoading: parsed.isLoading === true,
        lastSubmittedMessage: typeof parsed.lastSubmittedMessage === 'string' ? parsed.lastSubmittedMessage : '',
        messages: Array.isArray(parsed.messages)
          ? parsed.messages
            .filter((message): message is LocalChatDraftMessage =>
              Boolean(message)
              && typeof message.id === 'string'
              && (message.role === 'user' || message.role === 'assistant')
              && typeof message.content === 'string')
          : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      } satisfies LocalChatDraft
    } catch {
      return null
    }
  }

  function saveDraft(draft: LocalChatDraft) {
    if (!import.meta.client) {
      return
    }

    window.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }

  function clearDraft() {
    if (!import.meta.client) {
      return
    }

    window.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
  }

  return {
    clearDraft,
    loadDraft,
    saveDraft,
  }
}
