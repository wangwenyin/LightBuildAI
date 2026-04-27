<script setup lang="ts">
import RecentRecordsPanel from '~/components/shared/RecentRecordsPanel.vue'
import { useLocalImageHistory } from '~/composables/useLocalImageHistory'

const {
  activeView,
  canRetry,
  customPrompt,
  currentTaskId,
  displayedImageUrl,
  downloadResult,
  generateNightImage,
  hasResultImage,
  hasSourceImage,
  isLoading,
  loadingText,
  onFileChange,
  resetGenerator,
  restoreHistorySnapshot,
  resultUrl,
  retryGenerate,
  setActiveView,
  sourcePreviewUrl,
  statusVariant,
  taskStatus,
} = useNightImageGenerator()

const {
  clearRecords,
  deleteRecord,
  getLatestRecord,
  getRecord,
  loadRecords,
  records,
  saveRecord,
} = useLocalImageHistory()

const isSidebarExpanded = shallowRef(true)
const activeHistoryId = shallowRef('')
const draftHistoryId = shallowRef('')
const shouldAnimateResultReveal = shallowRef(false)
let resultRevealTimer: ReturnType<typeof window.setTimeout> | null = null

const stageTitle = computed(() => {
  if (hasResultImage.value && activeView.value === 'result') {
    return '夜景成片'
  }

  if (hasSourceImage.value) {
    return '参考原图'
  }

  return '上传参考图，开始夜景生成'
})

const primaryActionLabel = computed(() => {
  if (isLoading.value) {
    return loadingText.value
  }

  return hasResultImage.value ? '再次生成' : '开始生成夜景'
})

const recentRecords = computed(() => records.value.map(record => ({
  id: record.id,
  title: record.title,
  subtitle: record.prompt || '未填写提示词',
  meta: formatRelativeTime(record.updatedAt),
})))

const stageFrameClasses = computed(() => ({
  'image-stage--loading': isLoading.value && hasSourceImage.value,
}))

const imageWrapperClasses = computed(() => ({
  'image-wrapper--result': activeView.value === 'result' && hasResultImage.value,
  'image-wrapper--reveal': shouldAnimateResultReveal.value && activeView.value === 'result' && hasResultImage.value,
}))

onMounted(() => {
  loadRecords()

  const latestRecord = getLatestRecord()

  if (latestRecord) {
    openHistory(latestRecord.id)
  } else {
    draftHistoryId.value = createHistoryId()
  }
})

watch(
  () => [
    sourcePreviewUrl.value,
    resultUrl.value,
    customPrompt.value,
    taskStatus.value,
    currentTaskId.value,
  ],
  () => {
    if (!sourcePreviewUrl.value && !resultUrl.value) {
      return
    }

    if (!draftHistoryId.value) {
      draftHistoryId.value = createHistoryId()
    }

    saveRecord({
      id: draftHistoryId.value,
      taskId: currentTaskId.value || undefined,
      prompt: customPrompt.value,
      sourceImageUrl: sourcePreviewUrl.value,
      resultImageUrl: resultUrl.value,
      status: taskStatus.value,
    })
  },
)

watch(resultUrl, (nextValue, previousValue) => {
  if (!nextValue || nextValue === previousValue) {
    return
  }

  shouldAnimateResultReveal.value = true

  if (resultRevealTimer) {
    window.clearTimeout(resultRevealTimer)
  }

  resultRevealTimer = window.setTimeout(() => {
    shouldAnimateResultReveal.value = false
    resultRevealTimer = null
  }, 2200)
})

onBeforeUnmount(() => {
  if (!resultRevealTimer) {
    return
  }

  window.clearTimeout(resultRevealTimer)
})

function toggleSidebar() {
  isSidebarExpanded.value = !isSidebarExpanded.value
}

function createHistoryId() {
  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatRelativeTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function openHistory(recordId: string) {
  const record = getRecord(recordId)

  if (!record) {
    return
  }

  activeHistoryId.value = record.id
  draftHistoryId.value = record.id
  restoreHistorySnapshot({
    sourceImageUrl: record.sourceImageUrl,
    resultImageUrl: record.resultImageUrl,
    prompt: record.prompt,
    status: record.status,
    taskId: record.taskId,
  })
}

function handleNewTask() {
  activeHistoryId.value = ''
  draftHistoryId.value = createHistoryId()
  resetGenerator()
}

function handleDeleteRecord(recordId: string) {
  deleteRecord(recordId)

  if (activeHistoryId.value !== recordId && draftHistoryId.value !== recordId) {
    return
  }

  const latestRecord = getLatestRecord()

  if (latestRecord) {
    openHistory(latestRecord.id)
    return
  }

  handleNewTask()
}

function handleClearRecords() {
  clearRecords()
  handleNewTask()
}

function handleFileSelect(event: Event) {
  if (!draftHistoryId.value || activeHistoryId.value) {
    draftHistoryId.value = createHistoryId()
    activeHistoryId.value = ''
  }

  onFileChange(event)
}

async function handleGenerate() {
  try {
    if (!draftHistoryId.value) {
      draftHistoryId.value = createHistoryId()
    }

    await generateNightImage()
    activeHistoryId.value = draftHistoryId.value
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成失败'
    window.alert(`失败：${message}`)
  }
}

async function handleRetry() {
  try {
    await retryGenerate()
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成失败'
    window.alert(`失败：${message}`)
  }
}
</script>

<template>
  <section class="image-layout" :class="{ 'image-layout--collapsed': !isSidebarExpanded }">
    <aside class="image-sidebar">
      <div class="sidebar-top">
        <div class="sidebar-brand" :class="{ 'sidebar-brand--collapsed': !isSidebarExpanded }">
          <div class="brand-mark">
            LB
          </div>

          <div v-if="isSidebarExpanded" class="brand-copy">
            <p class="brand-name">LightBuild</p>
            <p class="brand-subtitle">Night Studio</p>
          </div>
        </div>

        <button
          class="sidebar-toggle"
          :class="{ 'sidebar-toggle--collapsed': !isSidebarExpanded }"
          type="button"
          :aria-label="isSidebarExpanded ? '收起侧边栏' : '展开侧边栏'"
          @click="toggleSidebar"
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

      <button class="new-task-button" type="button" @click="handleNewTask">
        <span v-if="isSidebarExpanded">新建任务</span>
        <span v-else>+</span>
      </button>

      <RecentRecordsPanel
        v-if="isSidebarExpanded"
        title="最近"
        :items="recentRecords"
        :active-id="activeHistoryId"
        empty-text="暂无生成记录"
        show-clear
        show-delete
        @select="openHistory"
        @delete="handleDeleteRecord"
        @clear="handleClearRecords"
      />
    </aside>

    <main class="image-main">
      <div class="studio-stage-card">
        <div class="stage-header">
          <div class="stage-title-group">
            <p class="section-label">
              Visual Stage
            </p>
            <h2 class="stage-title">
              {{ stageTitle }}
            </h2>
          </div>

          <div class="stage-tools">
            <div v-if="hasSourceImage" class="view-switch" role="tablist" aria-label="切换预览">
              <button
                class="view-switch-button"
                :class="{ 'view-switch-button--active': activeView === 'source' }"
                type="button"
                @click="setActiveView('source')"
              >
                原图
              </button>
              <button
                class="view-switch-button"
                :class="{ 'view-switch-button--active': activeView === 'result' }"
                type="button"
                :disabled="!hasResultImage"
                @click="setActiveView('result')"
              >
                夜景
              </button>
            </div>
          </div>
        </div>

        <div class="image-stage" :class="stageFrameClasses">
          <div v-if="displayedImageUrl" class="image-wrapper" :class="imageWrapperClasses">
            <img :src="displayedImageUrl" :alt="stageTitle" class="stage-image">

            <div v-if="isLoading && hasSourceImage" class="curtain-overlay" aria-hidden="true">
              <div class="curtain-sweep" />
              <div class="curtain-glow" />
              <div class="curtain-caption">
                {{ loadingText }}
              </div>
            </div>

            <button
              v-if="hasResultImage && activeView === 'result'"
              class="download-float-button"
              aria-label="下载成片"
              type="button"
              @click="downloadResult"
            >
              <span class="download-float-button__icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path
                    d="M10 3.75v8.5m0 0 3-3m-3 3-3-3m-3 5.25h12"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                </svg>
              </span>
            </button>
          </div>

          <label v-else class="empty-state" for="source-file-input">
            <span class="empty-badge">NIGHT</span>
            <strong class="empty-title">拖入或上传一张白天参考图</strong>
            <span class="empty-description">
              建议选择主体清晰、透视明确的商业街景或建筑立面，以获得更稳定、更真实的夜景表达。
            </span>
          </label>
        </div>

        <div class="stage-footer" v-if="false">
          <div v-if="taskStatus" class="status-pill" :class="`status-pill--${statusVariant}`">
            {{ taskStatus }}
          </div>
        </div>
      </div>

      <section class="prompt-card">
        <div class="prompt-header">
          <p class="section-label">
            Prompt Composer
          </p>
        </div>

        <textarea
          v-model="customPrompt"
          class="prompt-textarea"
          placeholder="请描述你想要的夜景气质..."
          rows="2"
        />

        <div class="prompt-actions">
          <button
            class="primary-button"
            type="button"
            :disabled="isLoading"
            @click="handleGenerate"
          >
            {{ primaryActionLabel }}
          </button>
        </div>

        <input
          id="source-file-input"
          class="visually-hidden"
          type="file"
          accept="image/*"
          @change="handleFileSelect"
        >
      </section>
    </main>
  </section>
</template>

<style scoped>
.image-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: calc(100vh - 210px);
  min-height: calc(100dvh - 210px);
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 16px;
  background:
    radial-gradient(circle at top left, rgba(255, 244, 214, 0.4), transparent 22%),
    rgba(250, 250, 249, 0.72);
  box-shadow:
    0 24px 80px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(18px);
}

.image-layout--collapsed {
  grid-template-columns: 88px minmax(0, 1fr);
}

.image-layout--collapsed .image-sidebar {
  align-items: center;
  padding-inline: 14px;
}

.image-layout--collapsed .sidebar-top {
  width: 100%;
  justify-content: center;
  .sidebar-brand {
    display: none;
  }
}

.image-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-right: 1px solid rgba(17, 24, 39, 0.08);
  background:
    linear-gradient(180deg, rgba(248, 247, 244, 0.96), rgba(240, 238, 233, 0.92)),
    rgba(244, 244, 245, 0.92);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.5);
}

.sidebar-top {
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

.brand-name {
  margin: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 700;
}

.brand-subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.7;
}

.sidebar-toggle,
.new-task-button,
.view-switch-button,
.primary-button,
.ghost-button {
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
  border-radius: 12px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.72);
  color: #374151;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.sidebar-toggle svg,
.new-task-button svg {
  width: 18px;
  height: 18px;
}

.sidebar-toggle--collapsed svg {
  transform: scaleX(-1);
}

.new-task-button {
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
}

.image-main {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  padding: 16px;
}

.studio-stage-card,
.prompt-card {
  position: relative;
  overflow: hidden;
  padding: 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.76)),
    rgba(255, 255, 255, 0.78);
  box-shadow:
    0 24px 80px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
}

.section-label {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.stage-title {
  margin: 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  letter-spacing: -0.02em;
}

.stage-header,
.stage-tools,
.prompt-header,
.prompt-actions {
  display: flex;
  align-items: center;
}

.stage-header,
.prompt-header {
  justify-content: space-between;
  gap: 16px;
}

.stage-tools,
.prompt-actions {
  gap: 12px;
}

.stage-title {
  font-size: clamp(24px, 3vw, 28px);
  line-height: 1.15;
}

.image-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  margin-top: 24px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(250, 250, 249, 0.88), rgba(229, 231, 235, 0.82)),
    #f5f5f4;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.image-wrapper {
  position: relative;
  width: 100%;
  height: 420px;
}

.image-wrapper--result {
  background: #080b13;
}

.image-wrapper--reveal::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(5, 8, 18, 0.92), rgba(8, 11, 19, 0.82) 42%, rgba(8, 11, 19, 0));
  box-shadow: 12px 0 32px rgba(251, 191, 36, 0.18);
  content: '';
  pointer-events: none;
  animation: resultRevealSweep 2.2s cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
}

.image-wrapper--reveal::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(251, 191, 36, 0), rgba(251, 191, 36, 0.22), rgba(255, 248, 220, 0));
  content: '';
  pointer-events: none;
  animation: resultRevealHighlight 2.2s cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
}

.stage-image {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 820px;
  object-fit: contain;
}

.image-stage--loading {
  background:
    radial-gradient(circle at top, rgba(255, 237, 213, 0.32), transparent 42%),
    linear-gradient(180deg, rgba(250, 250, 249, 0.88), rgba(229, 231, 235, 0.82)),
    #f5f5f4;
}

.curtain-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.curtain-sweep {
  position: relative;
  width: 68%;
  min-width: 360px;
  height: 100%;
  background:
    linear-gradient(180deg, rgba(10, 12, 24, 0.96), rgba(30, 20, 30, 0.84)),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.09) 0,
      rgba(255, 255, 255, 0.09) 18px,
      rgba(10, 15, 26, 0) 18px,
      rgba(10, 15, 26, 0) 28px
    );
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.28);
  animation: curtainSweepAcross 5.4s cubic-bezier(0.18, 0.82, 0.16, 1) infinite;
}

.curtain-sweep::after {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 24px;
  background:
    linear-gradient(180deg, rgba(251, 191, 36, 0.56), rgba(251, 191, 36, 0.14)),
    linear-gradient(90deg, rgba(255, 248, 220, 0.7), rgba(255, 248, 220, 0));
  content: '';
  box-shadow: 0 0 26px rgba(251, 191, 36, 0.24);
}

.curtain-sweep::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.18));
  content: '';
}

.curtain-glow {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 22%;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0), rgba(245, 158, 11, 0.24), rgba(245, 158, 11, 0));
  filter: blur(18px);
  animation: curtainGlowAcross 5.4s cubic-bezier(0.18, 0.82, 0.16, 1) infinite;
}

.curtain-caption {
  position: absolute;
  left: 50%;
  bottom: 28px;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(8, 14, 28, 0.52);
  color: #f8fafc;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.empty-state {
  display: flex;
  width: min(520px, 100%);
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
}

.empty-badge {
  padding: 8px 14px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #111827;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
}

.empty-title {
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  font-size: 30px;
  line-height: 1.3;
}

.empty-description {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.9;
}

.stage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
}

.status-pill {
  flex-shrink: 0;
  padding: 12px 16px;
  border-radius: 999px;
  font-size: 13px;
  line-height: 1.6;
}

.status-pill--neutral,
.status-pill--info {
  background: rgba(15, 23, 42, 0.06);
  color: #1f2937;
}

.status-pill--success {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.status-pill--error {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.view-switch {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
}

.view-switch-button {
  padding: 10px 14px;
  border-radius: 999px;
  background: transparent;
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
}

.view-switch-button--active {
  background: #fff;
  color: #111827;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.view-switch-button:disabled,
.primary-button:disabled,
.ghost-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.prompt-textarea {
  width: 100%;
  margin-top: 18px;
  padding: 2px 2px 12px;
  border: none;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 15px;
  line-height: 1.9;
  resize: vertical;
  outline: none;
}

.ghost-button {
  padding: 12px 16px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #1f2937;
  font-size: 14px;
}

.ghost-button:hover:not(:disabled),
.sidebar-toggle:hover,
.new-task-button:hover {
  transform: translateY(-1px);
}

.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 32px;
  border-radius: 999px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 14px 30px rgba(17, 24, 39, 0.16);
}

.ghost-button--dark {
  background: rgba(17, 24, 39, 0.92);
  color: #f9fafb;
}

.prompt-actions {
  justify-content: center;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
}

.download-float-button {
  position: absolute;
  right: 14px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(8, 12, 22, 0.36);
  color: #f8fafc;
  cursor: pointer;
  opacity: 0.58;
  backdrop-filter: blur(16px);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.download-float-button:hover {
  transform: translateY(-2px);
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(8, 12, 22, 0.76);
  opacity: 1;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.2);
}

.download-float-button__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.download-float-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.download-float-button__icon svg {
  width: 16px;
  height: 16px;
}

@keyframes curtainSweepAcross {
  0% {
    transform: translateX(-112%);
  }

  22% {
    transform: translateX(-96%);
  }

  100% {
    transform: translateX(158%);
  }
}

@keyframes curtainGlowAcross {
  0% {
    transform: translateX(-120%);
    opacity: 0;
  }

  18% {
    opacity: 0.16;
  }

  48% {
    opacity: 0.48;
  }

  100% {
    transform: translateX(300%);
    opacity: 0.72;
  }
}

@keyframes resultRevealSweep {
  0% {
    transform: translateX(0);
    opacity: 1;
  }

  78% {
    transform: translateX(76%);
    opacity: 1;
  }

  100% {
    transform: translateX(110%);
    opacity: 0;
  }
}

@keyframes resultRevealHighlight {
  0% {
    transform: translateX(-34%);
    opacity: 0;
  }

  24% {
    opacity: 1;
  }

  84% {
    transform: translateX(82%);
    opacity: 1;
  }

  100% {
    transform: translateX(108%);
    opacity: 0;
  }
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

@media (max-width: 1080px) {
  .image-layout {
    grid-template-columns: 1fr;
  }

  .image-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(17, 24, 39, 0.08);
  }
}

@media (max-width: 960px) {
  .stage-header,
  .prompt-header,
  .stage-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .prompt-actions {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .image-main {
    padding: 16px;
  }

  .image-sidebar {
    padding: 16px;
  }

  .studio-stage-card,
  .prompt-card {
    padding: 20px;
    border-radius: 24px;
  }

  .stage-title,
  .empty-title {
    font-size: 24px;
  }

  .image-stage {
    min-height: 340px;
    border-radius: 22px;
  }

  .download-float-button {
    right: 10px;
    bottom: 2px;
  }

  .prompt-textarea {
    padding: 16px 18px;
  }

  .primary-button,
  .ghost-button {
    width: 100%;
  }
}
</style>
