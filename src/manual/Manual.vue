<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from "vue";
import { isTauri, openExternal } from "../platform";
import { invoke } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
const md = new MarkdownIt({ html: false, linkify: false });
const sources = import.meta.glob("../../docs/manual/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const pages = Object.entries(sources).map(([path, content]) => ({
  id: path.split("/").pop()!.replace(".md", ""),
  title: content.split("\n")[0].replace(/^# /, ""),
  content,
}));
const order = [
  "home",
  "getting-started",
  "workspace",
  "drawing",
  "selection",
  "measurements",
  "transforms",
  "stitching",
  "text",
  "indicators",
  "printing",
  "shortcuts",
  "files",
  "troubleshooting",
];
pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
const route = ref(location.hash.slice(1) || "home"),
  query = ref("");
const page = computed(() =>
  pages.find((p) => p.id === route.value.split("/")[0]),
);
const results = computed(() =>
  pages.filter((p) =>
    (p.title + " " + p.content)
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const headings = computed(() =>
  [...(page.value?.content ?? "").matchAll(/^## (.+)$/gm)].map((m) => ({
    title: m[1],
    id: slug(m[1]),
  })),
);
function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
md.renderer.rules.heading_open = (tokens, i, options, env, self) => {
  const title = tokens[i + 1]?.content ?? "";
  tokens[i].attrSet("id", slug(title));
  return self.renderToken(tokens, i, options);
};
async function navigate() {
  route.value = location.hash.slice(1) || "home";
  query.value = "";
  document.title = `${page.value?.title ?? "Page not found"} · Leather Pattern Studio manual`;
  await nextTick();
  const anchor = route.value.split("/")[1];
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else document.querySelector<HTMLElement>("article")?.focus();
}
onMounted(() => {
  const click = (event: MouseEvent) => {
    if (!isTauri()) return;
    const anchor = (event.target as Element)?.closest?.("a");
    if (!anchor) return;
    if (anchor.pathname === "/" && !anchor.hash) { event.preventDefault(); void invoke("focus_editor"); }
    else if (/^https?:/.test(anchor.href) && anchor.origin !== location.origin) { event.preventDefault(); void openExternal(anchor.href); }
  };
  document.addEventListener("click", click);
  onUnmounted(() => document.removeEventListener("click", click));
  window.addEventListener("hashchange", navigate);
  void navigate();
  if (!isTauri() && import.meta.env.PROD && "serviceWorker" in navigator)
    void navigator.serviceWorker.register("/sw.js");
});
onUnmounted(() => window.removeEventListener("hashchange", navigate));
</script>
<template>
  <header>
    <a href="#home">Leather Pattern Studio · Manual</a
    ><a href="/" target="_blank" rel="noopener">Open editor ↗</a>
  </header>
  <div class="layout">
    <aside>
      <label>Search manual<input v-model="query" type="search" /></label>
      <nav aria-label="Manual articles">
        <a
          v-for="p in pages"
          :key="p.id"
          :href="`#${p.id}`"
          :aria-current="page?.id === p.id ? 'page' : undefined"
          >{{ p.title }}</a
        >
      </nav>
    </aside>
    <main>
      <section v-if="query" aria-label="Search results">
        <h1>Search results</h1>
        <p v-if="!results.length">No matching articles.</p>
        <div v-for="p in results" :key="p.id">
          <h2>
            <a :href="`#${p.id}`">{{ p.title }}</a>
          </h2>
          <p>{{ p.content.replace(/[#*|]/g, "").slice(0, 180) }}…</p>
        </div>
      </section>
      <template v-else
        ><nav v-if="headings.length" aria-label="On this page">
          <a v-for="h in headings" :key="h.id" :href="`#${page?.id}/${h.id}`">{{
            h.title
          }}</a>
        </nav>
        <article tabindex="-1">
          <div v-if="page" v-html="md.render(page.content)" />
          <template v-else
            ><h1>Page not found</h1>
            <a href="#home">Manual home</a></template
          >
        </article></template
      >
    </main>
  </div>
</template>
