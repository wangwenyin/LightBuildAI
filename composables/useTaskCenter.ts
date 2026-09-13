/**
 * 出图任务的**统一状态源**（单例）。
 *
 * 解决的问题（P0-1 + P0-3）：
 * - P0-1：出图是「提交即返回」，Agent / 聊天卡片 / 生成面板各自拿着一个 taskId，
 *   但没有任何一方负责把它轮询到成图，导致用户到处都看不到结果。
 * - P0-3：聊天与生成面板的状态是单向的，生成面板重新出图后聊天不知道，
 *   聊天里出图后生成面板也只是被动接收。
 *
 * 方案：把「进行中的出图任务」提到模块级单例（Nuxt 里模块只求值一次），
 * 谁提交任务谁调用 `trackTask()`，之后由**这一个地方**统一轮询；
 * 任何组件订阅 `tasks` 都能拿到最新状态（排队中 / 渲染中 / 已完成 / 失败）。
 *
 * 注意：这里只维护「任务生命周期」，不持有 UI 状态（当前预览哪张图之类由各面板自己决定）。
 */

export type TrackedTaskStatus = 'submitted' | 'processing' | 'done' | 'failed'

export type TrackedTask = {
  taskId: string
  status: TrackedTaskStatus
  /** 提交这个任务的来源，用于 UI 分区展示与回流目标判断 */
  origin: 'chat-agent' | 'chat-inline' | 'image-studio'
  /** 提交时用的提示词，回流时可直接回填 */
  prompt: string
  sessionId: string
  createdAt: number
  updatedAt: number
  imageUrl: string
  errorMessage: string
  /** 状态文案（面向用户，含排队位次等） */
  statusText: string
  /** 进度百分比 0-100，未知时为 null */
  progress: number | null
}

type TrackTaskInput = {
  taskId: string
  origin: TrackedTask['origin']
  prompt?: string
  sessionId?: string
  imageUrl?: string
  status?: TrackedTaskStatus
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 120
/** 上游限制并发（实测 1 个），命中后进入退避重试而不是直接失败 */
const MAX_RATE_LIMIT_RETRIES = 40

const tasks = ref<Record<string, TrackedTask>>({})
/** 已完成任务按时间倒序，供列表消费（也用于聊天回流匹配） */
const completedQueue = ref<TrackedTask[]>([])
const listeners = new Set<(task: TrackedTask) => void>()
const pollTimers = new Map<string, number>()

function notify(task: TrackedTask) {
  for (const listener of listeners) {
    try {
      listener(task)
    } catch {
      // 单个订阅者出错不影响其他订阅者
    }
  }
}

function upsertTask(taskId: string, patch: Partial<TrackedTask> & { status: TrackedTaskStatus }) {
  const previous = tasks.value[taskId]
  const next: TrackedTask = {
    taskId,
    status: patch.status,
    origin: patch.origin ?? previous?.origin ?? 'image-studio',
    prompt: patch.prompt ?? previous?.prompt ?? '',
    sessionId: patch.sessionId ?? previous?.sessionId ?? '',
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    imageUrl: patch.imageUrl ?? previous?.imageUrl ?? '',
    errorMessage: patch.errorMessage ?? '',
    statusText: patch.statusText ?? previous?.statusText ?? '',
    progress: patch.progress ?? previous?.progress ?? null,
  }

  tasks.value = { ...tasks.value, [taskId]: next }

  // 终态：撤销轮询、进完成队列、广播
  if (next.status === 'done' || next.status === 'failed') {
    stopPolling(taskId)

    if (!completedQueue.value.some(item => item.taskId === taskId)) {
      completedQueue.value = [next, ...completedQueue.value].slice(0, 50)
    }
  }

  notify(next)

  return next
}

function stopPolling(taskId: string) {
  const timer = pollTimers.get(taskId)

  if (timer !== undefined) {
    window.clearTimeout(timer)
    pollTimers.delete(taskId)
  }
}

/** 从错误信息里识别「并发上限」这类可重试的错误 */
function isRetryableLimitError(message: string) {
  return /任务上限|并发|限流|rate ?limit|too many|稍后重试|排队/i.test(message)
}

async function pollOnce(taskId: string, attempt: number, limitRetries: number) {
  const task = tasks.value[taskId]

  if (!task || task.status === 'done' || task.status === 'failed') {
    return
  }

  try {
    const response = await $fetch<{
      taskId: string
      status: 'processing' | 'done' | 'failed'
      imageUrl?: string
      errorMessage?: string
      statusMessage?: string
      requestId?: string
    }>('/api/task', {
      query: { taskId, sessionId: task.sessionId || undefined },
    })

    if (response.status === 'done' && response.imageUrl) {
      upsertTask(taskId, {
        status: 'done',
        imageUrl: response.imageUrl,
        statusText: '生成完成',
        progress: 100,
      })
      return
    }

    if (response.status === 'failed') {
      upsertTask(taskId, {
        status: 'failed',
        errorMessage: response.errorMessage || response.statusMessage || '渲染失败',
        statusText: `失败：${response.errorMessage || response.statusMessage || '渲染失败'}`,
        progress: null,
      })
      return
    }

    upsertTask(taskId, {
      status: 'processing',
      statusText: task.origin === 'image-studio' ? '渲染中…' : '渲染中…',
      progress: null,
    })

    scheduleNext(taskId, attempt + 1, limitRetries)
  } catch (error) {
    const message = extractErrorMessage(error)

    // 并发限制是可恢复的：退避重试，不要把任务判死
    if (isRetryableLimitError(message) && limitRetries < MAX_RATE_LIMIT_RETRIES) {
      upsertTask(taskId, {
        status: 'processing',
        statusText: `排队中…（上游繁忙，自动重试第 ${limitRetries + 1} 次）`,
        progress: null,
      })
      scheduleNext(taskId, attempt, limitRetries + 1, true)
      return
    }

    if (attempt >= MAX_POLL_ATTEMPTS) {
      upsertTask(taskId, {
        status: 'failed',
        errorMessage: message || '轮询超时',
        statusText: `失败：${message || '轮询超时'}`,
      })
      return
    }

    // 偶发网络错误：继续重试
    scheduleNext(taskId, attempt + 1, limitRetries)
  }
}

function scheduleNext(taskId: string, attempt: number, limitRetries: number, backoff = false) {
  stopPolling(taskId)

  if (attempt > MAX_POLL_ATTEMPTS) {
    upsertTask(taskId, {
      status: 'failed',
      errorMessage: '轮询超时',
      statusText: '失败：轮询超时',
    })
    return
  }

  const delay = backoff ? Math.min(POLL_INTERVAL_MS * 2, 10000) : POLL_INTERVAL_MS

  const timer = window.setTimeout(() => {
    void pollOnce(taskId, attempt, limitRetries)
  }, delay)

  pollTimers.set(taskId, timer)
}

function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return ''
  }

  const record = error as Record<string, any>

  return String(
    record.data?.message
    || record.data?.errorMessage
    || record.data?.statusMessage
    || record.statusMessage
    || record.message
    || '',
  ).trim()
}

export function useTaskCenter() {
  /** 登记一个出图任务并开始统一轮询（幂等：同一 taskId 重复调用只会刷新） */
  function trackTask(input: TrackTaskInput): TrackedTask {
    const existing = tasks.value[input.taskId]

    if (existing && (existing.status === 'done' || existing.status === 'failed')) {
      return existing
    }

    // 已经有图（如提交时即返回成图）就直接落终态，不再轮询
    if (input.imageUrl) {
      return upsertTask(input.taskId, {
        status: 'done',
        origin: input.origin,
        prompt: input.prompt,
        sessionId: input.sessionId,
        imageUrl: input.imageUrl,
        statusText: '生成完成',
        progress: 100,
      })
    }

    const task = upsertTask(input.taskId, {
      status: input.status ?? 'submitted',
      origin: input.origin,
      prompt: input.prompt,
      sessionId: input.sessionId,
      statusText: '已提交，等待渲染…',
      progress: null,
    })

    if (!pollTimers.has(input.taskId)) {
      scheduleNext(input.taskId, 1, 0)
    }

    return task
  }

  function getTask(taskId: string) {
    return tasks.value[taskId] ?? null
  }

  /** 订阅任务状态变化，返回取消订阅函数 */
  function onTaskUpdate(listener: (task: TrackedTask) => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function clearCompleted() {
    completedQueue.value = []
  }

  /** 组件卸载时只解绑定时器，状态仍保留在单例里，切回来还能看到 */
  function releasePolling(taskId?: string) {
    if (taskId) {
      stopPolling(taskId)
      return
    }

    for (const id of [...pollTimers.keys()]) {
      stopPolling(id)
    }
  }

  return {
    tasks,
    completedQueue,
    trackTask,
    getTask,
    onTaskUpdate,
    clearCompleted,
    releasePolling,
  }
}
