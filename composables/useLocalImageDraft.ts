export type LocalImageDraft = {
  activeHistoryId: string
  activeView: 'source' | 'result'
  currentTaskId: string
  draftHistoryId: string
  errorMessage: string
  loadingText: string
  prompt: string
  resultImageUrl: string
  sessionId: string
  sourceImageUrl: string
  status: string
  updatedAt: string
}

const IMAGE_DRAFT_STORAGE_KEY = 'lightbuild:image-draft'

function normalizePersistedImageUrl(url: string) {
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

export function useLocalImageDraft() {
  function loadDraft() {
    if (!import.meta.client) {
      return null
    }

    try {
      const raw = window.localStorage.getItem(IMAGE_DRAFT_STORAGE_KEY)

      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as Partial<LocalImageDraft>

      if (!parsed || typeof parsed !== 'object') {
        return null
      }

      return {
        activeHistoryId: typeof parsed.activeHistoryId === 'string' ? parsed.activeHistoryId : '',
        activeView: parsed.activeView === 'result' ? 'result' : 'source',
        currentTaskId: typeof parsed.currentTaskId === 'string' ? parsed.currentTaskId : '',
        draftHistoryId: typeof parsed.draftHistoryId === 'string' ? parsed.draftHistoryId : '',
        errorMessage: typeof parsed.errorMessage === 'string' ? parsed.errorMessage : '',
        loadingText: typeof parsed.loadingText === 'string' ? parsed.loadingText : '生成中...',
        prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
        resultImageUrl: typeof parsed.resultImageUrl === 'string' ? normalizePersistedImageUrl(parsed.resultImageUrl) : '',
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
        sourceImageUrl: typeof parsed.sourceImageUrl === 'string' ? normalizePersistedImageUrl(parsed.sourceImageUrl) : '',
        status: typeof parsed.status === 'string' ? parsed.status : '',
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      } satisfies LocalImageDraft
    } catch {
      return null
    }
  }

  function saveDraft(draft: LocalImageDraft) {
    if (!import.meta.client) {
      return
    }

    window.localStorage.setItem(IMAGE_DRAFT_STORAGE_KEY, JSON.stringify({
      ...draft,
      resultImageUrl: normalizePersistedImageUrl(draft.resultImageUrl),
      sourceImageUrl: normalizePersistedImageUrl(draft.sourceImageUrl),
    } satisfies LocalImageDraft))
  }

  function clearDraft() {
    if (!import.meta.client) {
      return
    }

    window.localStorage.removeItem(IMAGE_DRAFT_STORAGE_KEY)
  }

  return {
    clearDraft,
    loadDraft,
    saveDraft,
  }
}
