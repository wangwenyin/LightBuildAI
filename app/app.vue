<template>
  <div class="app-root">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
html,
body,
#__nuxt {
  width: 100%;
  height: 100%;
}

html.app-mode-chat,
html.app-mode-image,
body.app-mode-chat,
body.app-mode-image {
  overflow: hidden;
}

.app-root {
  width: 100%;
  height: 100%;
}
</style>
