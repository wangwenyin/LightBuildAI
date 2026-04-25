<script setup lang="ts">
const {
  activeView,
  canRetry,
  customPrompt,
  displayedImageUrl,
  downloadResult,
  generateNightImage,
  hasResultImage,
  hasSourceImage,
  isLoading,
  loadingText,
  onFileChange,
  setActiveView,
  statusVariant,
  taskStatus,
  retryGenerate,
} = useNightImageGenerator()

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

async function handleGenerate() {
  try {
    await generateNightImage()
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
  <section class="image-studio">
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
        @change="onFileChange"
      >
    </section>
  </section>
</template>

<style scoped>
.image-studio {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.studio-stage-card,
.prompt-card {
  position: relative;
  overflow: hidden;
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

.studio-stage-card,
.prompt-card {
  padding: 28px;
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
  border-radius: 0;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 15px;
  line-height: 1.9;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.prompt-textarea:focus {
  box-shadow: none;
  background: transparent;
}

.ghost-button {
  padding: 12px 16px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #1f2937;
  font-size: 14px;
}

.ghost-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(17, 24, 39, 0.2);
  background: #fff;
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

.primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 18px 36px rgba(17, 24, 39, 0.2);
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
    border-radius: 20px;
  }

  .primary-button,
  .ghost-button {
    width: 100%;
  }
}
</style>
