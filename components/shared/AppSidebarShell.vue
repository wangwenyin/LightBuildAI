<script setup lang="ts">
const props = withDefaults(defineProps<{
  expanded: boolean
  subtitle: string
  actionLabel: string
  collapsedActionLabel?: string
  brandTitle?: string
}>(), {
  collapsedActionLabel: '+',
  brandTitle: 'LightBuild',
})

defineEmits<{
  toggle: []
  action: []
}>()
</script>

<template>
  <aside
    class="app-sidebar-shell"
    :class="{ 'app-sidebar-shell--collapsed': !props.expanded }"
  >
    <div class="sidebar-top">
      <div class="sidebar-brand" :class="{ 'sidebar-brand--collapsed': !props.expanded }">
        <div class="brand-mark">
          LB
        </div>

        <div v-if="props.expanded" class="brand-copy">
          <p class="brand-name">{{ props.brandTitle }}</p>
          <p class="brand-subtitle">{{ props.subtitle }}</p>
        </div>
      </div>

      <button
        class="sidebar-toggle"
        :class="{ 'sidebar-toggle--collapsed': !props.expanded }"
        type="button"
        :aria-label="props.expanded ? '收起侧边栏' : '展开侧边栏'"
        @click="$emit('toggle')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5.75 6.75h12.5M5.75 12h12.5M5.75 17.25h12.5M8.75 4.75 5.25 8l3.5 3.25"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.6"
          />
        </svg>
      </button>
    </div>

    <button class="sidebar-action-button" type="button" @click="$emit('action')">
      <template v-if="!props.expanded">
        <slot name="action-icon">
          <span>{{ props.collapsedActionLabel }}</span>
        </slot>
      </template>
      <span v-else>{{ props.actionLabel }}</span>
    </button>

    <div v-if="props.expanded" class="sidebar-content">
      <slot />
    </div>

    <div v-if="props.expanded" class="sidebar-footer">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped lang="scss">
.app-sidebar-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-right: 1px solid rgba(17, 24, 39, 0.08);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.5);
  transition:
    padding 0.28s ease,
    gap 0.28s ease,
    background-color 0.28s ease,
    border-color 0.28s ease;
}

.sidebar-top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-brand--collapsed {
  width: 100%;
  justify-content: center;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 30% 30%, rgba(245, 158, 11, 0.92), rgba(180, 83, 9, 0.96) 70%),
    #111827;
  color: #fff7ed;
  font-size: 14px;
  font-weight: 700;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 12px 28px rgba(180, 83, 9, 0.2);
  transition: transform 0.24s ease, box-shadow 0.24s ease;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-brand:hover .brand-mark {
  transform: translateY(-1px) scale(1.02);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 16px 36px rgba(180, 83, 9, 0.24);
}

.brand-name,
.brand-subtitle {
  margin: 0;
}

.brand-name {
  color: #111827;
  font-size: 15px;
  font-weight: 700;
}

.brand-subtitle {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.7;
}

.sidebar-toggle,
.sidebar-action-button {
  border: none;
  font: inherit;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.72);
  color: #374151;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.sidebar-toggle svg,
.sidebar-action-button svg {
  width: 18px;
  height: 18px;
}

.app-sidebar-shell--collapsed .sidebar-toggle svg {
  transform: scaleX(-1);
}

.sidebar-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, #111827, #1f2937);
  color: #f9fafb;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 1px;
  box-shadow: 0 18px 40px rgba(17, 24, 39, 0.14);
  transform-origin: top center;
  transition:
    transform 0.24s ease,
    box-shadow 0.24s ease,
    background-color 0.24s ease,
    color 0.24s ease,
    border-color 0.24s ease,
    opacity 0.2s ease,
    max-height 0.24s ease,
    min-height 0.24s ease,
    padding 0.24s ease,
    margin 0.24s ease;
}

.sidebar-toggle:hover,
.sidebar-action-button:hover {
  transform: translateY(-1px);
}

.app-sidebar-shell--collapsed .sidebar-top {
  width: 100%;
  justify-content: center;
}

.app-sidebar-shell--collapsed .sidebar-brand {
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 0.2s ease,
    transform 0.24s ease;
}

.app-sidebar-shell--collapsed .sidebar-action-button {
  min-height: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  box-shadow: none;
}

.app-sidebar-shell--collapsed .sidebar-toggle {
  position: absolute;
  top: 50%;
  right: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(6px);
}

.app-sidebar-shell--collapsed .sidebar-top:hover .sidebar-brand {
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
}

.app-sidebar-shell--collapsed .sidebar-top:hover .sidebar-toggle {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%) translateX(0);
}

.sidebar-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.sidebar-footer {
  margin-top: auto;
}

@media (max-width: 640px) {
  .app-sidebar-shell {
    padding: 16px;
  }
}
</style>
