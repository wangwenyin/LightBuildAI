const CLIENT_SESSION_STORAGE_KEY = 'lightbuild:client-session-id'
const CLIENT_SESSION_COOKIE_KEY = 'lightbuild_session_id'

export function useClientSession() {
  const sessionId = useState<string>('lightbuild:client-session-id', () => '')

  function ensureSessionId() {
    if (sessionId.value) {
      syncClientSession(sessionId.value)
      return sessionId.value
    }

    if (!import.meta.client) {
      return ''
    }

    const existing = readStoredSessionId()

    if (existing) {
      sessionId.value = existing
      syncClientSession(existing)
      return existing
    }

    const nextSessionId = createClientSessionId()
    sessionId.value = nextSessionId
    syncClientSession(nextSessionId)
    return nextSessionId
  }

  return {
    ensureSessionId,
    sessionId,
  }
}

function readStoredSessionId() {
  if (!import.meta.client) {
    return ''
  }

  const cookieValue = readCookieValue(CLIENT_SESSION_COOKIE_KEY)

  if (cookieValue) {
    return cookieValue
  }

  return window.localStorage.getItem(CLIENT_SESSION_STORAGE_KEY)?.trim() || ''
}

function syncClientSession(sessionId: string) {
  if (!import.meta.client || !sessionId) {
    return
  }

  window.localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, sessionId)
  document.cookie = `${CLIENT_SESSION_COOKIE_KEY}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

function readCookieValue(name: string) {
  if (!import.meta.client) {
    return ''
  }

  const prefix = `${name}=`
  const matched = document.cookie
    .split(';')
    .map(item => item.trim())
    .find(item => item.startsWith(prefix))

  return matched ? decodeURIComponent(matched.slice(prefix.length)) : ''
}

function createClientSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sess_${crypto.randomUUID()}`
  }

  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
