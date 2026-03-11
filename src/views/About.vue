<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import authorPhoto from "/public/Zhai.png";

type SectionItem = {
  id: string;
  title: string;
};

const bestPracticeSections: SectionItem[] = [
  { id: "best-practices", title: "Data Abstraction" },
  { id: "task-abstraction", title: "Task Abstraction" },
  { id: "validation", title: "Four Levels of Validation" },
  { id: "marks-channels", title: "Marks and Channels" },
  { id: "rules-of-thumb", title: "Rules of Thumb" },
];

const sections: SectionItem[] = [
  { id: "project-overview", title: "Project Overview" },
  { id: "optimal-group-strategy", title: "Optimal Group Strategy" },
  { id: "how-to-use", title: "How To Use" },
  { id: "data", title: "Data" },
  { id: "best-practices", title: "Best Practices of Data Abstraction" },
  { id: "task-abstraction", title: "Best Practice of Task Abstraction" },
  { id: "validation", title: "Best Practice of Four Levels of Validation" },
  { id: "marks-channels", title: "Best Practice of Marks and Channels" },
  { id: "rules-of-thumb", title: "Best Practice of Rules of Thumb" },
  { id: "resources", title: "References" },
];

const activeSection = ref<string>(sections[0]?.id ?? "");
const bestPracticesExpanded = ref(true);
let observer: IntersectionObserver | null = null;

const topSections = sections.filter(
  (section) => section.id !== "resources" && !bestPracticeSections.some((item) => item.id === section.id),
);

function isBestPracticeSection(id: string) {
  return bestPracticeSections.some((section) => section.id === id);
}

function toggleBestPractices() {
  bestPracticesExpanded.value = !bestPracticesExpanded.value;
}

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
        v-for="section in topSections"
        :key="section.id"
        type="button"
        class="navBtn"
        :class="{ active: activeSection === section.id }"
        @click="scrollToSection(section.id)"
      >
        {{ section.title }}
      </button>

      <div class="navGroup">
        <button
          type="button"
          class="navBtn navGroupBtn"
          :class="{ active: isBestPracticeSection(activeSection) }"
          @click="toggleBestPractices"
        >
          <span>Best Practices</span>
          <span class="navGroupArrow" :class="{ expanded: bestPracticesExpanded || isBestPracticeSection(activeSection) }">
            ▾
          </span>
        </button>
        <div v-if="bestPracticesExpanded || isBestPracticeSection(activeSection)" class="navSubgroup">
          <button
            v-for="section in bestPracticeSections"
            :key="section.id"
            type="button"
            class="navSubBtn"
            :class="{ active: activeSection === section.id }"
            @click="scrollToSection(section.id)"
          >
            {{ section.title }}
          </button>
        </div>
      </div>

      <button
        type="button"
        class="navBtn"
        :class="{ active: activeSection === 'resources' }"
        @click="scrollToSection('resources')"
      >
        References
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
            students expect to learn from this course, an optimal team should also include
            members with differentiated learning goals, so that students can bring distinct
            expectations, learn from one another, and broaden the range of perspectives within
            the project.
          </p>
        </div>
        <div v-else-if="section.id === 'resources'" class="resourceList">
          <p id="ref-shneiderman-1996">
            [1] Shneiderman, Ben. "The eyes have it: A task by data type taxonomy for information
            visualizations." In Visual Languages, 1996. Proceedings., IEEE Symposium on, pp.
            336-343. IEEE, 1996.
          </p>
          <p id="ref-bell-2018">
            [2] Bell, S.T., Brown, S.G., Colaneri, A. and Outland, N. (2018) Team composition and
            the ABCs of teamwork. American Psychologist, 73(4), pp. 349-362.
          </p>
          <p id="ref-aranzabal-2022">
            [3] Aranzabal, A. (2022) Team formation on the basis of Belbin's roles to enhance
            students' performance in project based learning. Education for Chemical Engineers, 38,
            pp. 22-37. Available at:
            <a href="https://doi.org/10.1016/j.ece.2021.09.001" target="_blank" rel="noopener noreferrer">
              https://doi.org/10.1016/j.ece.2021.09.001
            </a>
          </p>
          <p id="ref-cooke-hilton-2015">
            [4] Cooke, N.J. and Hilton, M.L. (eds.) (2015) Enhancing the Effectiveness of Team
            Science: Overview of Research on Team Effectiveness. Washington, DC: National Academies
            Press.
          </p>
          <p id="ref-kozlowski-bell-2004">
            [5] Kozlowski, S.W.J. and Bell, B.S. (2004) Team composition. In: Encyclopedia of
            Applied Psychology. Elsevier.
          </p>
          <p id="ref-lyutskanova-2024">
            [6] Lyutskanova, G. (2024) Systematic Literature Review on the Team Formation.
            University of Twente.
          </p>
          <p id="ref-mcguier-2023">
            [7] McGuier, E.A. et al. (2023) Advancing research on teams and team effectiveness:
            Overview. Available at:
            <a href="https://www.ncbi.nlm.nih.gov/articles/PMC10387676/" target="_blank" rel="noopener noreferrer">
              https://www.ncbi.nlm.nih.gov/articles/PMC10387676/
            </a>
          </p>
          <p id="ref-munzner-2009">
            [8] Munzner, T. (2009) A nested model for visualization design and validation. IEEE
            Transactions on Visualization and Computer Graphics, 15(6), pp. 921-928.
          </p>
          <p id="ref-munzner-2014">
            [9] Munzner, T. (2014) Visualization Analysis and Design. Boca Raton: CRC Press.
          </p>
          <p id="ref-stavrou-2023">
            [10] Stavrou, G. et al. (2023) Team Formation: A Systematic Literature Review.
            International Journal of Business Science and Applied Management, 18(2), pp. 17-34.
          </p>
          <p id="ref-vasquez-guardado-2020">
            [11] Vasquez-Guardado, E.S. et al. (2020) Impact of team formation approach on teamwork
            effectiveness and performance in an undergraduate laboratory course. International
            Journal of Engineering Education, 36(1B), pp. 491-501.
          </p>
        </div>
        <div v-else-if="section.id === 'best-practices'" class="bestPracticeText">
          <p>
            Following Munzner's data abstraction framework, the dataset is structured into items and
            attribute types before visualization design. This structured abstraction ensures that
            different data forms, including numerical ratings, categorical information, and open-text
            responses, are processed appropriately before visual encoding.
          </p>

          <figure class="figureCard">
            <div class="figureFrame">
              <pre class="figurePre">Raw Survey Data
  |
  v
Data Abstraction
  |
  v
Items: Students
Attributes:
  - Quantitative (skill ratings)
  - Categorical (programme, alias)
  - Text (hobbies, goals)
  |
  v
Transformation
  - Text embedding
  |
  v
Aggregation
  - 4 competency domains
  |
  v
Visualization-ready dataset</pre>
            </div>
            <figcaption>
              <strong>Figure 1. Data abstraction pipeline following Munzner's framework.</strong>
              Students are modeled as items, while survey fields become attributes. Attributes are
              classified into quantitative ratings, categorical identifiers, and text responses.
              This separation clarifies how each attribute should be analyzed and visualized.
            </figcaption>
          </figure>

          <figure class="figureCard">
            <div class="figureFrame">
              <div class="attrTable">
                <div class="attrHead">Attribute</div>
                <div class="attrHead">Type</div>
                <div>Alias</div>
                <div>Categorical</div>
                <div>Programme</div>
                <div>Categorical</div>
                <div>Programming skill</div>
                <div>Quantitative</div>
                <div>Design skill</div>
                <div>Quantitative</div>
                <div>Hobbies</div>
                <div>Text (semantic embedding)</div>
                <div>Course expectations</div>
                <div>Text (semantic embedding)</div>
              </div>
            </div>
            <figcaption>
              <strong>Figure 2. Attribute type classification used in the dataset.</strong>
              Open-text responses describing hobbies and course expectations cannot be compared
              directly. They are transformed into semantic embeddings, which convert textual meaning
              into vector representations that allow similarity comparison between students.
            </figcaption>
          </figure>

          <figure class="figureCard">
            <div class="figureFrame">
              <pre class="figurePre">Build
 |- Programming
 |- Code repository management
 |- Computer graphics / HCI programming

Think &amp; Visualization
 |- Statistics
 |- Mathematics
 |- Information visualization

Design
 |- User experience evaluation
 |- Artistic and visual design

Team Collaboration
 |- Communication
 |- Collaboration</pre>
            </div>
            <figcaption>
              <strong>Figure 3. Skill aggregation into four competency domains.</strong>
              Individual skill ratings are grouped into four higher-level competency domains: Build,
              Think &amp; Visualization, Design, and Team Collaboration. This aggregation reduces
              dimensional complexity and supports clearer comparison between students and teams.
            </figcaption>
          </figure>

          <figure class="figureCard">
            <div class="figureFrame">
              <pre class="figurePre">Individual level
Student table
  - ratings
  - programme
  - alias
  - hobbies / goals

        |
        | aggregation
        v

Group level
Team totals and role assignments

        |
        | semantic transformation
        v

Embedding space
Similarity structure for hobbies and goals</pre>
            </div>
            <figcaption>
              <strong>Figure 4. Multiple data abstractions used in the system.</strong>
              The dataset supports multiple abstraction levels. At the individual level, it remains
              a table of student attributes. At the group level, it becomes aggregated team
              statistics. For hobbies and goals, the data forms a semantic similarity space used for
              grouping analysis.
            </figcaption>
          </figure>
        </div>
        <div v-else-if="section.id === 'task-abstraction'" class="taskPracticeText">
          <p>
            Following Munzner's task abstraction framework, the system defines user goals as
            abstract analytical tasks rather than domain-specific actions. The workflow supports
            discovery, search, comparison, and summarization during team formation.
          </p>
          <p>
            The team formation problem is translated into abstract visualization tasks such as
            locating suitable members, identifying student characteristics, comparing teams, and
            summarizing balance.
          </p>

          <figure class="figureCard">
            <div class="figureFrame">
              <p class="figureHint">Image reference: task abstraction mapping diagram.</p>
              <pre class="figurePre">Domain Goal
Form balanced student teams
        |
        v
Abstract Tasks
- Locate suitable members
- Identify student characteristics
- Compare candidate teams
- Summarize group balance
- Derive team structure</pre>
            </div>
            <figcaption>
              <strong>Figure 1. Task abstraction mapping from domain goal to analytical tasks.</strong>
            </figcaption>
          </figure>

          <p>
            Munzner argues that domain problems must be translated into abstract tasks before
            designing visualizations. This website follows that best practice because the team
            formation problem is decomposed into overview exploration, candidate search, person
            inspection, group comparison, balance evaluation, and role assignment. The site
            structure directly reflects that task decomposition across Overview, Grouping, Group
            Details, and Compare.
          </p>

          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: overview dashboard.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/home"
                  title="Open Overview. Relevant charts are in Home.vue."
                >
                  Overview
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 2. Overview visualizations supporting discovery tasks.</strong>
            </figcaption>
          </figure>

          <p>
            Munzner distinguishes between <strong>present</strong>, which shows known information,
            and <strong>discover</strong>, which helps users explore unknown patterns. The Overview
            page supports discovery because users inspect cohort-wide patterns, trait distributions,
            and overview summaries before making grouping decisions, which helps them detect
            strengths, gaps, and outliers. The system also supports presentation when previously
            saved grouping results are restored from Firebase and shown back to the user as known
            team configurations, so the interface is used both to discover possible structures and
            to present confirmed outcomes.
          </p>

          <figure class="figureCard">
            <div class="figureFrame">
              <p class="figureHint">Image reference: workflow of abstract tasks.</p>
              <pre class="figurePre figurePreWide">Explore cohort overview -> Locate candidates by similarity -> Inspect student detail-> Grouping 
Browse group structures -> Assign responsibilities -> Compare team quality -> Save and iterate</pre>
            </div>
            <figcaption>
              <strong>Figure 3. Horizontal workflow of abstract tasks across the website.</strong>
              The workflow connects exploration, search, inspection, comparison, and production into
              one iterative decision process.
            </figcaption>
          </figure>

          <p>
            Munzner notes that visualization systems should support multiple search behaviors. This
            website supports lookup, locate, browse, and explore in different views. Lookup occurs
            when a known student is opened directly in a detail drawer. Locate occurs when
            similarity scoring ranks candidates by embedding similarity. Browse occurs when users
            inspect group cards, group slots, and role tables. Explore occurs when users scan the
            overview and comparison views for broader cohort patterns.
          </p>

          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: radar / dumbbell, variance/SD comparison charts.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/compare"
                  title="Open Comparison. Relevant charts are in Compare.vue."
                >
                  Comparison
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 4. Comparison views supporting identify, compare, and summarize.</strong>
            </figcaption>
          </figure>

          <p>
            Munzner proposes three core query scopes: <strong>identify</strong>,
            <strong>compare</strong>, and <strong>summarize</strong>. These scopes are implemented
            explicitly in the interface. Identify is supported by student detail drawers and role
            tables. Compare is supported by radar and dumbbell charts comparing groups side by side.
            Summarize is supported by aggregated statistics, overview charts, and Variance / SD
            views that compress multiple values into interpretable indicators of balance.
          </p>

          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: role assignment / saved grouping workflow.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/grouping"
                  title="Open Grouping. Responsibility views are in Grouping.vue and GroupDetails.vue."
                >
                  Grouping
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 5. Role assignment and saved grouping as produce tasks.</strong>
            </figcaption>
          </figure>

          <p>
            Munzner points out that visualization interaction also supports
            <strong>produce</strong> tasks, where users create new analytical artifacts. This
            website follows that best practice because users do not only consume information. They
            produce analytical outcomes by forming teams, assigning responsibilities, and saving
            group configurations. The result of interaction is not only insight, but also a
            constructed team solution that can be reviewed, compared, and iterated.
          </p>
        </div>
        <div v-else-if="section.id === 'validation'" class="validationText">
          <p>
            Munzner's four levels of validation provide a practical structure for judging whether a
            visualization system is well designed. Rather than validating only the final interface,
            the framework asks whether the domain problem is appropriate, whether the abstraction is
            correct, whether the visual idiom fits the tasks, and whether the algorithms implement
            the design effectively.
          </p>

          <p><strong>Level 1 - Domain Problem</strong></p>
          <figure class="figureCard">
            <div class="figureFrame">
              
              <pre class="figurePre figurePreWide">Overview -> Inspect cohort patterns -> Build candidate teams -> Assign roles
        -> Compare team balance -> Iterate -> Confirm groups</pre>
            </div>
            <figcaption>
              <strong>Figure 1. Team formation workflow derived from the system.</strong>
              Corresponding views:
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Main workflow entry is in Home.vue."
              >
                Overview
              </RouterLink>,
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Team editing workflow is in Grouping.vue."
              >
                Grouping
              </RouterLink>, and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Team comparison views are in Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            The website addresses a real decision problem: forming balanced student teams based on
            skills, interests, and collaboration roles. This aligns with Munzner's best practice
            that visualization design should start from a clearly defined domain problem rather than
            a purely technical chart example.
          </p>

          <p><strong>Level 2 - Data &amp; Task Abstraction</strong></p>
          <figure class="figureCard">
            <div class="figureFrame">
              <p class="figureHint">Image reference: data abstraction diagram.</p>
              <pre class="figurePre">Students -> items
Skill ratings -> quantitative attributes
Programme / alias -> categorical attributes
Hobbies / goals -> embedding-based similarity signals
Grouping workflow -> discover, locate, identify, compare, summarize, produce</pre>
            </div>
            <figcaption>
              <strong>Figure 2. Data and task abstraction diagram.</strong>
              Related views:
              <RouterLink
                class="figureLink"
                to="/about"
                title="Current page. Documentation content is in About.vue."
              >
                About
              </RouterLink>,
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Task and data abstractions are applied in Grouping.vue."
              >
                Grouping
              </RouterLink>, and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Comparison abstractions are applied in Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            The system transforms domain data into structured abstractions where students become
            items, skills become quantitative attributes, and textual responses are converted into
            embedding-based similarity signals. This follows Munzner's principle that domain
            concepts should be translated into abstract data structures and analytical tasks before
            visualization.
          </p>

          <p><strong>Level 3 - Visual Idiom</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: overview + comparison charts.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/home"
                  title="Open Overview. Overview idioms are mainly shown in Home.vue."
                >
                  Overview
                </RouterLink>
                and
                <RouterLink
                  class="figureLink"
                  to="/compare"
                  title="Open Comparison. Comparison idioms are mainly shown in Compare.vue."
                >
                  Comparison
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 3. Overview and comparison idioms.</strong>
              Screenshot sources:
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Source page: Home.vue."
              >
                Overview
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Source page: Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Visualizations are selected to match analytical tasks: overview charts support
            discovery, detail views support identification, and comparison charts such as radar or
            dumbbell plots evaluate team balance. This reflects Munzner's guideline that visual
            idioms should correspond to the data abstractions and tasks they support.
          </p>

          <p><strong>Level 4 - Algorithm</strong></p>
          <figure class="figureCard">
            <div class="figureFrame">
              <p class="figureHint">Image reference: system pipeline / interaction workflow.</p>
              <pre class="figurePre figurePreWide">Raw student records -> aggregation / embeddings / scoring -> interactive views
                   -> drag/drop grouping -> role assignment -> persistent saved state</pre>
            </div>
            <figcaption>
              <strong>Figure 4. System pipeline supporting interaction.</strong>
              Key workflow views:
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Interaction logic is centered in Grouping.vue."
              >
                Grouping
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Comparison logic is centered in Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            The implementation supports the visual design through aggregation, similarity scoring,
            and persistent grouping state, enabling responsive interaction when teams are modified.
            This satisfies Munzner's requirement that algorithms must effectively support the
            intended visual idioms and analytical workflow.
          </p>
        </div>
        <div v-else-if="section.id === 'marks-channels'" class="validationText">
          <p>
            In the marks and channels framework, Munzner explains that visualizations are
            constructed from graphical marks (points, lines, and areas) combined with visual
            channels such as position, color, and size to encode data. This website follows that
            principle by consistently mapping data attributes to appropriate marks and channels
            rather than using arbitrary visual styling.
          </p>

          <p><strong>Position for Quantitative Comparison</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: beeswarm + radar.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/home"
                  title="Open Overview. Position-based charts appear in Home.vue."
                >
                  Overview
                </RouterLink>
                and
                <RouterLink
                  class="figureLink"
                  to="/compare"
                  title="Open Comparison. Position-based comparison charts appear in Compare.vue."
                >
                  Comparison
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 1. Position-based encodings for quantitative comparison.</strong>
              Screenshot sources:
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Source page: Home.vue."
              >
                Overview
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Source page: Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Position and aligned length are used to encode important quantitative values such as
            skill ratings, group totals, and balance differences. Charts such as heatmaps, beeswarm
            plots, and dumbbell comparisons rely on spatial alignment along axes, which supports
            accurate comparison across students and teams, matching Munzner's guideline that
            position is one of the most effective channels for ordered data.
          </p>

          <p><strong>Appropriate Mark Types</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Open the corresponding views:</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/home"
                  title="Open Overview. Point-based views appear in Home.vue."
                >
                  Overview
                </RouterLink>
                and
                <RouterLink
                  class="figureLink"
                  to="/compare"
                  title="Open Comparison. Line-based comparison views appear in Compare.vue."
                >
                  Comparison
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 2. Different mark types used for different analytical structures.</strong>
              Screenshot sources:
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Source page: Home.vue."
              >
                Overview
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Source page: Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Different mark types are used according to analytical structure. Point marks represent
            individual students in beeswarm-style views, while line marks in radar or dumbbell
            charts emphasize relationships and profiles across multiple dimensions. This reflects
            Munzner's principle that marks should match the structure of the data being represented.
          </p>

          <p><strong>Identity Channels for Categories</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: group cards / colored groups.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/grouping"
                  title="Open Grouping. Group identity and responsibility views are in Grouping.vue."
                >
                  Grouping
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 3. Hue and spatial grouping for categorical identity.</strong>
              Screenshot source:
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Source page: Grouping.vue."
              >
                Grouping
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Color hue and spatial grouping are used to distinguish groups and individuals, while
            magnitude comparisons rely on position-based encodings rather than color intensity. This
            follows Munzner's guideline that color hue is most suitable for categorical identity
            rather than quantitative comparison.
          </p>

          <p><strong>Controlled Use of Size and Visual Emphasis</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: variance bars / threshold bars.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/compare"
                  title="Open Comparison. Balance charts are in Compare.vue."
                >
                  Comparison
                </RouterLink>
                and
                <RouterLink
                  class="figureLink"
                  to="/grouping"
                  title="Open Grouping. Responsibility views are in Grouping.vue."
                >
                  Grouping
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 4. Size and emphasis used with restraint.</strong>
              Screenshot sources:
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Source page: Compare.vue."
              >
                Comparison
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Source page: Grouping.vue."
              >
                Grouping
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Size and other lower-ranked channels are used sparingly, while most important
            comparisons are supported by axis-based charts with explicit scales. This aligns with
            Munzner's effectiveness principle that less accurate channels should not carry critical
            quantitative information.
          </p>
        </div>
        <div v-else-if="section.id === 'rules-of-thumb'" class="validationText">
          <p>
            Munzner summarizes several practical rules of thumb for visualization design that
            consider human perception, cognitive limits, and interaction efficiency. These
            principles encourage simple visual representations, clear navigation between overview and
            detail, and responsive interaction to support iterative analysis. This website follows
            those principles well, especially in the way it structures analysis as a repeatable
            workflow rather than a single static report.
          </p>

          <p><strong>Prefer Simple Visual Representations</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Open the corresponding view:</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/home"
                  title="Open Overview. Simple overview charts are in Home.vue."
                >
                  Overview
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 1. Simple two-dimensional overview dashboard.</strong>
              Screenshot source:
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Source page: Home.vue."
              >
                Overview
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            The website mainly uses clear two-dimensional charts such as heatmaps, beeswarm plots,
            radar, dumbbell, and comparison charts, while avoiding unnecessary 3D effects or
            decorative distortion. This follows Munzner's guideline that simple visual
            representations reduce perceptual distortion and improve interpretability. A practical
            strength of this site is that even when multiple views are present, each view remains
            visually plain enough to support analysis rather than spectacle.
          </p>

          <p><strong>Overview Before Detail</strong></p>
          <figure class="figureCard">
            <div class="figureFrame">
              <pre class="figurePre figurePreWide">Overview charts -> select person or group -> open detail drawer / detail panel
              -> inspect evidence -> return to grouping or comparison</pre>
            </div>
            <figcaption>
              <strong>Figure 2. Overview-to-detail workflow in the system.</strong>
              Related views:
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Overview stage is in Home.vue."
              >
                Overview
              </RouterLink>,
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Detail and editing stage is in Grouping.vue."
              >
                Grouping
              </RouterLink>, and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Comparison stage is in Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Users first explore the cohort through overview views and then inspect individuals or
            groups in detail panels, following Munzner's well-known principle of overview first,
            zoom and filter, then details on demand. This pattern appears repeatedly in the code:
            overview pages expose broad distributions, while drawers and group detail panels provide
            focused inspection only when needed.
          </p>

          <p><strong>Support Rapid Visual Search</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: group cards / highlighting.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/home"
                  title="Open Overview. Search-related highlighting appears in Home.vue."
                >
                  Overview
                </RouterLink>
                and
                <RouterLink
                  class="figureLink"
                  to="/grouping"
                  title="Open Grouping. Search and selection state also appears in Grouping.vue."
                >
                  Grouping
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 3. Group cards, color cues, and highlighting for fast search.</strong>
              Screenshot sources:
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Source page: Grouping.vue."
              >
                Grouping
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/home"
                title="Open Overview. Source page: Home.vue."
              >
                Overview
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            Spatial grouping, color cues, and selection highlighting allow users to quickly locate
            relevant students or groups, which reflects Munzner's recommendation to design visual
            layouts that reduce cognitive load and support efficient visual search. In this website,
            that support is not only visual but interactive: selected people, compared groups,
            dragged members, and active slots are all surfaced with immediate visual distinction.
          </p>

          <p><strong>Responsive Interaction</strong></p>
          <figure class="figureCard">
            <div class="figureFrame figureSource">
              <p>Image reference: group editing / comparison.</p>
              <p>
                <RouterLink
                  class="figureLink"
                  to="/compare"
                  title="Open Comparison. Responsive comparison charts are in Compare.vue."
                >
                  Comparison
                </RouterLink>
                and
                <RouterLink
                  class="figureLink"
                  to="/grouping"
                  title="Open Grouping. Responsive editing interactions are in Grouping.vue."
                >
                  Grouping
                </RouterLink>
              </p>
            </div>
            <figcaption>
              <strong>Figure 4. Responsive interaction during grouping and comparison.</strong>
              Key workflow views:
              <RouterLink
                class="figureLink"
                to="/grouping"
                title="Open Grouping. Main interaction workflow is in Grouping.vue."
              >
                Grouping
              </RouterLink>
              and
              <RouterLink
                class="figureLink"
                to="/compare"
                title="Open Comparison. Responsive comparison workflow is in Compare.vue."
              >
                Comparison
              </RouterLink>.
            </figcaption>
          </figure>
          <p>
            The interface updates immediately when teams are adjusted or compared, enabling repeated
            exploration and refinement. This follows Munzner's rule that interactive visualization
            systems should provide fast feedback to maintain analytical flow. In code terms, this is
            supported by local persistence of grouping state, computed summaries, reusable compare
            slots, resize-aware charts, and worker-based embedding computation that helps preserve
            responsiveness when similarity scoring is involved.
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

.navGroup {
  display: grid;
  gap: 8px;
}

.navGroupBtn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.navGroupArrow {
  position: absolute;
  right: 14px;
  font-size: 14px;
  transition: transform 140ms ease;
}

.navGroupArrow.expanded {
  transform: rotate(180deg);
}

.navSubgroup {
  display: grid;
  gap: 8px;
  padding-left: 10px;
}

.navSubBtn {
  min-height: 40px;
  border: none;
  border-radius: 10px;
  background: #f8fbff;
  color: #1e3a8a;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  padding: 0 12px;
  cursor: pointer;
}

.navSubBtn:hover {
  background: #dbeafe;
}

.navSubBtn.active {
  background: #bfdbfe;
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

.bestPracticeText {
  display: grid;
  gap: 18px;
  color: #1f3b7a;
  line-height: 1.65;
  font-size: 15px;
}

.bestPracticeText p {
  margin: 0;
}

.taskPracticeText {
  display: grid;
  gap: 18px;
  color: #1f3b7a;
  line-height: 1.65;
  font-size: 15px;
}

.taskPracticeText p {
  margin: 0;
}

.validationText {
  display: grid;
  gap: 14px;
  color: #1f3b7a;
  line-height: 1.65;
  font-size: 15px;
}

.validationText p {
  margin: 0;
}

.figureCard {
  margin: 0;
  display: grid;
  gap: 10px;
}

.figureFrame {
  border-radius: 16px;
  border: 1px solid rgba(30, 58, 138, 0.16);
  background:
    linear-gradient(180deg, rgba(219, 234, 254, 0.55), rgba(239, 246, 255, 0.9)),
    #ffffff;
  padding: 16px 18px;
  overflow-x: auto;
}

.figurePre {
  margin: 0;
  font-family: "Consolas", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #0f172a;
  white-space: pre-wrap;
}

.figurePreWide {
  white-space: pre-wrap;
}

.figureHint {
  margin: 0 0 10px;
  color: #1f3b7a;
  font-size: 14px;
  font-weight: 600;
}

.figureCard figcaption {
  color: #1f3b7a;
  font-size: 14px;
}

.figureSource {
  display: grid;
  gap: 6px;
}

.figureSource p {
  margin: 0;
  color: #1f3b7a;
}

.figureSource a,
.figureLink {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
}

.figureSource a:hover,
.figureLink:hover {
  text-decoration: underline;
}

.attrTable {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
  border: 1px solid rgba(30, 58, 138, 0.14);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.75);
}

.attrTable > div {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(30, 58, 138, 0.1);
}

.attrTable > div:nth-last-child(-n + 2) {
  border-bottom: none;
}

.attrTable > div:nth-child(odd) {
  border-right: 1px solid rgba(30, 58, 138, 0.1);
}

.attrHead {
  font-weight: 700;
  background: rgba(191, 219, 254, 0.55);
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
