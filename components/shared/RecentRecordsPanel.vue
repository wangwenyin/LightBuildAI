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
        <span class="recent-arrow" :class="{ 'recent-arrow--expanded': isExpanded }" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path
              d="M3.5 6.25 8 10.75l4.5-4.5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.7"
            />
          </svg>
        </span>
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
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M5.25 5.25 10.75 10.75M10.75 5.25l-5.5 5.5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
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
  gap: 12px;
  min-height: 0;
}

.recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.06);
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
  transition: color 0.2s ease;
}

.recent-header-trigger:hover {
  color: #374151;
}

.recent-clear {
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #6b7280;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.recent-clear:hover {
  border-color: rgba(17, 24, 39, 0.14);
  background: rgba(255, 255, 255, 0.86);
  color: #111827;
}

.recent-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.recent-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #9ca3af;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}

.recent-arrow--expanded {
  transform: rotate(0deg);
}

.recent-arrow svg {
  width: 14px;
  height: 14px;
}

.recent-list {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  scrollbar-width: none;
}

.recent-list::-webkit-scrollbar {
  display: none;
}

.recent-item {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.06);
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.recent-item::before {
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 999px;
  background: transparent;
  content: '';
  transition: background-color 0.2s ease;
}

.recent-item:hover {
  background: rgba(255, 255, 255, 0.52);
}

.recent-item--active {
  border-color: rgba(191, 128, 24, 0.18);
  background:
    linear-gradient(90deg, rgba(191, 128, 24, 0.12), rgba(191, 128, 24, 0.02) 55%),
    rgba(255, 255, 255, 0.5);
}

.recent-item--active::before {
  background: linear-gradient(180deg, #f59e0b, #b45309);
}

.recent-item-main {
  display: grid;
  width: 100%;
  flex: 1;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    "title subtitle"
    ". meta";
  align-items: center;
  column-gap: 10px;
  row-gap: 2px;
  padding: 10px 40px 10px 12px;
  border: none;
  background: transparent;
  color: #111827;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.recent-item-delete {
  position: absolute;
  top: 50%;
  right: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.05);
  color: #9ca3af;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
  transition:
    opacity 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.recent-item:hover .recent-item-delete,
.recent-item--active .recent-item-delete {
  opacity: 1;
}

.recent-item-delete:hover {
  background: rgba(17, 24, 39, 0.08);
  color: #4b5563;
}

.recent-item-delete svg {
  width: 14px;
  height: 14px;
}

.recent-item-title {
  grid-area: title;
  flex: 0 0 auto;
  max-width: 84px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item-subtitle {
  grid-area: subtitle;
  flex: 1;
  min-width: 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.92;
}

.recent-item-meta,
.recent-empty {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.recent-item-meta {
  grid-area: meta;
  justify-self: start;
  color: #9ca3af;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.88;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.recent-empty {
  margin: 0;
  padding: 14px 2px 0;
}
</style>
