<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { RouterLink, RouterView } from "vue-router";

const compareCount = ref(0);

function updateCompareCount() {
  try {
    const raw = localStorage.getItem("compare_add_queue");
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const names = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
    compareCount.value = names.length;
  } catch (_) {
    compareCount.value = 0;
  }
}

onMounted(() => {
  updateCompareCount();
  window.addEventListener("storage", updateCompareCount);
  window.addEventListener("compare-queue-updated", updateCompareCount);
});

onUnmounted(() => {
  window.removeEventListener("storage", updateCompareCount);
  window.removeEventListener("compare-queue-updated", updateCompareCount);
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="logo">
        <img class="logo-icon" src="/dogtitle.png" alt="TheDogs icon" />
        <span class="logo-mark">TheDogs</span>
        <span class="logo-text">Dogviz Dashboard</span>
      </div>

      <nav class="nav">
        <RouterLink class="link" to="/home">Overview</RouterLink>
        <RouterLink class="link compareLink" to="/compare">
          Comparison
          <span v-if="compareCount > 0" class="badge">{{ compareCount }}</span>
        </RouterLink>
        <RouterLink class="link" to="/about">About</RouterLink>
      </nav>
    </header>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background-color: #fdfbf3;
  color: #222;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid #fff159;
  background-color: #ffd900;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  border-radius: 6px;
}

.logo-mark {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.logo-text {
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav {
  display: flex;
  gap: 20px;
}

.link {
  position: relative;
  padding: 4px 0;
  text-decoration: none;
  font-size: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #333;
}

.compareLink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.link::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -4px;
  width: 0;
  height: 2px;
  background-color: #ffffff;
  transition: width 0.18s ease-out;
}

.link:hover::after {
  width: 100%;
}

.link.router-link-active {
  color: #111;
}

.link.router-link-active::after {
  width: 100%;
}

.main {
  padding: 16px 24px 24px;
}
</style>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
}
</style>
