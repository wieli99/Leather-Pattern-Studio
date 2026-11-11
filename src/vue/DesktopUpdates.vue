<script setup lang="ts">
import { useDesktopUpdates } from "../desktopUpdates";
import { openExternal } from "../platform";
const { message, url, busy, check } = useDesktopUpdates();
</script>
<template>
  <section class="desktop-updates" aria-label="Application updates">
    <button :disabled="busy" @click="check(true)">{{ busy ? 'Checking…' : 'Check for updates' }}</button>
    <p v-if="message" role="status">{{ message }}</p>
    <button v-if="url" @click="openExternal(url)">Open GitHub release</button>
  </section>
</template>
<style scoped>
.desktop-updates { border-top: 1px solid var(--border); padding-top: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
p { color: var(--text); overflow-wrap: anywhere; }
</style>
