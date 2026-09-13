<script setup lang="ts">
import NightImageStudio from '~/components/ai-image/NightImageStudio.vue'
import TokenHubChatPanel from '~/components/ai-chat/TokenHubChatPanel.vue'
import WorkspaceModeSwitch from '~/components/home/WorkspaceModeSwitch.vue'
import type { WorkspaceTab } from '~/components/home/WorkspaceModeSwitch.vue'

const route = useRoute()
const router = useRouter()

const activeTab = shallowRef<WorkspaceTab>(resolveWorkspaceTab(route.query.tab))
const isMobileSidebarOpen = shallowRef(false)

useHead(() => ({
  htmlAttrs: {
    class: activeTab.value === 'chat' ? 'app-mode-chat' : 'app-mode-image',
  },
  bodyAttrs: {
    class: activeTab.value === 'chat' ? 'app-mode-chat' : 'app-mode-image',
  },
}))

/** 页面主标题：同时供各面板侧边栏的无障碍标签使用 */
const WORKSPACE_TITLE = '灯光夜景生成与 AI 对话工作台'

/**
 * 模式切换器由本组件持有，作为 `mode-switch` 插槽透传给当前面板，
 * 最终渲染在面板侧边栏的 nav 区里。
 * 这样全局只有「一个侧边栏 + 一个内容区」，不会出现重复的品牌栏。
 */
const activePanelComponent = computed(() => activeTab.value === 'chat'
  ? TokenHubChatPanel
  : NightImageStudio)

watch(activeTab, () => {
  isMobileSidebarOpen.value = false
})

watch(
  () => route.query.tab,
  (nextTab) => {
    const resolvedTab = resolveWorkspaceTab(nextTab)

    if (resolvedTab !== activeTab.value) {
      activeTab.value = resolvedTab
    }
  },
)

watch(activeTab, async (nextTab) => {
  if (route.query.tab === nextTab) {
    return
  }

  await router.replace({
    query: {
      ...route.query,
      tab: nextTab,
    },
  })
})

onMounted(async () => {
  if (route.query.tab === activeTab.value) {
    return
  }

  await router.replace({
    query: {
      ...route.query,
      tab: activeTab.value,
    },
  })
})

function resolveWorkspaceTab(tabQuery: unknown): WorkspaceTab {
  return tabQuery === 'chat' ? 'chat' : 'image'
}

/** 子面板（如 AI 聊天出图后）请求切到另一个 tab */
function handleSwitchTab(tab: WorkspaceTab) {
  activeTab.value = tab
}
</script>

<template>
  <div class="workspace-page" :class="`workspace-page--${activeTab}`">
    <!-- 页面主标题：视觉上收进侧边栏品牌区，这里保留语义供读屏与文档大纲使用 -->
    <h1 class="visually-hidden">
      {{ WORKSPACE_TITLE }}
    </h1>

    <div class="workspace-shell">
      <KeepAlive>
        <component
          :is="activePanelComponent"
          :key="activeTab"
          :mobile-sidebar-open="isMobileSidebarOpen"
          @update:mobile-sidebar-open="isMobileSidebarOpen = $event"
          @switch-tab="handleSwitchTab"
        >
          <template #mode-switch>
            <WorkspaceModeSwitch
              :active="activeTab"
              @change="activeTab = $event"
            />
          </template>
        </component>
      </KeepAlive>
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
  max-width: 1560px;
  margin: 0 auto;
}

.workspace-shell > * {
  min-height: 0;
  flex: 1;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .workspace-page {
    padding: 8px;
  }
}
</style>
