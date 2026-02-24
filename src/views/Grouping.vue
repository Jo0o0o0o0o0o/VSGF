<script setup lang="ts">
const groups = [{ id: 1, showChips: true, plusIndex: -1 }];
</script>

<template>
  <main class="groupingPage">
    <section v-for="group in groups" :key="group.id" class="groupRow">
      <div class="groupHeader">
        <span class="groupId">{{ group.id }}</span>
        <div v-if="group.showChips" class="chipRow">
          <span class="chip"></span>
          <span class="chip"></span>
          <span class="chip"></span>
        </div>
      </div>

      <div class="slotRow">
        <div v-for="n in 5" :key="n" class="slotCard">
          <span v-if="group.plusIndex === n - 1" class="plusMark">+</span>
        </div>
        <button class="nextBtn" type="button" aria-label="next group">&#8594;</button>
      </div>

      <div class="footerBar"></div>
    </section>
  </main>
</template>

<style scoped>
.groupingPage {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.groupRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.groupHeader {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 26px;
}

.groupId {
  font-size: 30px;
  line-height: 1;
  color: #222;
  font-weight: 500;
}

.chipRow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chip {
  width: 90px;
  height: 28px;
  border-radius: 999px;
  background: #d2d2d4;
}

.slotRow {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr)) 36px;
  gap: 16px;
  align-items: stretch;
}

.slotCard {
  aspect-ratio: 1 / 1;
  background: #d2d2d4;
  display: grid;
  place-items: center;
}

.plusMark {
  font-size: clamp(48px, 8vw, 78px);
  line-height: 1;
  color: #000;
  font-weight: 300;
}

.nextBtn {
  border: none;
  background: #d2d2d4;
  color: #111;
  font-size: clamp(32px, 4vw, 56px);
  cursor: pointer;
}

.footerBar {
  height: 44px;
  background: #d2d2d4;
}

@media (max-width: 920px) {
  .slotRow {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  .nextBtn {
    min-height: 90px;
  }
}
</style>
