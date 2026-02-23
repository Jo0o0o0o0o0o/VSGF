<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { createWorldPlot, type WorldPoint, type WorldPlotApi } from "@/d3Viz/createWorldPlot";

const props = defineProps<{
  points: WorldPoint[];
  highlightId?: string | null;
  pointColor?: string;
  activeCountryCode?: string | null;
}>();

const emit = defineEmits<{
  (e: "selectDog", id: string): void;
  (e: "selectCountry", countryCode: string): void;
}>();

const wrapRef = ref<HTMLDivElement | null>(null);
let plot: WorldPlotApi | null = null;
let ro: ResizeObserver | null = null;

const tip = ref({
  show: false,
  x: 0,
  y: 0,
  title: "",
  subtitle: "",
});

function setTipFromEvent(ev: MouseEvent) {
  const rect = wrapRef.value?.getBoundingClientRect();
  if (!rect) return;
  tip.value.x = ev.clientX - rect.left + 12;
  tip.value.y = ev.clientY - rect.top + 12;
}

onMounted(() => {
  const el = wrapRef.value;
  if (!el) return;

  const w = el.clientWidth || 600;
  const h = el.clientHeight || 520;

  plot = createWorldPlot(el, {
    width: w,
    height: h,
    worldGeoJsonUrl: "/world.geojson",

    highlightId: props.highlightId ?? null,
    pointColor: props.pointColor ?? "#f97316",
    activeCountryCode: props.activeCountryCode ?? null,

    onHover: (d, ev) => {
      tip.value.show = true;
      tip.value.title = d.label ?? d.id;
      tip.value.subtitle = d.subtitle ?? "";
      setTipFromEvent(ev);
    },
    onMove: (_d, ev) => setTipFromEvent(ev),
    onLeave: () => (tip.value.show = false),
    onClick: (d) => {
      emit("selectDog", d.id);
      if (d.countryCode) emit("selectCountry", d.countryCode);
    },
  });

  plot.update(props.points);

  ro = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const cr = entry.contentRect;
    plot?.resize(cr.width, cr.height);
  });
  ro.observe(el);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  plot?.destroy();
  plot = null;
});

watch(
  () => props.points,
  (pts) => plot?.update(pts),
  { deep: true },
);

watch(
  () => props.highlightId,
  (id) => plot?.setHighlight(id ?? null),
);

watch(
  () => props.pointColor,
  (color) => plot?.setPointColor(color ?? "#f97316"),
);

watch(
  () => props.activeCountryCode,
  (cc) => plot?.setActiveCountry(cc ?? null),
);
</script>

<template>
  <div ref="wrapRef" class="wrap" @mouseleave="tip.show = false">
    <div v-if="tip.show" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
      <div class="t1">{{ tip.title }}</div>
      <div class="t2">{{ tip.subtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.tip {
  position: absolute;
  pointer-events: none;
  background: rgba(17, 24, 39, 0.92);
  color: #fff;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  max-width: 240px;
}
.t1 {
  font-weight: 700;
  margin-bottom: 2px;
}
.t2 {
  opacity: 0.9;
}
</style>
