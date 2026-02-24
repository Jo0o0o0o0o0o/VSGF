import { createRouter, createWebHistory } from 'vue-router'
import Home from "@/views/Home.vue";
import Compare from "@/views/Compare.vue";
import About from "@/views/About.vue";
import Grouping from "@/views/Grouping.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/home" },
    { path: "/home", component: Home },
    { path: "/grouping", component: Grouping },
    { path: "/compare", component: Compare },
    { path: "/about", component: About },
  ],
});
