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
            Research on team composition and team formation consistently highlights that assembling
            effective teams requires more than the sum of individual abilities. Team composition
            studies emphasize that collective attributes and diversity across skills, roles, and
            interpersonal traits significantly influence team processes and outcomes (<a
              href="#ref-kozlowski-bell-2004"
              >Kozlowski &amp; Bell, 2004</a
            >; <a href="#ref-cooke-hilton-2015">Cooke &amp; Hilton, 2015</a>). This suggests that
            teams with balanced representation across critical functions are better equipped to
            integrate expertise, coordinate work, and solve multifaceted problems. Systematic
            reviews further indicate that team formation is a multi-attribute process, involving
            both the selection of individual characteristics and the allocation of members based on
            task demands (<a href="#ref-stavrou-2023">Stavrou et al., 2023</a>; <a
              href="#ref-lyutskanova-2024"
              >Lyutskanova, 2024</a
            >). Findings from educational and collaborative settings show that intentionally
            structured teams, including approaches based on formal role frameworks such as Belbin's
            role theory, often outperform ad-hoc or self-selected teams in performance, engagement,
            and collaboration (<a href="#ref-aranzabal-2022">Aranzabal, 2022</a>; <a
              href="#ref-vasquez-guardado-2020"
              >Vasquez-Guardado et al., 2020</a
            >). Research in organizational and implementation science also underscores that team
            effectiveness depends not only on individual competence but also on coordination,
            leadership, and relational dynamics (<a href="#ref-mcguier-2023"
              >McGuier et al., 2023</a
            >). Together, these studies support a team formation approach that emphasizes coverage
            of key skill domains, balanced task roles, stable communication and collaboration, and
            built-in redundancy to improve robustness and reduce process breakdowns in team-based
            projects.
          </p>
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
          <p id="ref-aranzabal-2022">
            Aranzabal, A. (2022) Team formation on the basis of Belbin's roles to enhance
            students' performance in project based learning. Education for Chemical Engineers, 38,
            pp. 22-37. Available at:
            <a href="https://doi.org/10.1016/j.ece.2021.09.001" target="_blank" rel="noopener noreferrer">
              https://doi.org/10.1016/j.ece.2021.09.001
            </a>
          </p>
          <p id="ref-cooke-hilton-2015">
            Cooke, N.J. and Hilton, M.L. (eds.) (2015) Enhancing the Effectiveness of Team Science:
            Overview of Research on Team Effectiveness. Washington, DC: National Academies Press.
          </p>
          <p id="ref-kozlowski-bell-2004">
            Kozlowski, S.W.J. and Bell, B.S. (2004) Team composition. In: Encyclopedia of Applied
            Psychology. Elsevier.
          </p>
          <p id="ref-lyutskanova-2024">
            Lyutskanova, G. (2024) Systematic Literature Review on the Team Formation. University
            of Twente.
          </p>
          <p id="ref-mcguier-2023">
            McGuier, E.A. et al. (2023) Advancing research on teams and team effectiveness:
            Overview. Available at:
            <a href="https://www.ncbi.nlm.nih.gov/articles/PMC10387676/" target="_blank" rel="noopener noreferrer">
              https://www.ncbi.nlm.nih.gov/articles/PMC10387676/
            </a>
          </p>
          <p id="ref-stavrou-2023">
            Stavrou, G. et al. (2023) Team Formation: A Systematic Literature Review. International
            Journal of Business Science and Applied Management, 18(2), pp. 17-34.
          </p>
          <p id="ref-vasquez-guardado-2020">
            Vasquez-Guardado, E.S. et al. (2020) Impact of team formation approach on teamwork
            effectiveness and performance in an undergraduate laboratory course. International
            Journal of Engineering Education, 36(1B), pp. 491-501.
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
