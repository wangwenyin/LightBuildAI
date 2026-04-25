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
    label: '夜景生成',
    description: '上传参考图，生成更高级的商业夜景效果',
  },
  {
    key: 'chat',
    label: 'AI 聊天',
    description: '以 ChatGPT 风格布局完成对话与辅助创作',
  },
]
</script>

<template>
  <div class="workspace-page">
    <div class="workspace-shell">
      <header class="workspace-topbar">
        <div class="workspace-title-block">
          <p class="workspace-kicker">
            LIGHTBUILD AI
          </p>
          <h1 class="workspace-title">
            灯光夜景生成与 AI 对话工作台
          </h1>
          <p class="workspace-subtitle">
            面向灯光夜景表达、方案推敲与日常沟通的一体化 AI 工作界面。
          </p>
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
      </header>

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
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 28%),
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 24%),
    linear-gradient(180deg, #f8f7f4 0%, #f3f1ec 100%);
}

.workspace-shell {
  max-width: 1480px;
  margin: 0 auto;
}

.workspace-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  margin-bottom: 22px;
}

.workspace-title-block {
  display: flex;
  max-width: 760px;
  flex-direction: column;
  gap: 10px;
}

.workspace-kicker {
  margin: 0;
  color: #78716c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
}

.workspace-title {
  margin: 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  font-size: clamp(34px, 5vw, 48px);
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.workspace-subtitle {
  margin: 0;
  color: #57534e;
  font-size: 15px;
  line-height: 1.8;
}

.workspace-tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.workspace-tab {
  position: relative;
  display: flex;
  min-width: 240px;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border: 1px solid transparent;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.04);
  color: #4b5563;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.workspace-tab:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.07);
}

.workspace-tab--active {
  border-color: transparent;
  background: rgba(209, 138, 17, 0.08);
  box-shadow: 0 18px 40px rgba(209, 138, 17, 0.08);
  color: #3f2d08;
}

.workspace-tab--active:hover {
  background: rgba(209, 138, 17, 0.1);
  box-shadow: 0 20px 42px rgba(209, 138, 17, 0.1);
}

.workspace-tab--active .workspace-tab-label {
  color: #43300a;
}

.workspace-tab--active .workspace-tab-description {
  color: rgba(92, 67, 13, 0.82);
}

.workspace-tab-label {
  color: #1f2937;
  font-size: 16px;
  font-weight: 700;
}

.workspace-tab-description {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.workspace-content {
  min-height: calc(100vh - 210px);
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
    font-size: 34px;
  }

  .workspace-tab {
    width: 100%;
  }
}
</style>
