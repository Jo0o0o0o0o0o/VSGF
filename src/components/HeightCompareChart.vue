<script setup lang="ts">
import { computed, ref } from "vue";
import dogHeightImg from "@/Image/dogHeight.png";
import manHeightImg from "@/Image/ManHeight.png";
import womanHeightImg from "@/Image/WomanHeight.png";

// 组件只需这些字段；不依赖你项目里的类型文件
type DogLike = {
  name: string;
  min_height_male?: number;
  max_height_male: number;
  min_height_female?: number;
  max_height_female: number;
};

const props = withDefaults(
  defineProps<{
    dog: DogLike | null;
    manHeightCm?: number;
    womanHeightCm?: number;
    maxCm?: number;        // 尺子上限
    visualHeightPx?: number; // 图表可见高度
  }>(),
  {
    manHeightCm: 180,
    womanHeightCm: 170,
    maxCm: 200,
    visualHeightPx: 260,
  }
);



const IN_TO_CM = 2.54;

function parseNumber(x: unknown): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x === "string") {
    const nums = x.match(/\d+(\.\d+)?/g);
    if (!nums) return 0;
    const arr = nums.map(Number).filter(Number.isFinite);
    return arr.length ? Math.max(...arr) : 0; // 支持 "25-27" 取最大
  }
  return 0;
}
function cmToPx(cm: number) {
  const safe = Number.isFinite(cm) ? cm : 0;
  const clamped = Math.max(0, Math.min(props.maxCm, safe));
  return (clamped / props.maxCm) * props.visualHeightPx;
}

function safePxFromCm(cm: number) {
  const px = cmToPx(cm);
  return Number.isFinite(px) ? px : 0;
}

//==============
const dogMaxIn = computed<number>(() => { 
  if (!props.dog) return 0;
  return Math.max(
    parseNumber(props.dog.max_height_male),
    parseNumber(props.dog.max_height_female)
  );
});
const dogMaxCm = computed<number>(() => dogMaxIn.value * IN_TO_CM);
const dogMinIn = computed<number>(() => {
  if (!props.dog) return 0;
  const mins = [
    parseNumber(props.dog.min_height_male),
    parseNumber(props.dog.min_height_female),
  ].filter((v) => v > 0);
  if (mins.length === 0) return 0;
  return Math.min(...mins);
});
const dogMinCm = computed<number>(() => dogMinIn.value * IN_TO_CM);
const dogAvgIn = computed<number>(() => {
  if (dogMinIn.value <= 0) return dogMaxIn.value;
  return (dogMinIn.value + dogMaxIn.value) / 2;
});
const dogAvgCm = computed<number>(() => dogAvgIn.value * IN_TO_CM);


const dogMaxCmLabel = computed(() => Math.round(dogMaxCm.value));   
const dogMinCmLabel = computed(() => Math.round(dogMinCm.value));   
const dogAvgCmLabel = computed(() => Math.round(dogAvgCm.value));   
const manLabel = computed(() => Math.round(props.manHeightCm));     
const womanLabel = computed(() => Math.round(props.womanHeightCm)); 
const showDogTooltip = ref(false);

  
const ticksCm = computed(() => {
  const step = 20;   // 每 20 cm 一个刻度（可改 10 / 25）
  const out: number[] = [];
  for (let v = 0; v <= props.maxCm; v += step) out.push(v);
  return out;
});
</script>

<template>
  <div class="wrap">
    <div v-if="dog" class="heightCompare">
      <div class="plot" :style="{ height: visualHeightPx + 'px' }">
      <div class="ruler" :style="{ height: visualHeightPx + 'px' }" aria-label="height ruler">
        <div
           v-for="cm in ticksCm"
            :key="cm"
            class="tick"
            :style="{ bottom: cmToPx(cm) + 'px' }"
        >
          <span class="tickLabel">{{ cm }}cm</span>
        </div>
      </div>

      <!-- 图形区 -->
      <div class="figures">
        <div class="col dog">
            <div class="meta">
            <div class="label">{{ dog.name }}</div>
          <div class="value">average {{ dogAvgCmLabel }} cm</div>
          <div
            class="imgWrap dogImgWrap"
            @mouseenter="showDogTooltip = true"
            @mouseleave="showDogTooltip = false"
          >
            <div v-if="showDogTooltip" class="dogTooltip" role="tooltip">
              <div>average height: {{ dogAvgCmLabel }} cm</div>
              <div>max height: {{ dogMaxCmLabel }} cm</div>
              <div>min height: {{ dogMinCmLabel > 0 ? dogMinCmLabel + ' cm' : 'N/A' }}</div>
            </div>
            <img
              :src="dogHeightImg"
              alt="dog height"
              class="figureImg"
              :style="{ height: safePxFromCm(dogAvgCm * 1.5) + 'px', maxWidth: 'none' }"
            />
        </div>
          </div>
          
        </div>

        <div class="col human"><div class="label">Man</div>
  <div class="topValue">{{ manHeightCm }} cm</div>
  <div class="imgWrap">
    <img
      :src="manHeightImg"
      alt="man height"
      class="figureImg"
      :style="{ height: cmToPx(manHeightCm) + 'px' }"
    />
  </div>
  
</div>

<div class="col human"><div class="label">Woman</div>
  <div class="topValue">{{ womanHeightCm }} cm</div>
  <div class="imgWrap">
    <img
      :src="womanHeightImg"
      alt="woman height"
      class="figureImg"
      :style="{ height: cmToPx(womanHeightCm) + 'px' }"
    />
  </div>
  
</div>
  </div>
  </div>
  </div>
  </div>
</template>

<style scoped>
.wrap {
  width: 100%;
}
.plot{
  position: relative;
  width: 100%;
  height: 260px;
  margin-top: 18px;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0; 
}
.heightCompare {
  position: relative;
  height: 300px;
  border-radius: 10px;
  background: transparent;
  padding: 10px 0px 0px 10px; /* 给左侧尺子留空间 */
  overflow: hidden;
}

/* 尺子 */
.ruler {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 60px;
  
}

.tick {
  position: absolute;
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(0, 0, 0, 0.25);
}

.tickLabel {
  position: absolute;
  left: 0;
  top: -10px;
  font-size: 10px;
  opacity: 0.85;
  background: rgba(221, 221, 221, 0.92);
  padding: 0 4px;
  border-radius: 6px;
}

/* 三列人物/狗 */
.figures {
  position: absolute;
  left: 64px;   /* [CHANGED] 给尺子留空间 */
  right: 0;
  bottom: 0;    /* [CHANGED] 贴底，图片底线 0 刻度 */
  top: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  align-items: stretch;
}

.col {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  height: auto;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.col.dog .imgWrap {
  position: static;
}

.dogImgWrap {
  position: relative;
}

.imgWrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.figureImg {
  width: auto;
  max-width: 100%;
  object-fit: contain;
  display: block;
}

.col.human .figureImg {
  transform: translateY(-12px);
}

.dogTooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  background: #fff;
  color: #111;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 20;
  pointer-events: none;
}

.label {
  margin-top: 6px;
  font-weight: 700;
  font-size: 12px;
  text-align: center;
}

.col.human .label {
  transform: translateY(-8px);
}

.value {
  font-size: 12px;
  opacity: 0.85;
  text-align: center;
}

.empty {
  height: 300px;
  border-radius: 10px;
  background: #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.col.human{
  position: relative;
  padding-top: 18px; /* 给上方高度文字留一点空间 */
}

.topValue{
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 700;
  opacity: 0.9;
  white-space: nowrap;
}
</style>




