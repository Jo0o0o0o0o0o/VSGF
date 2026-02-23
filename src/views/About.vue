<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import authorPhoto from "@/Image/Yuchen Zhai.jpg";

type SectionItem = {
  id: string;
  title: string;
};

const sections: SectionItem[] = [
  { id: "project-overview", title: "Project Overview" },
  { id: "how-to-use", title: "How To Use" },
  { id: "data", title: "Data" },
  { id: "resources", title: "Project Resources" },
];

const activeSection = ref<string>(sections[0]?.id ?? "");
let observer: IntersectionObserver | null = null;

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  activeSection.value = id;
  history.replaceState(null, "", `#${id}`);
}

onMounted(() => {
  const initialHash = window.location.hash.replace("#", "");
  if (initialHash && sections.some((s) => s.id === initialHash)) {
    scrollToSection(initialHash);
  }

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      activeSection.value = visible.target.id;
    },
    {
      root: null,
      rootMargin: "-90px 0px -55% 0px",
      threshold: [0.2, 0.4, 0.7],
    },
  );

  sections.forEach((section) => {
    const el = document.getElementById(section.id);
    if (el) observer?.observe(el);
  });
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div class="aboutPage">
    <aside class="sidebar">
      <div class="authorCard">
        <img class="authorImage" :src="authorPhoto" alt="Yuchen Zhai" />
        <div class="authorMeta">
          <div class="authorName">yuchen zhai</div>
          <a
            class="authorEmail"
            href="https://outlook.office.com/mail/deeplink/compose?to=yuzhai%40kth.se"
            target="_blank"
            rel="noopener noreferrer"
          >
            yuzhai@kth.se
          </a>
        </div>
      </div>

      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="navBtn"
        :class="{ active: activeSection === section.id }"
        @click="scrollToSection(section.id)"
      >
        {{ section.title }}
      </button>
    </aside>

    <section class="content">
      <article
        v-for="section in sections"
        :id="section.id"
        :key="`content-${section.id}`"
        class="sectionBlock"
      >
        <h2>{{ section.title }}</h2>
        <div v-if="section.id === 'project-overview'" class="overviewText">
          <p>
            DogViz Dashboard is an interactive information visualization designed to support
            prospective dog owners and enthusiasts in exploring and comparing dog breeds through an
            integrated visual interface. The system combines physical characteristics, lifespan
            indicators, and temperament traits to enable structured comparison and evidence-informed
            decision-making.
          </p>
          <p>
            Selecting a dog breed involves complex trade-offs among size, activity level,
            behaviour, and compatibility with household needs. Research has shown that dog breeds
            exhibit measurable behavioural differences across traits such as trainability,
            sociability, fearfulness, and activity level (<a href="#ref-asp-2015"
              >Asp et al., 2015</a
            >; <a href="#ref-maclean-2019">MacLean et al., 2019</a>). At the same time,
            behavioural tendencies are not deterministic: substantial variation exists within
            breeds, and individual experience and environment strongly influence behaviour (<a
              href="#ref-morrill-2022"
              >Morrill et al., 2022</a
            >; <a href="#ref-petkova-2024">Petkova et al., 2024</a>).
          </p>
          <p>
            Beyond behaviour, physical characteristics and longevity also influence suitability for
            different lifestyles. Body size, morphology, and health predispositions can affect
            lifespan and wellbeing, with smaller and morphologically moderate breeds generally
            associated with longer life expectancy (<a href="#ref-mcmillan-2024"
              >McMillan et al., 2024</a
            >).
          </p>
          <p>
            Despite the abundance of breed information available online, relevant data are often
            fragmented across kennel club descriptions, veterinary resources, and adoption
            platforms, making systematic comparison difficult. DogViz Dashboard addresses this
            challenge by aggregating heterogeneous data and presenting them through coordinated
            visual representations, including comparative charts, population benchmarks, and
            temperament profiles. These visualizations enable users to interpret breed differences,
            contextualize selected breeds within overall distributions, and support informed
            decision-making.
          </p>
          <p>
            Beyond prospective owners, the system may support researchers, trainers, and animal
            welfare professionals in examining patterns in canine traits and facilitating
            discussions about breed selection and human-dog compatibility.
          </p>
        </div>
        <div v-else-if="section.id === 'resources'" class="resourceList">
          <p id="ref-asp-2015">
            Asp, H.E., Fikse, W.F., Nilsson, K. and Strandberg, E. (2015) Breed differences in
            everyday behaviour of dogs. Applied Animal Behaviour Science, 169, pp. 69-77.
          </p>
          <p id="ref-maclean-2019">
            MacLean, E.L., Snyder-Mackler, N., vonHoldt, B.M. and Serpell, J.A. (2019) Highly
            heritable and functionally relevant breed differences in dog behaviour. Proceedings of
            the Royal Society B, 286(1912).
          </p>
          <p id="ref-morrill-2022">
            Morrill, K. et al. (2022) Ancestry-inclusive dog genomics challenges popular assumptions
            about breed and behaviour. Science, 376(6592), pp. eabk0639.
          </p>
          <p id="ref-petkova-2024">
            Petkova, B. et al. (2024) Variations in canine behavioural characteristics and the role
            of context and education. Animals, 14(18).
          </p>
          <p id="ref-mcmillan-2024">
            McMillan, K. et al. (2024) Longevity patterns across dog breeds: interactions of size,
            morphology and sex. Scientific Reports.
          </p>
        </div>
        <div v-else class="placeholder"></div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.aboutPage {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.sidebar {
  position: sticky;
  top: 84px;
  display: grid;
  gap: 10px;
}

.authorCard {
  background: #fff4be;
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.authorImage {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  object-fit: cover;
  display: block;
}

.authorMeta {
  display: grid;
  gap: 2px;
  color: #4a3b00;
  justify-items: center;
  text-align: center;
}

.authorName {
  font-size: 14px;
  font-weight: 700;
  text-transform: capitalize;
}

.authorEmail {
  font-size: 12px;
  opacity: 0.85;
  color: #6f5600;
  text-decoration: none;
}

.authorEmail:hover {
  text-decoration: underline;
}

.navBtn {
  height: 44px;
  border: none;
  border-radius: 10px;
  background: #fff8d8;
  color: #4a3b00;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.navBtn:hover {
  background: #fff2b3;
}

.navBtn.active {
  background: #ffd84f;
}

.content {
  min-width: 0;
  display: grid;
  gap: 16px;
}

.sectionBlock {
  scroll-margin-top: 96px;
  border: none;
  background: #fffef7;
  border-radius: 12px;
  padding: 18px 20px 22px;
}

.sectionBlock h2 {
  margin: 0 0 12px;
  font-size: 26px;
  line-height: 1.1;
  color: #2d2500;
}

.placeholder {
  height: 280px;
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(255, 230, 120, 0.08), rgba(255, 223, 58, 0.04)),
    #fffdf3;
}

.overviewText {
  display: grid;
  gap: 14px;
  color: #3f3300;
  line-height: 1.65;
  font-size: 15px;
}

.overviewText p {
  margin: 0;
}

.overviewText a {
  color: #8a6a00;
}

.resourceList {
  display: grid;
  gap: 12px;
  color: #3f3300;
  line-height: 1.6;
  font-size: 15px;
}

.resourceList p {
  margin: 0;
}

.resourceList p[id] {
  scroll-margin-top: 100px;
}

@media (max-width: 980px) {
  .aboutPage {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
