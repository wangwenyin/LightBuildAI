<template>
  <div class="p-6 max-w-3xl mx-auto">
    <h1 class="text-xl font-bold mb-4">AI 白天图转夜景灯光效果图</h1>

    <input type="file" accept="image/*" @change="onFileChange" />

    <div class="my-3">
      <img v-if="preview" :src="preview" class="preview-image rounded" />
    </div>

    <div class="actions">
      <button
        class="bg-blue-600 text-white px-4 py-2 rounded"
        :disabled="loading"
        @click="toNight"
      >
        {{ loading ? loadingText : '生成夜景' }}
      </button>

      <button
        v-if="canRetry"
        class="bg-gray-200 text-gray-800 px-4 py-2 rounded"
        :disabled="loading"
        @click="retryGenerate"
      >
        重试
      </button>

      <button
        v-if="currentTaskId"
        class="bg-gray-200 text-gray-800 px-4 py-2 rounded"
        :disabled="loading"
        @click="copyTaskId"
      >
        复制任务号
      </button>
    </div>

    <p v-if="taskStatus" class="mt-3 text-sm text-gray-600">
      {{ taskStatus }}
    </p>

    <p v-if="currentTaskId" class="mt-2 text-xs text-gray-500">
      当前任务号：{{ currentTaskId }}
    </p>

    <div v-if="result" class="mt-6">
      <h3 class="font-semibold">夜景效果</h3>
      <img :src="result" class="preview-image rounded border" />
    </div>
  </div>
</template>

<script setup lang="ts">
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 3

const file = ref<File | null>(null)
const preview = ref('')
const loading = ref(false)
const result = ref('')
const taskStatus = ref('')
const loadingText = ref('生成中...')
const currentTaskId = ref('')
const canRetry = ref(false)

type GenerateResponse = {
  taskId: string
  jobId: string
  status: 'processing'
}

type TaskResponse = {
  taskId: string
  status: 'processing' | 'done' | 'failed'
  imageUrl?: string
  errorMessage?: string
  statusCode?: string
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const selectedFile = target?.files?.[0]

  if (!selectedFile) {
    return
  }

  file.value = selectedFile
  preview.value = URL.createObjectURL(selectedFile)
  result.value = ''
  taskStatus.value = ''
  currentTaskId.value = ''
  canRetry.value = false
}

async function toNight() {
  if (!file.value) {
    alert('请选择图片')
    return
  }

  loading.value = true
  result.value = ''
  taskStatus.value = '正在上传原图...'
  loadingText.value = '上传中...'
  canRetry.value = false

  try {
    const form = new FormData()
    form.append('file', file.value)

    const upload = await $fetch<{ url: string }>('/api/upload', {
      method: 'POST',
      body: form,
    })

    taskStatus.value = '已上传，正在提交混元任务...'
    loadingText.value = '提交任务中...'

    const response = await $fetch<GenerateResponse>('/api/generate', {
      method: 'POST',
      body: { originalUrl: upload.url },
    })

    currentTaskId.value = response.taskId
    loadingText.value = '生成中...'
    taskStatus.value = `任务已提交，正在生成夜景（任务号：${response.taskId}）`
    result.value = await pollTask(response.taskId)
    taskStatus.value = '生成完成'
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成失败'
    taskStatus.value = `失败：${message}`
    canRetry.value = true
    alert(`失败：${message}`)
  } finally {
    loading.value = false
    loadingText.value = '生成中...'
  }
}

async function pollTask(taskId: string) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS)

    const task = await $fetch<TaskResponse>('/api/task', {
      query: { taskId },
    })

    if (task.status === 'done' && task.imageUrl) {
      return task.imageUrl
    }

    if (task.status === 'failed') {
      throw new Error(task.errorMessage || '混元生成任务失败')
    }

    taskStatus.value = `正在生成夜景，请稍候...（第 ${attempt + 1} / ${MAX_POLL_ATTEMPTS} 次查询）`
  }

  throw new Error('等待生成结果超时，请稍后通过任务接口继续查询')
}

async function copyTaskId() {
  if (!currentTaskId.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(currentTaskId.value)
    taskStatus.value = `任务号已复制：${currentTaskId.value}`
  } catch {
    alert(`复制失败，请手动复制任务号：${currentTaskId.value}`)
  }
}

function retryGenerate() {
  void toNight()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
</script>

<style scoped>
h1 {
  color: #333;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.preview-image {
  width: 50%;
}
</style>
