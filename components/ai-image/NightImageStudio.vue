<script setup lang="ts">
import { defaultNightPromptRules } from '~/shared/nightPrompt'
import { getProviderLabel, useNightImageGenerator } from '~/composables/useNightImageGenerator'

const quickPromptChips = [
  '灯光更高级，适合商业街宣传',
  '树上灯笼更密一些，但保持真实感',
  '广告牌清晰发光，整体更繁华',
  '画面更通透，减少暗部死黑',
]

const {
  activeView,
  canRetry,
  copyTaskId,
  currentProvider,
  currentRequestId,
  currentSeed,
  currentSize,
  currentTaskId,
  customNegativePrompt,
  customPrompt,
  displayedImageUrl,
  downloadResult,
  generateNightImage,
  hasResultImage,
  hasSourceImage,
  isLoading,
  loadingText,
  onFileChange,
  revisedPrompt,
  revisePrompt,
  sourceFileHint,
  statusVariant,
  taskStatus,
  retryGenerate,
  setActiveView,
} = useNightImageGenerator()

const providerLabel = computed(() => getProviderLabel(currentProvider.value))
const showDebugPanel = computed(() => Boolean(currentTaskId.value || currentProvider.value || currentRequestId.value || revisedPrompt.value))

const promptRuleCount = computed(() => defaultNightPromptRules.length)
const stageTitle = computed(() => {
  if (hasResultImage.value && activeView.value === 'result') {
    return '生成结果'
  }

  if (hasSourceImage.value) {
    return '原始参考图'
  }

  return '等待上传参考图'
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

async function handleCopyTaskId() {
  try {
    await copyTaskId()
  } catch (error) {
    const message = error instanceof Error ? error.message : '复制失败'
    window.alert(message)
  }
}

function appendPrompt(promptSegment: string) {
  customPrompt.value = customPrompt.value
    ? `${customPrompt.value}；${promptSegment}`
    : promptSegment
}
</script>

<template>
  <div class="studio-page">
    <div class="studio-shell">
      <header class="hero-card">
        <div class="hero-copy">
          <p class="hero-kicker">LIGHTBUILD AI</p>
          <h1 class="hero-title">商业夜景 AI 出图工作台</h1>
          <p class="hero-description">
            上传参考图，系统自动叠加专业夜景渲染规则，并结合你的个性化提示词生成更稳定、更高级的商业街效果图。
          </p>
        </div>
        <div class="hero-metrics">
          <div class="metric-card">
            <span class="metric-label">系统规则</span>
            <strong class="metric-value">{{ promptRuleCount }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">任务状态</span>
            <strong class="metric-value">{{ isLoading ? loadingText : '待开始' }}</strong>
          </div>
        </div>
      </header>

      <main class="workspace-grid">
        <section class="stage-card">
          <div class="stage-toolbar">
            <div>
              <p class="section-eyebrow">预览区</p>
              <h2 class="section-title">{{ stageTitle }}</h2>
            </div>

            <div v-if="hasSourceImage" class="view-switch">
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
                结果
              </button>
            </div>
          </div>

          <div class="image-stage">
            <div v-if="displayedImageUrl" class="image-wrapper">
              <img :src="displayedImageUrl" :alt="stageTitle" class="stage-image">

              <button
                v-if="hasResultImage && activeView === 'result'"
                class="download-button"
                type="button"
                @click="downloadResult"
              >
                下载图片
              </button>
            </div>

            <label v-else class="empty-state" for="source-file-input">
              <span class="empty-icon">✦</span>
              <strong class="empty-title">上传一张白天街景或商业外立面图片</strong>
              <span class="empty-description">
                支持 JPG、PNG，建议上传主体清晰、透视明确的图片，以获得更稳定的夜景生成效果。
              </span>
            </label>
          </div>

          <div v-if="taskStatus" class="status-bar" :class="`status-bar--${statusVariant}`">
            {{ taskStatus }}
          </div>
        </section>

        <aside class="control-card">
          <div class="panel-block">
            <div class="block-heading">
              <div>
                <p class="section-eyebrow">工作区</p>
                <h2 class="section-title">上传与设置</h2>
              </div>

              <label class="upload-button" for="source-file-input">
                选择图片
              </label>
              <input
                id="source-file-input"
                class="visually-hidden"
                type="file"
                accept="image/*"
                @change="onFileChange"
              >
            </div>
            <p v-if="sourceFileHint" class="panel-tip">
              {{ sourceFileHint }}
            </p>
          </div>

          <div class="panel-block">
            <p class="section-eyebrow">提示词</p>
            <h2 class="section-title">补充你的创作要求</h2>
            <p class="panel-tip">
              系统会自动注入 {{ promptRuleCount }} 条通用生图规则，你只需要描述本次想强调的风格、氛围、灯光或细节。
            </p>
            <textarea
              v-model="customPrompt"
              class="prompt-textarea"
              placeholder="请输入对图片画面的要求"
              rows="6"
            />

            <label class="toggle-row">
              <input
                v-model="revisePrompt"
                class="toggle-checkbox"
                type="checkbox"
              >
              <span>开启混元自动扩写提示词</span>
            </label>

            <textarea
              v-model="customNegativePrompt"
              class="prompt-textarea prompt-textarea--secondary"
              placeholder="请输入不希望出现的问题，例如：不要白天感、不要乱码广告字、不要室内过亮"
              rows="4"
            />

            <p class="panel-tip">
              负向提示词会与系统默认约束一起提交；如果上传参考图，即使关闭扩写，接口仍可能继续自动扩写。
            </p>

            <div class="chip-list">
              <button
                v-for="chip in quickPromptChips"
                :key="chip"
                class="chip-button"
                type="button"
                @click="appendPrompt(chip)"
              >
                {{ chip }}
              </button>
            </div>
          </div>

          <div class="panel-block panel-block--actions">
            <button
              class="primary-button"
              type="button"
              :disabled="isLoading"
              @click="handleGenerate"
            >
              {{ isLoading ? loadingText : '开始生成夜景' }}
            </button>

            <div class="secondary-actions">
              <button
                class="secondary-button"
                type="button"
                :disabled="!canRetry || isLoading"
                @click="handleRetry"
              >
                重新生成
              </button>
              <button
                class="secondary-button"
                type="button"
                :disabled="!currentTaskId"
                @click="handleCopyTaskId"
              >
                复制任务号
              </button>
            </div>
          </div>

          <div v-if="showDebugPanel" class="panel-block">
            <p class="section-eyebrow">调试信息</p>
            <h2 class="section-title">当前生成通道</h2>
            <dl class="debug-meta">
              <div class="debug-meta-row">
                <dt>生成通道</dt>
                <dd>{{ providerLabel }}</dd>
              </div>
              <div v-if="currentTaskId" class="debug-meta-row">
                <dt>任务号</dt>
                <dd>{{ currentTaskId }}</dd>
              </div>
              <div v-if="currentRequestId" class="debug-meta-row">
                <dt>请求 ID</dt>
                <dd>{{ currentRequestId }}</dd>
              </div>
              <div v-if="currentSize" class="debug-meta-row">
                <dt>生成尺寸</dt>
                <dd>{{ currentSize }}</dd>
              </div>
              <div v-if="currentSeed !== null" class="debug-meta-row">
                <dt>随机种子</dt>
                <dd>{{ currentSeed }}</dd>
              </div>
            </dl>
            <h3 v-if="revisedPrompt" class="debug-subtitle">模型实际扩写 Prompt</h3>
            <p v-if="revisedPrompt" class="debug-prompt">
              {{ revisedPrompt }}
            </p>
          </div>
        </aside>
      </main>
    </div>
  </div>
</template>

<style scoped>
.studio-page {
  min-height: 100vh;
  padding: 32px;
  background:
    radial-gradient(circle at top left, rgba(94, 106, 210, 0.18), transparent 30%),
    radial-gradient(circle at top right, rgba(0, 196, 255, 0.12), transparent 24%),
    linear-gradient(180deg, #f4f7fb 0%, #eef2f8 100%);
}

.studio-shell {
  max-width: 1440px;
  margin: 0 auto;
}

.hero-card,
.stage-card,
.control-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
  padding: 28px;
  border-radius: 28px;
}

.hero-copy {
  max-width: 760px;
}

.hero-kicker,
.section-eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #64748b;
  text-transform: uppercase;
}

.hero-title,
.section-title {
  margin: 0;
  color: #0f172a;
}

.hero-title {
  font-size: 36px;
  line-height: 1.15;
}

.hero-description {
  margin: 16px 0 0;
  font-size: 15px;
  line-height: 1.75;
  color: #475569;
}

.hero-metrics {
  display: grid;
  min-width: 260px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 120px;
  padding: 18px;
  border-radius: 20px;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
}

.metric-label {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.7);
}

.metric-value {
  font-size: 28px;
  line-height: 1.1;
  color: #f8fafc;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(360px, 420px);
  gap: 24px;
}

.stage-card,
.control-card {
  border-radius: 28px;
}

.stage-card {
  padding: 24px;
}

.stage-toolbar,
.block-heading,
.panel-block--actions,
.secondary-actions {
  display: flex;
  align-items: center;
}

.stage-toolbar,
.block-heading {
  justify-content: space-between;
  gap: 16px;
}

.image-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 680px;
  margin-top: 18px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.9), rgba(226, 232, 240, 0.82)),
    #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.22);
  overflow: hidden;
}

.image-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.stage-image {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 720px;
  object-fit: contain;
  background: linear-gradient(180deg, #f8fafc, #e2e8f0);
}

.download-button {
  position: absolute;
  right: 20px;
  bottom: 20px;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.28);
}

.download-button:hover {
  background: #020617;
}

.empty-state {
  display: flex;
  width: min(520px, 100%);
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  color: #334155;
  text-align: center;
  cursor: pointer;
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 68px;
  border-radius: 22px;
  background: linear-gradient(135deg, #dbeafe, #e9d5ff);
  font-size: 30px;
  color: #1d4ed8;
}

.empty-title {
  font-size: 20px;
  color: #0f172a;
}

.empty-description,
.panel-tip,
.task-id {
  font-size: 14px;
  line-height: 1.7;
  color: #64748b;
}

.status-bar {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.6;
}

.status-bar--neutral,
.status-bar--info {
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
}

.status-bar--success {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.status-bar--error {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
}

.view-switch {
  display: inline-flex;
  gap: 8px;
  padding: 6px;
  border-radius: 999px;
  background: #e2e8f0;
}

.view-switch-button,
.chip-button,
.upload-button,
.secondary-button,
.primary-button {
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-switch-button {
  padding: 10px 14px;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.view-switch-button--active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.view-switch-button:disabled,
.secondary-button:disabled,
.primary-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.control-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
}

.panel-block {
  padding: 20px;
  border-radius: 24px;
  background: rgba(248, 250, 252, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.prompt-textarea {
  width: 100%;
  min-height: 144px;
  margin-top: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 18px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  line-height: 1.7;
  resize: vertical;
  outline: none;
}

.prompt-textarea--secondary {
  min-height: 112px;
}

.prompt-textarea:focus {
  border-color: rgba(59, 130, 246, 0.45);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.08);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  color: #334155;
  font-size: 14px;
  line-height: 1.6;
}

.toggle-checkbox {
  width: 16px;
  height: 16px;
}

.debug-prompt {
  margin: 12px 0 0;
  padding: 14px 16px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: #334155;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.debug-meta {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
}

.debug-meta-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.debug-meta-row dt {
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.debug-meta-row dd {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  text-align: right;
  word-break: break-word;
}

.debug-subtitle {
  margin: 16px 0 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.chip-button {
  padding: 10px 14px;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.chip-button:hover,
.secondary-button:hover {
  border-color: rgba(59, 130, 246, 0.32);
  color: #1d4ed8;
}

.upload-button,
.secondary-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 18px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
}

.upload-button {
  background: #e2e8f0;
  color: #0f172a;
}

.primary-button {
  width: 100%;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  box-shadow: 0 14px 28px rgba(79, 70, 229, 0.28);
}

.primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 18px 32px rgba(79, 70, 229, 0.32);
}

.secondary-actions {
  gap: 12px;
  margin-top: 12px;
}

.secondary-button {
  flex: 1;
  background: #fff;
  color: #334155;
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.panel-block--actions {
  flex-direction: column;
  align-items: stretch;
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

@media (max-width: 1120px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .hero-card {
    flex-direction: column;
  }

  .hero-metrics {
    min-width: 0;
  }

  .image-stage {
    min-height: 520px;
  }
}

@media (max-width: 768px) {
  .studio-page {
    padding: 16px;
  }

  .hero-card,
  .stage-card,
  .control-card {
    border-radius: 22px;
  }

  .hero-title {
    font-size: 30px;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .stage-toolbar,
  .block-heading,
  .secondary-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .image-stage {
    min-height: 360px;
  }

  .download-button {
    right: 14px;
    bottom: 14px;
  }
}
</style>
