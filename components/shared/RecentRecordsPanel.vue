<script setup lang="ts">
type RecentRecordItem = {
  id: string
  title: string
  subtitle?: string
  meta?: string
}

const props = withDefaults(defineProps<{
  items: RecentRecordItem[]
  activeId?: string
  title?: string
  initiallyExpanded?: boolean
  emptyText?: string
  showClear?: boolean
  showDelete?: boolean
  clearLabel?: string
}>(), {
  activeId: '',
  title: '最近',
  initiallyExpanded: true,
  emptyText: '暂无记录',
  showClear: false,
  showDelete: false,
  clearLabel: '清空',
})

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
  clear: []
}>()

const isExpanded = shallowRef(props.initiallyExpanded)

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

function handleDelete(event: MouseEvent, id: string) {
  event.stopPropagation()
  emit('delete', id)
}

function handleClear(event: MouseEvent) {
  event.stopPropagation()
  emit('clear')
}
</script>

<template>
  <section class="recent-panel">
    <div class="recent-header">
      <button class="recent-header-trigger" type="button" @click="toggleExpanded">
        <span class="recent-title">{{ title }}</span>
        <span class="recent-arrow" :class="{ 'recent-arrow--expanded': isExpanded }">⌃</span>
      </button>

      <button
        v-if="showClear && items.length > 0"
        class="recent-clear"
        type="button"
        @click="handleClear"
      >
        {{ clearLabel }}
      </button>
    </div>

    <div v-if="isExpanded" class="recent-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="recent-item"
        :class="{ 'recent-item--active': activeId === item.id }"
      >
        <button class="recent-item-main" type="button" @click="emit('select', item.id)">
          <span class="recent-item-title">{{ item.title }}</span>
          <span v-if="item.subtitle" class="recent-item-subtitle">{{ item.subtitle }}</span>
          <span v-if="item.meta" class="recent-item-meta">{{ item.meta }}</span>
        </button>

        <button
          v-if="showDelete"
          class="recent-item-delete"
          type="button"
          aria-label="删除记录"
          @click="handleDelete($event, item.id)"
        >
          ×
        </button>
      </div>

      <p v-if="items.length === 0" class="recent-empty">
        {{ emptyText }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.recent-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.recent-header-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  padding: 0;
  border: none;
  background: transparent;
  color: #6b7280;
  font: inherit;
  cursor: pointer;
}

.recent-clear {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.recent-clear:hover {
  color: #4b5563;
}

.recent-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.recent-arrow {
  font-size: 12px;
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}

.recent-arrow--expanded {
  transform: rotate(0deg);
}

.recent-list {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  scrollbar-width: none;
}

.recent-list::-webkit-scrollbar {
  display: none;
}

.recent-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.recent-item:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.06);
}

.recent-item--active {
  background: rgba(209, 138, 17, 0.08);
  box-shadow: inset 0 0 0 1px rgba(209, 138, 17, 0.12);
}

.recent-item-main {
  display: flex;
  width: 100%;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: #111827;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.recent-item-delete {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.05);
  color: #9ca3af;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.recent-item:hover .recent-item-delete,
.recent-item--active .recent-item-delete {
  opacity: 1;
}

.recent-item-delete:hover {
  background: rgba(17, 24, 39, 0.08);
  color: #4b5563;
}

.recent-item-title {
  padding-right: 20px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.recent-item-subtitle,
.recent-item-meta,
.recent-empty {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.recent-empty {
  margin: 0;
  padding: 10px 2px 0;
}
</style>
