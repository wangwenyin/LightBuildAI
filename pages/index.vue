<template>
  <div class="p-6 max-w-3xl mx-auto">
    <h1 class="text-xl font-bold mb-4">AI 白天图转夜景灯光效果图</h1>

    <input type="file" accept="image/*" @change="onFileChange" />
    <div class="my-3">
      <img v-if="preview" :src="preview" class="w-full h-40 rounded" />
    </div>

    <button
      @click="toNight"
      class="bg-blue-600 text-white px-4 py-2 rounded"
      :disabled="loading"
    >
      {{ loading ? '生成中...' : '生成夜景' }}
    </button>

    <div v-if="result" class="mt-6">
      <h3 class="font-semibold">夜景效果</h3>
      <img :src="result" class="w-full rounded border" />
    </div>
  </div>
</template>

<script setup lang="ts">
const file = ref<File | null>(null)
const preview = ref('')
const loading = ref(false)
const result = ref('')

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const selectedFile = target?.files?.[0]

  if (!selectedFile) {
    return
  }

  file.value = selectedFile
  preview.value = URL.createObjectURL(selectedFile)
}

async function toNight() {
  if (!file.value) {
    alert('请选择图片')
    return
  }

  loading.value = true
  result.value = ''

  try {
    const form = new FormData()
    form.append('file', file.value)

    const upload = await $fetch<{ url: string }>('/api/upload', {
      method: 'POST',
      body: form,
    })

    const response = await $fetch<{ nightImageUrl: string }>('/api/generate', {
      method: 'POST',
      body: { originalUrl: upload.url },
    })

    result.value = response.nightImageUrl
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '生成失败'
    alert(`失败：${message}`)
  }
  finally {
    loading.value = false
  }
}
</script>

<style scoped>
h1 {
  color: #333;
}

.w-full {
  width: 50%;
}
</style>
