/**
 * 跨 tab 的工作台状态桥（单例）。
 *
 * 背景：`夜景生成` 与 `AI 聊天` 是两个 tab，组件由 KeepAlive 缓存、彼此不直接通信。
 *
 * 双向通道：
 * - **chat → image**：聊天里 Agent 出图后，把「提示词 / 任务 / 结果图」带到生成面板继续操作。
 * - **image → chat**（P0-3）：生成面板里出图完成后，把结果回流到聊天，
 *   让那条对话的卡片能更新成「渲染完成」，形成闭环。
 *
 * 注意：这里只放「跨 tab 传递意图」的轻量状态，任务的生命周期由 `useTaskCenter` 统一管理。
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
  source: 'chat-agent' | 'chat-inline'
  /** 时间戳，用于判断是否是「新的一次交接」 */
  at: number
}

/** 生成面板 → 聊天的回流事件 */
export type ImageResultFeedback = {
  taskId: string
  imageUrl: string
  prompt: string
  /** 出图来源，聊天侧据此决定是否要更新某条消息 */
  origin: 'chat-agent' | 'chat-inline' | 'image-studio'
  at: number
}

const pendingHandoff = shallowRef<WorkspaceHandoff | null>(null)
const pendingFeedback = shallowRef<ImageResultFeedback | null>(null)

export function useWorkspaceBridge() {
  /** 从聊天面板发起一次交接 */
  function handoffToImageStudio(payload: Omit<WorkspaceHandoff, 'source' | 'at'> & { source?: WorkspaceHandoff['source'] }) {
    pendingHandoff.value = {
      ...payload,
      source: payload.source ?? 'chat-agent',
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

  /** 生成面板出图完成后，回流给聊天 */
  function publishImageResult(payload: Omit<ImageResultFeedback, 'at'>) {
    pendingFeedback.value = { ...payload, at: Date.now() }
  }

  /** 聊天面板消费一次回流 */
  function consumeImageResult(): ImageResultFeedback | null {
    const current = pendingFeedback.value

    if (!current) {
      return null
    }

    pendingFeedback.value = null

    return current
  }

  return {
    pendingHandoff,
    pendingFeedback,
    handoffToImageStudio,
    consumeHandoff,
    publishImageResult,
    consumeImageResult,
  }
}
