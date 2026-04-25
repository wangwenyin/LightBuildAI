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
        <div v-if="isSidebarExpanded" class="sidebar-brand">
          <div class="brand-mark">
            LB
          </div>
          <div>
            <p class="brand-name">
              LightBuild AI
            </p>
            <p class="brand-subtitle">
              Image Workspace
            </p>
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
              d="M4.75 5.75A1.5 1.5 0 0 1 6.25 4.25h11.5a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5zm2 .5v11.5h10.5V6.25zm2.5 0v11.5"
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

            <button
              v-if="hasResultImage && activeView === 'result'"
              class="ghost-button ghost-button--dark"
              type="button"
              @click="downloadResult"
            >
              下载成片
            </button>
          </div>
        </div>

        <div class="image-stage">
          <div v-if="displayedImageUrl" class="image-wrapper">
            <img :src="displayedImageUrl" :alt="stageTitle" class="stage-image">
          </div>

          <label v-else class="empty-state" for="source-file-input">
            <span class="empty-badge">NIGHT</span>
            <strong class="empty-title">拖入或上传一张白天参考图</strong>
            <span class="empty-description">
              建议选择主体清晰、透视明确的商业街景或建筑立面，以获得更稳定、更真实的夜景表达。
            </span>
          </label>
        </div>

        <div class="stage-footer">
          <p class="stage-note">
            支持 JPG、PNG；建议使用清晰原图，避免严重逆光或主体过小。
          </p>

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
          <h2 class="prompt-title">
            上传图片，然后描述你想要的夜景气质。
          </h2>
        </div>

        <textarea
          v-model="customPrompt"
          class="prompt-textarea"
          placeholder="例如：整体更像高端商业街夜景，门头灯光克制而有层次，橱窗暖光通透，路面反射细腻，避免廉价霓虹感。"
          rows="5"
        />

        <div class="prompt-actions">
          <label class="ghost-button" for="source-file-input">
            {{ hasSourceImage ? '更换图片' : '上传参考图' }}
          </label>
          <button
            class="primary-button"
            type="button"
            :disabled="isLoading"
            @click="handleGenerate"
          >
            {{ primaryActionLabel }}
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="!canRetry || isLoading"
            @click="handleRetry"
          >
            重新生成
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
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 32px;
  background: rgba(250, 250, 249, 0.72);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

.image-layout--collapsed {
  grid-template-columns: 88px minmax(0, 1fr);
}

.image-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-right: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(244, 244, 245, 0.92);
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

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
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
  background: rgba(255, 255, 255, 0.72);
  color: #374151;
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
  border-radius: 16px;
  background: #111827;
  color: #f9fafb;
  font-size: 14px;
  font-weight: 700;
}

.image-main {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  padding: 24px;
}

.studio-stage-card,
.prompt-card {
  position: relative;
  overflow: hidden;
  padding: 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
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

.prompt-title,
.stage-title {
  margin: 0;
  color: #111827;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  letter-spacing: -0.02em;
}

.stage-note {
  margin: 16px 0 0;
  max-width: 720px;
  color: #4b5563;
  font-size: 15px;
  line-height: 1.9;
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
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.15;
}

.image-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 720px;
  margin-top: 24px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(250, 250, 249, 0.88), rgba(229, 231, 235, 0.82)),
    #f5f5f4;
  overflow: hidden;
}

.image-wrapper {
  width: 100%;
  height: 100%;
}

.stage-image {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 820px;
  object-fit: contain;
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
  min-height: 108px;
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
  min-height: 48px;
  padding: 0 22px;
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
  justify-content: space-between;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
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

  .image-stage {
    min-height: 480px;
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

  .prompt-textarea {
    padding: 16px 18px;
  }

  .primary-button,
  .ghost-button {
    width: 100%;
  }
}
</style>
