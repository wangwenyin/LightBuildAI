export type LocalImageHistoryRecord = {
  id: string
  sessionId?: string
  taskId?: string
  title: string
  prompt: string
  sourceImageUrl: string
  resultImageUrl: string
  status: string
  updatedAt: string
}

const IMAGE_HISTORY_STORAGE_KEY = 'lightbuild:image-history'
const MAX_IMAGE_HISTORY = 20

function normalizePersistedImageUrl(url: string) {
  const normalized = url.trim()

  if (!normalized) {
    return ''
  }

  try {
    const parsed = new URL(normalized)

    if (/^\/uploads\//i.test(parsed.pathname)) {
      return `${parsed.origin}${parsed.pathname}`
    }

    return normalized
  } catch {
    return normalized
  }
}

function normalizeRecord(record: LocalImageHistoryRecord): LocalImageHistoryRecord {
  return {
    ...record,
    sourceImageUrl: normalizePersistedImageUrl(record.sourceImageUrl),
    resultImageUrl: normalizePersistedImageUrl(record.resultImageUrl),
  }
}

function createRecordTitle(prompt: string, customTitle?: string) {
  const normalizedCustomTitle = customTitle?.replace(/\s+/g, ' ').trim()

  if (normalizedCustomTitle) {
    return normalizedCustomTitle.slice(0, 20)
  }

  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim()
  return normalizedPrompt.slice(0, 20) || '夜景生成记录'
}

export function useLocalImageHistory() {
  const records = shallowRef<LocalImageHistoryRecord[]>([])

  function loadRecords() {
    if (!import.meta.client) {
      return
    }

    try {
      const raw = window.localStorage.getItem(IMAGE_HISTORY_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) as LocalImageHistoryRecord[] : []
      const nextRecords = Array.isArray(parsed) ? parsed.map(normalizeRecord) : []
      records.value = nextRecords
      window.localStorage.setItem(IMAGE_HISTORY_STORAGE_KEY, JSON.stringify(nextRecords))
    } catch {
      records.value = []
    }
  }

  function persistRecords(nextRecords: LocalImageHistoryRecord[]) {
    records.value = nextRecords

    if (!import.meta.client) {
      return
    }

    window.localStorage.setItem(IMAGE_HISTORY_STORAGE_KEY, JSON.stringify(nextRecords))
  }

  function saveRecord(record: Omit<LocalImageHistoryRecord, 'title' | 'updatedAt'> & Partial<Pick<LocalImageHistoryRecord, 'title'>>) {
    if (!record.sourceImageUrl && !record.resultImageUrl) {
      return
    }

    const nextRecord: LocalImageHistoryRecord = {
      ...record,
      sourceImageUrl: normalizePersistedImageUrl(record.sourceImageUrl),
      resultImageUrl: normalizePersistedImageUrl(record.resultImageUrl),
      title: createRecordTitle(record.prompt, record.title),
      updatedAt: new Date().toISOString(),
    }

    const deduped = records.value.filter(item => item.id !== nextRecord.id)
    persistRecords([nextRecord, ...deduped].slice(0, MAX_IMAGE_HISTORY))
  }

  function getRecord(recordId: string) {
    return records.value.find(record => record.id === recordId) ?? null
  }

  function getLatestRecord() {
    return records.value[0] ?? null
  }

  function deleteRecord(recordId: string) {
    persistRecords(records.value.filter(record => record.id !== recordId))
  }

  function clearRecords() {
    persistRecords([])
  }

  return {
    clearRecords,
    deleteRecord,
    records,
    getLatestRecord,
    getRecord,
    loadRecords,
    saveRecord,
  }
}
