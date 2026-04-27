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
  margin: 0;
}

html.app-mode-chat,
body.app-mode-chat {
  overflow: hidden;
}

html.app-mode-image,
body.app-mode-image {
  overflow-x: hidden;
  overflow-y: auto;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.app-root {
  width: 100%;
  height: 100%;
}
</style>
