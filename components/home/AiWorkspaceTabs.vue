<script setup lang="ts">
import NightImageStudio from '~/components/ai-image/NightImageStudio.vue'
import TokenHubChatPanel from '~/components/ai-chat/TokenHubChatPanel.vue'

type WorkspaceTab = 'image' | 'chat'

const activeTab = shallowRef<WorkspaceTab>('image')
const isMobileSidebarOpen = shallowRef(false)

useHead(() => ({
  htmlAttrs: {
    class: activeTab.value === 'chat' ? 'app-mode-chat' : 'app-mode-image',
  },
  bodyAttrs: {
    class: activeTab.value === 'chat' ? 'app-mode-chat' : 'app-mode-image',
  },
}))

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
    description: '有问题，尽管问',
  },
]

watch(activeTab, () => {
  isMobileSidebarOpen.value = false
})
</script>

<template>
  <div class="workspace-page" :class="`workspace-page--${activeTab}`">
    <div class="workspace-shell" :class="`workspace-shell--${activeTab}`">
      <header class="workspace-topbar">
        <div class="workspace-brand-row">
          <button
            class="workspace-sidebar-trigger ui-button-reset ui-interactive-lift"
            type="button"
            aria-label="打开侧边栏"
            @click="isMobileSidebarOpen = true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4.75 6.75h14.5M4.75 12h14.5M4.75 17.25h14.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.8"
              />
            </svg>
          </button>

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

      <div class="workspace-content" :class="`workspace-content--${activeTab}`">
        <NightImageStudio
          v-if="activeTab === 'image'"
          :mobile-sidebar-open="isMobileSidebarOpen"
          @update:mobile-sidebar-open="isMobileSidebarOpen = $event"
        />
        <TokenHubChatPanel
          v-else
          :mobile-sidebar-open="isMobileSidebarOpen"
          @update:mobile-sidebar-open="isMobileSidebarOpen = $event"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 12px;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 28%),
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 24%),
    linear-gradient(180deg, #f8f7f4 0%, #f3f1ec 100%);
}

.workspace-shell {
  display: flex;
  width: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
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

.workspace-brand-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.workspace-sidebar-trigger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  margin-top: 2px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.workspace-sidebar-trigger svg {
  width: 17px;
  height: 17px;
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
  font-size: clamp(34px, 5vw, 32px);
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.workspace-subtitle {
  margin: 0;
  color: #57534e;
  font-size: 14px;
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
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.workspace-content > * {
  min-height: 0;
  flex: 1;
}

.workspace-content--chat {
  flex: 1;
}

@media (max-width: 960px) {
  .workspace-page {
    box-sizing: border-box;
    padding: 12px;
  }

  .workspace-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-brand-row {
    align-items: center;
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
    box-sizing: border-box;
    padding: 10px;
  }

  .workspace-topbar {
    gap: 14px;
    margin-bottom: 12px;
    position: sticky;
    top: 0;
    z-index: 18;
    padding: 6px 0 8px;
  }

  .workspace-brand-row {
    gap: 12px;
  }

  .workspace-sidebar-trigger {
    display: inline-flex;
  }

  .workspace-title-block {
    gap: 0;
  }

  .workspace-title,
  .workspace-subtitle {
    display: none;
  }

  .workspace-kicker {
    font-size: 12px;
    line-height: 42px;
    letter-spacing: 0.2em;
  }

  .workspace-title {
    font-size: 34px;
  }

  .workspace-tab {
    min-width: 0;
    flex: 1 1 0;
    gap: 0;
    padding: 12px 14px;
    border-radius: 16px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
    background: rgba(255, 255, 255, 0.58);
    text-align: center;
  }

  .workspace-tabs {
    gap: 10px;
    width: 100%;
    flex-wrap: nowrap;
  }

  .workspace-tab--active {
    background: rgba(209, 138, 17, 0.08);
    box-shadow: 0 18px 40px rgba(209, 138, 17, 0.08);
    color: #3f2d08;
  }

  .workspace-tab--active:hover {
    background: rgba(209, 138, 17, 0.1);
    box-shadow: 0 20px 42px rgba(209, 138, 17, 0.1);
  }

  .workspace-tab-label {
    font-size: 14px;
  }

  .workspace-tab--active .workspace-tab-label {
    color: #43300a;
  }

  .workspace-tab-description {
    display: none;
  }
}
</style>
