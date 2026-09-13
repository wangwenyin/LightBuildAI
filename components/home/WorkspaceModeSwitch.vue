<script setup lang="ts">
/**
 * 工作台模式切换器。
 *
 * 放在侧边栏的 nav 插槽里，而不是单独占一列——
 * 这样整体保持「侧边栏 + 内容区」两栏，避免出现重复的品牌栏。
 */
export type WorkspaceTab = 'image' | 'chat'

const props = defineProps<{
  active: WorkspaceTab
}>()

const emit = defineEmits<{
  change: [tab: WorkspaceTab]
}>()

const options: Array<{
  key: WorkspaceTab
  label: string
  description: string
  icon: string
}> = [
  {
    key: 'image',
    label: '夜景生成',
    description: '上传参考图或直接描述，生成商业夜景',
    icon: 'M12.75 4.5l1.6 4.15L18.5 10.25l-4.15 1.6-1.6 4.15-1.6-4.15L7 10.25l4.15-1.6 1.6-4.15z',
  },
  {
    key: 'chat',
    label: 'AI 聊天',
    description: '描述需求，Agent 打磨提示词',
    icon: 'M20.25 12c0 3.9-3.7 7.06-8.25 7.06-1.03 0-2.02-.16-2.93-.44L4.5 20.25l1.1-3.3A6.55 6.55 0 0 1 3.75 12c0-3.9 3.7-7.06 8.25-7.06s8.25 3.16 8.25 7.06z',
  },
]
</script>

<template>
  <div class="mode-switch" role="tablist" aria-label="工作台模式">
    <button
      v-for="option in options"
      :key="option.key"
      class="mode-switch__item"
      :class="{ 'mode-switch__item--active': props.active === option.key }"
      type="button"
      role="tab"
      :aria-selected="props.active === option.key"
      :title="option.description"
      @click="emit('change', option.key)"
    >
      <svg class="mode-switch__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          :d="option.icon"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.6"
        />
      </svg>
      <span class="mode-switch__label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.mode-switch {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-switch__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: #57534e;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
}

.mode-switch__item:hover {
  background: rgba(255, 255, 255, 0.7);
  color: #1f2937;
}

.mode-switch__item:focus-visible {
  outline: 2px solid #b45309;
  outline-offset: 2px;
}

.mode-switch__item--active {
  border-color: rgba(209, 138, 17, 0.22);
  background: rgba(209, 138, 17, 0.1);
  color: #713f12;
}

.mode-switch__item--active:hover {
  background: rgba(209, 138, 17, 0.14);
  color: #713f12;
}

.mode-switch__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.mode-switch__label {
  font-weight: 500;
  letter-spacing: 0.01em;
}
</style>
