<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { DogBreed } from "@/types/dogBreed";
import { fuzzyFilter } from "@/utils/fuzzySearch";
import theDogApiBreeds from "@/data/dogs_thedogapi_breeds.json";
import { findBreedGroupByName, getBreedGroupTagStyle } from "@/utils/fuzzyBreedGroup";
import { RADAR_COLORS } from "@/d3Viz/createRadarChart";

const props = defineProps<{
  dogs: DogBreed[];
  slots: (DogBreed | null)[];
  max: number;
  focusIndex?:number|null;
}>();

const emit = defineEmits<{
  (e: "updateSlot", index: number, dog: DogBreed | null): void;
  (e: "toggleFocus", index: number): void;
}>();
const router = useRouter();

// 下拉/展开状态：控制 dropdown 开关
const openIndex = ref<number | null>(null);
const query = ref("");
const root = ref<HTMLElement | null>(null);
const apiBreeds = theDogApiBreeds as { name: string; breed_group?: string | null }[];

const slotBreedGroups = computed(() =>
  props.slots.map((dog) => {
    if (!dog) return null;
    return findBreedGroupByName(dog.name, apiBreeds);
  }),
);

const slotRadarColors = computed(() => {
  let colorIdx = 0;
  return props.slots.map((dog) => {
    if (!dog) return null;
    const color = RADAR_COLORS[colorIdx % RADAR_COLORS.length] ?? "#f59e0b";
    colorIdx += 1;
    return color;
  });
});

function toSoftBackground(color: string, alpha = 0.24) {
  if (/^#([\da-f]{3}|[\da-f]{6})$/i.test(color)) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function breedGroupStyle(group: string | null) {
  return group ? getBreedGroupTagStyle(group) : undefined;
}

function jumpToHomeBeeswarm(group: string | null, dogName: string | null) {
  if (!group) return;
  router.push({
    path: "/home",
    query: { beeswarmBreedGroup: group, homeSelectedDog: dogName ?? undefined },
    hash: "#beeswarm-section",
  });
}

function focusSearch() {
  nextTick(() => {
    const input = root.value?.querySelector<HTMLInputElement>(
      '.panel[data-open="true"] input'
    );
    input?.focus();
  });
}

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i;
  query.value = "";
  if (openIndex.value !== null) {
   focusSearch();
  }
}

function openFromPlus(i: number) {
  openIndex.value = i;
  query.value = "";
  focusSearch();
}

function pick(i: number, dog: DogBreed) {
  emit("updateSlot", i, dog);
  openIndex.value = null;
}

function clear(i: number) {
  emit("updateSlot", i, null);
}

function onDocClick(e: MouseEvent) {
  const el = root.value;
  if (!el) return;
  if (!el.contains(e.target as Node)) openIndex.value = null;
}

onMounted(() => document.addEventListener("mousedown", onDocClick));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));

function filteredList(currentIndex: number) {
  const selectedNames = new Set(
    props.slots
      .map((d, idx) => (idx !== currentIndex ? d?.name : null))
      .filter(Boolean)
  );

  // 已选中的狗不再出现在列表
  const available = props.dogs.filter(d => !selectedNames.has(d.name));

  return fuzzyFilter(available, query.value, (d) => d.name, { limit: available.length });
}
</script>

<template>
  <section class="topSlots" ref="root">
    <div
  v-for="i in props.max"
  :key="i"
  class="slot"
  :style="
    props.focusIndex === (i - 1) && slotRadarColors[i - 1]
      ? { backgroundColor: toSoftBackground(slotRadarColors[i - 1]!) }
      : undefined
  "
  :class="{
    focused: props.focusIndex === (i - 1),
    dim: props.focusIndex !== null && props.focusIndex !== undefined && props.focusIndex !== (i - 1),
    hasTag: !!slotBreedGroups[i - 1],
  }"
>
      <!-- 空槽位：点击 Add -->
      <button
        v-if="!props.slots[i - 1]"
        class="visual addArea"
        @click="openFromPlus(i - 1)"
      >
        <span class="plus">+</span>
        <span class="label">Add</span>
      </button>

      <div
  v-else
  class="visual picked"
  @click.stop="emit('toggleFocus', i - 1)"
  role="button"
  tabindex="0"
>
  <img
    class="picked-img"
    :src="props.slots[i - 1]!.image_link"
    :alt="props.slots[i - 1]!.name"
  />
</div>

      <!-- 已选：点击切换 Select -->

      <div class="dropdownWrap">
        <div class="selectRow">
          <button class="trigger" @click="toggle(i - 1)">
            <span class="txt">
              {{ props.slots[i - 1]?.name ?? "choose dogs" }}
            </span>
            <span class="caret">{{ openIndex === i - 1 ? "^" : "v" }}</span>
          </button>
          <button
            v-if="slotBreedGroups[i - 1]"
            class="breedTag"
            :style="breedGroupStyle(slotBreedGroups[i - 1] ?? null)"
            type="button"
            @click.stop="jumpToHomeBeeswarm(slotBreedGroups[i - 1] ?? null, props.slots[i - 1]?.name ?? null)"
          >
            {{ slotBreedGroups[i - 1] }}
          </button>
        </div>
        <!-- dropdown panel -->
        <div v-if="openIndex === i - 1" class="panel" data-open="true">
          <div class="searchRow">
            <input v-model="query" placeholder="Search dogs" />
            <button
              v-if="props.slots[i - 1]"
              class="clearBtn"
              @click="clear(i - 1)"
            >
              Clear
            </button>
          </div>

          <div class="list">
            <button
              v-for="d in filteredList(i - 1)"
              :key="d.name"
              class="row"
              @click="pick(i - 1, d)"
            >
              {{ d.name }}
            </button>

            <div v-if="filteredList(i - 1).length === 0" class="empty">No results</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.topSlots {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

/* Card */
.slot {
  background: #f4f4f4;
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 12px;
  min-height: 160px;
  position: relative;
}
/* focus 时高亮背景 */
.slot.focused {
  background: #fff6cc;
}

/* 非 focus 时整体变淡 */
.slot.dim {
  opacity: 0.45;
}

.visual {
  width: 100%;
  aspect-ratio: 1 / 1;   /* 正方形头像区域 */
  border-radius: 16px;
  background: #e9e9e9;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;      /* 图片裁剪填满 */
  position: relative;
}

.addArea {
  border: none;
  cursor: pointer;
  background: #e9e9e9;
}

.plus {
  font-size: 48px;
  opacity: 0.6;
}

.label {
  display: none;   /* 小屏只显示加号，显示 Add 文字 */
}

/* 已选卡片 */
.picked {
  padding: 0;
}

/* 图片铺满不变形 */
.picked-img {
  width: 100%;
  height: 100%;
  object-fit: cover;   /* 封面填充 */
  display: block;
}
/* Dropdown */
.trigger {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.18);
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  cursor: pointer;
  flex: 1 1 auto;
  min-width: 0;
}
.selectRow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dropdownWrap {
  position: relative;
}
.txt {
  opacity: 0.9;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.breedTag {
  flex: 0 0 auto;
  max-width: 108px;
  height: 30px;
  border: none;
  border-radius: 999px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret { opacity: 0.7; }

.panel {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  background: white;
  border: 1px solid rgba(0,0,0,0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.12);
  overflow: hidden;
  z-index: 20;
}

.slot.hasTag .panel {
  right: 126px;
}

.searchRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.searchRow input {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.18);
  padding: 0 10px;
  outline: none;
}
.clearBtn {
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.18);
  background: #fafafa;
  padding: 0 10px;
  cursor: pointer;
}

.list {
  max-height: 220px;
  overflow: auto;
  padding: 6px;
  display: grid;
  gap: 6px;
}
.row {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.08);
  background: #fafafa;
  cursor: pointer;
}
.row:hover { background: #f0f0f0; }
.empty { padding: 12px; opacity: 0.7; }
</style>
