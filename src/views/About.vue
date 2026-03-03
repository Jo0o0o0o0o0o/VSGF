<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import authorPhoto from "/public/Zhai.png";

type SectionItem = {
  id: string;
  title: string;
};

const sections: SectionItem[] = [
  { id: "project-overview", title: "Project Overview" },
  { id: "optimal-group-strategy", title: "Optimal Group Strategy" },
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
        <img class="authorImage" :src="authorPhoto" alt="Zhai" />
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
        </div>
        <div v-else-if="section.id === 'how-to-use'" class="howToUseFlow">
          <p class="flowIntro">
            This dashboard is structured by user workflow: <strong>Understand People -> Build Teams -> Assign Responsibilities -> Compare Group Quality -> Iterate</strong>.
          </p>

          <div class="flowStep">
            <h3>1. Login & Select Year (Global Context)</h3>
            <p>
              Enter from <strong>Login</strong>, then choose a dataset year in the top bar. Year is the global context for all pages and synced grouping data.
            </p>
            <p class="flowWhere">Where: Top bar (all pages)</p>
          </div>

          <div class="flowStep">
            <h3>2. Explore Cohort (Overview)</h3>
            <p>
              Use Heatmap/Beeswarm/Parallel Sets to understand distribution and identify candidate students.
              Click a person to open detail view and inspect hobbies, aiming, and skill profile.
            </p>
            <p>
              The person detail is shown in <strong>ComparePerson</strong>, which acts as the quick inspection panel before grouping decisions.
            </p>
            <p class="flowWhere">Where: Overview page</p>
          </div>

          <div class="flowStep">
            <h3>3. Compose Teams (Grouping)</h3>
            <p>
              Drag students from unassigned pool into group slots. Use keyword scoring (hobby/aiming embedding) to find suitable members quickly.
            </p>
            <p>
              Group cards summarize shared hobby tags and top aiming tag to support rapid team-level decisions.
            </p>
            <p>
              During this step, you can click a student card to open <strong>ComparePerson</strong> and verify individual fit before placing or moving the student.
            </p>
            <p class="flowWhere">Where: Grouping page</p>
          </div>

          <div class="flowStep">
            <h3>4. Assign Roles (Group Details)</h3>
            <p>
              Open Group Details to assign leader/support per dimension, and validate with threshold bars plus group-level embedding summaries.
            </p>
            <p class="flowWhere">Where: Grouping -> Group Details drawer</p>
          </div>

          <div class="flowStep">
            <h3>5. Evaluate Across Groups (Compare)</h3>
            <p>
              Select groups and compare by Radar, Dumbbell, Variance/SD, and Donut views. Toggle Responsible mode to evaluate outcomes under role assignment.
            </p>
            <p class="flowWhere">Where: Compare page</p>
          </div>

          <div class="flowStep">
            <h3>6. Iterate & Confirm</h3>
            <p>
              Return to Grouping to adjust members/roles based on comparison findings, then confirm groups.
              The flow is intentionally cyclical for decision refinement.
            </p>
            <p class="flowWhere">Loop: Compare -> Grouping -> Compare</p>
          </div>
        </div>
        <div v-else-if="section.id === 'data'" class="dataText">
          <p>
            The dataset consists of structured skill ratings, which were visualized directly and
            further organized into four higher-level competency domains commonly used in
            cross-functional team design (<a href="#ref-bell-2018">Bell et al., 2018</a>;
            <a href="#ref-cooke-hilton-2015">Cooke &amp; Hilton, 2015</a>). These domains provide
            an interpretable framework for evaluating team coverage and balance:
          </p>
          <ul>
            <li>
              <strong>Build:</strong> programming, code repository management, computer graphics /
              HCI programming
            </li>
            <li>
              <strong>Think &amp; Visualization:</strong> statistics, mathematics, information
              visualization
            </li>
            <li>
              <strong>Design:</strong> user experience evaluation, artistic and visual design
            </li>
            <li>
              <strong>Team Collaboration:</strong> communication and collaboration
            </li>
          </ul>
          <p>
            Aggregating skills into these domains reduces dimensional complexity while supporting
            assessment of coverage, balance, and redundancy.
          </p>
          <p>
            In addition to structured ratings, supplementary textual attributes were cleaned and
            transformed into numerical vectors using the <code>Xenova/bge-small-en-v1.5</code>
            embedding model. Semantic embeddings capture contextual meaning, enable
            similarity-based grouping, and integrate qualitative descriptions into quantitative
            analysis, thereby improving clustering robustness and supporting more informed team
            formation decisions.
          </p>
        </div>
        <div v-else-if="section.id === 'optimal-group-strategy'" class="strategyText">
          <p>
            An optimal team is organized across four domains: Build, Think and Visualization,
            Design, and Team, where each domain includes a leader with a score above 7 to ensure
            critical skill coverage, and at least one support member with similarly strong or
            sufficiently high competence to provide redundancy and maintain balanced workload
            distribution.
          </p>
          <p>
            Additionally, at least two members must share a common hobby area in which they also
            perform well, strengthening communication, cohesion, and overall coordination
            stability.
          </p>
          <p>
            Based on the preserved embedding data from the 2021 and 2022 cohorts regarding what
            students expect to learn from this course, an optimal team should also include at
            least four members with closely aligned learning aims, ensuring shared goals and
            sustained motivation throughout the project.
          </p>
        </div>
        <div v-else-if="section.id === 'resources'" class="resourceList">
          <p id="ref-bell-2018">
            Bell, S.T., Brown, S.G., Colaneri, A. and Outland, N. (2018) Team composition and the
            ABCs of teamwork. American Psychologist, 73(4), pp. 349-362.
          </p>
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
  background: #dbeafe;
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
  color: #1e3a8a;
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
  color: #1d4ed8;
  text-decoration: none;
}

.authorEmail:hover {
  text-decoration: underline;
}

.navBtn {
  height: 44px;
  border: none;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.navBtn:hover {
  background: #dbeafe;
}

.navBtn.active {
  background: #93c5fd;
  color: #1e40af;
}

.content {
  min-width: 0;
  display: grid;
  gap: 16px;
}

.sectionBlock {
  scroll-margin-top: 96px;
  border: none;
  background: #f8fbff;
  border-radius: 12px;
  padding: 18px 20px 22px;
}

.sectionBlock h2 {
  margin: 0 0 12px;
  font-size: 26px;
  line-height: 1.1;
  color: #1e3a8a;
}

.placeholder {
  height: 280px;
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(59, 130, 246, 0.05)),
    #f8fbff;
}

.overviewText {
  display: grid;
  gap: 14px;
  color: #1f3b7a;
  line-height: 1.65;
  font-size: 15px;
}

.overviewText p {
  margin: 0;
}

.overviewText a {
  color: #2563eb;
}

.dataText {
  display: grid;
  gap: 12px;
  color: #1f3b7a;
  line-height: 1.65;
  font-size: 15px;
}

.dataText p {
  margin: 0;
}

.dataText ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

.dataText li {
  margin: 0;
}

.dataText a {
  color: #2563eb;
}

.strategyText {
  display: grid;
  gap: 12px;
  color: #1f3b7a;
  line-height: 1.65;
  font-size: 15px;
}

.strategyText p {
  margin: 0;
}

.howToUseFlow {
  display: grid;
  gap: 12px;
  color: #1f3b7a;
  font-size: 15px;
  line-height: 1.6;
}

.flowIntro {
  margin: 0;
}

.flowStep {
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}

.flowStep h3 {
  margin: 0;
  font-size: 16px;
  color: #1e3a8a;
}

.flowStep p {
  margin: 0;
}

.flowWhere {
  font-size: 13px;
  color: #3b82f6;
  font-weight: 600;
}

.resourceList {
  display: grid;
  gap: 12px;
  color: #1f3b7a;
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
