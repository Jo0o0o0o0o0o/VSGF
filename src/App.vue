<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useRouter } from "vue-router";
import {
  activeYear,
  clearYearScopedLocalStoragePreserveYear,
  datasetYearOptions,
  GROUPING_CONFIRMED_EVENT,
  GROUPING_HYDRATED_EVENT,
  GROUPING_UPDATED_EVENT,
  setActiveDatasetYear,
  type DatasetYear,
} from "@/types/dataSource";
import { currentUser, logout } from "@/utils/authSession";
import { restoreGroupingYearFromCloud, saveGroupingYearToCloud } from "@/utils/groupingCloudSync";

const compareCount = ref(0);
const router = useRouter();
const userEmail = computed(() => currentUser.value?.email ?? "");
const syncingYear = ref(false);
const cloudHydrationReady = ref(false);

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
  window.addEventListener(GROUPING_UPDATED_EVENT, saveCurrentYearGroupingToCloud);
  window.addEventListener(GROUPING_CONFIRMED_EVENT, saveCurrentYearGroupingToCloud);
});

onUnmounted(() => {
  window.removeEventListener("storage", updateCompareCount);
  window.removeEventListener("compare-queue-updated", updateCompareCount);
  window.removeEventListener(GROUPING_UPDATED_EVENT, saveCurrentYearGroupingToCloud);
  window.removeEventListener(GROUPING_CONFIRMED_EVENT, saveCurrentYearGroupingToCloud);
});

async function hydrateGroupingFromCloudForYear(year: DatasetYear) {
  const uid = currentUser.value?.uid;
  if (!uid) return;
  let restored = false;
  try {
    restored = await restoreGroupingYearFromCloud(uid, year);
  } catch (err) {
    console.warn("[year-switch] restore grouping from cloud failed", err);
    restored = false;
  }
  if (!restored) return;
  window.dispatchEvent(new Event(GROUPING_HYDRATED_EVENT));
  window.dispatchEvent(new Event(GROUPING_UPDATED_EVENT));
  window.dispatchEvent(new Event(GROUPING_CONFIRMED_EVENT));
}

async function saveCurrentYearGroupingToCloud() {
  const uid = currentUser.value?.uid;
  if (!uid || !cloudHydrationReady.value) return;
  try {
    await saveGroupingYearToCloud(uid, activeYear.value);
  } catch (err) {
    console.warn("[grouping-sync] save current year grouping failed", err);
  }
}

watch(
  [() => currentUser.value?.uid, () => activeYear.value],
  async ([uid]) => {
    cloudHydrationReady.value = false;
    if (!uid) return;
    await hydrateGroupingFromCloudForYear(activeYear.value);
    cloudHydrationReady.value = true;
  },
  { immediate: true },
);

async function onChangeDatasetYear(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  if (!target || syncingYear.value) return;
  const nextYear = target.value as DatasetYear;
  if (nextYear === activeYear.value) return;
  syncingYear.value = true;
  const currentYear = activeYear.value;
  const uid = currentUser.value?.uid;
  try {
    cloudHydrationReady.value = false;
    if (uid) {
      try {
        await Promise.race([
          saveGroupingYearToCloud(uid, currentYear),
          new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 1500);
          }),
        ]);
      } catch (err) {
        console.warn("[year-switch] save current year grouping failed", err);
      }
    }
    setActiveDatasetYear(nextYear);
    clearYearScopedLocalStoragePreserveYear();
    window.dispatchEvent(new Event("compare-queue-updated"));
  } finally {
    syncingYear.value = false;
    window.location.reload();
  }
}

async function onLogout() {
  await logout();
  await router.replace("/auth");
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="logo">
        <img class="logo-icon" src="/Grouptitle.png" alt="Grouping icon" />
        <span class="logo-mark">Grouping</span>
        <span class="logo-text">Dashboard</span>
        <label class="yearSwitch" for="dataset-year-select">
          <span class="yearLabel">Year</span>
          <select
            id="dataset-year-select"
            class="yearSelect"
            :value="activeYear"
            @change="onChangeDatasetYear"
          >
            <option v-for="option in datasetYearOptions" :key="option.year" :value="option.year">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <nav class="nav">
        <RouterLink class="link" to="/home">Overview</RouterLink>
        <RouterLink class="link" to="/grouping">Grouping</RouterLink>
        <RouterLink class="link compareLink" to="/compare">
          Comparison
          <span v-if="compareCount > 0" class="badge">{{ compareCount }}</span>
        </RouterLink>
        <RouterLink class="link" to="/about">About</RouterLink>
        <template v-if="currentUser">
          <span class="userEmail">{{ userEmail }}</span>
          <button class="authBtn" type="button" @click="onLogout">Logout</button>
        </template>
        <RouterLink v-else class="link authLink" to="/auth">Login</RouterLink>
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
  background-color: var(--academic-bg);
  color: var(--academic-text);
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
  border-bottom: 1px solid #d4e0ec;
  background-color: #dbe8f5;
  box-shadow: 0 2px 10px rgba(31, 42, 56, 0.08);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.yearSwitch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.yearLabel {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--academic-text-muted);
}

.yearSelect {
  height: 28px;
  border-radius: 8px;
  border: none;
  background: #ffffff;
  color: var(--academic-text);
  padding: 0 8px;
  font-size: 12px;
  font-weight: 600;
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
  align-items: center;
  gap: 20px;
}

.authLink {
  font-weight: 600;
}

.userEmail {
  font-size: 12px;
  color: var(--academic-text-muted);
}

.authBtn {
  height: 28px;
  border-radius: 999px;
  border: none;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.link {
  position: relative;
  padding: 4px 0;
  text-decoration: none;
  font-size: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--academic-text-muted);
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
  background: var(--academic-accent-strong);
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
  background-color: var(--academic-accent);
  transition: width 0.18s ease-out;
}

.link:hover::after {
  width: 100%;
}

.link.router-link-active {
  color: var(--academic-text);
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
