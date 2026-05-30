const PENDING_RELOAD_RESUME_PREFIX = 'lightbuild:pending-reload:'

export function usePendingReloadResume(scope: string) {
  const storageKey = `${PENDING_RELOAD_RESUME_PREFIX}${scope}`

  function markPendingReload() {
    if (!import.meta.client) {
      return
    }

    window.sessionStorage.setItem(storageKey, '1')
  }

  function clearPendingReload() {
    if (!import.meta.client) {
      return
    }

    window.sessionStorage.removeItem(storageKey)
  }

  function consumePendingReload() {
    if (!import.meta.client) {
      return false
    }

    const shouldResume = window.sessionStorage.getItem(storageKey) === '1'
    window.sessionStorage.removeItem(storageKey)
    return shouldResume
  }

  return {
    clearPendingReload,
    consumePendingReload,
    markPendingReload,
  }
}
