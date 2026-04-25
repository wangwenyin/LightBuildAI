<script setup lang="ts">
import NightImageStudio from '~/components/ai-image/NightImageStudio.vue'
import TokenHubChatPanel from '~/components/ai-chat/TokenHubChatPanel.vue'

type WorkspaceTab = 'image' | 'chat'

const activeTab = shallowRef<WorkspaceTab>('image')

const tabs: Array<{
  key: WorkspaceTab
  label: string
  description: string
}> = [
  {
    key: 'image',
    label: '图片生成',
    description: '上传参考图后生成商业夜景效果图',
  },
  {
    key: 'chat',
    label: 'AI 聊天',
    description: '调用 TokenHub 大模型进行对话问答',
  },
]
</script>

<template>
  <div class="workspace-page">
    <div class="workspace-shell">
      <div class="workspace-topbar">
        <div class="workspace-title-block">
          <p class="workspace-kicker">
            LIGHTBUILD AI
          </p>
          <h1 class="workspace-title">
            AI 工作台
          </h1>
        </div>

        <div class="workspace-tabs" role="tablist" aria-label="AI 工作台模式切换">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="workspace-tab"
            :class="{ 'workspace-tab--active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="activeTab = tab.key"
          >
            <span class="workspace-tab-label">{{ tab.label }}</span>
            <span class="workspace-tab-description">{{ tab.description }}</span>
          </button>
        </div>
      </div>

      <div class="workspace-content">
        <NightImageStudio v-if="activeTab === 'image'" />
        <TokenHubChatPanel v-else />
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  min-height: 100vh;
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(94, 106, 210, 0.18), transparent 30%),
    radial-gradient(circle at top right, rgba(0, 196, 255, 0.12), transparent 24%),
    linear-gradient(180deg, #f4f7fb 0%, #eef2f8 100%);
}

.workspace-shell {
  max-width: 1440px;
  margin: 0 auto;
}

.workspace-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  margin-bottom: 20px;
}

.workspace-title-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #64748b;
}

.workspace-title {
  margin: 0;
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 700;
  color: #0f172a;
}

.workspace-tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.workspace-tab {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
  padding: 14px 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  color: #334155;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.workspace-tab:hover {
  transform: translateY(-1px);
  border-color: rgba(59, 130, 246, 0.24);
}

.workspace-tab--active {
  border-color: rgba(59, 130, 246, 0.38);
  box-shadow: 0 20px 44px rgba(59, 130, 246, 0.14);
}

.workspace-tab-label {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.workspace-tab-description {
  font-size: 13px;
  line-height: 1.5;
  color: #64748b;
}

.workspace-content {
  min-height: calc(100vh - 180px);
}

@media (max-width: 960px) {
  .workspace-page {
    padding: 20px;
  }

  .workspace-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-tabs {
    width: 100%;
  }

  .workspace-tab {
    flex: 1 1 220px;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .workspace-page {
    padding: 16px;
  }

  .workspace-title {
    font-size: 28px;
  }

  .workspace-tab {
    width: 100%;
  }
}
</style>
