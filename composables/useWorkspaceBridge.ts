/**
 * 跨 tab 的工作台状态桥（单例）。
 *
 * 背景：`夜景生成` 与 `AI 聊天` 是两个 tab，组件由 KeepAlive 缓存、彼此不直接通信。
 * 聊天里 Agent 出图后，需要把「提示词 / 任务 / 结果图」带到生成面板继续操作，
 * 因此这里放一个模块级的共享状态（Nuxt 里模块只会被求值一次，等效单例）。
 *
 * 注意：这里只放「跨 tab 传递意图」的轻量状态，不复制两个面板各自的大状态。
 */

export type WorkspaceHandoff = {
  /** 提示词（Agent 打磨后的最终提示词，带过去继续出图 / 微调） */
  prompt?: string
  /** 负向提示词 */
  negativePrompt?: string
  /** 已提交的出图任务 id（若 Agent 已触发出图） */
  taskId?: string
  /** 已知的结果图 URL（若已有） */
  imageUrl?: string
  /** 来源标记，便于埋点或提示文案 */
  source: 'chat-agent'
  /** 时间戳，用于判断是否是「新的一次交接」 */
  at: number
}

const pendingHandoff = shallowRef<WorkspaceHandoff | null>(null)

export function useWorkspaceBridge() {
  /** 从聊天面板发起一次交接 */
  function handoffToImageStudio(payload: Omit<WorkspaceHandoff, 'source' | 'at'>) {
    pendingHandoff.value = {
      ...payload,
      source: 'chat-agent',
      at: Date.now(),
    }
  }

  /** 生成面板消费一次交接（消费后清空，避免重复应用） */
  function consumeHandoff(): WorkspaceHandoff | null {
    const current = pendingHandoff.value

    if (!current) {
      return null
    }

    pendingHandoff.value = null

    return current
  }

  return {
    pendingHandoff,
    handoffToImageStudio,
    consumeHandoff,
  }
}
