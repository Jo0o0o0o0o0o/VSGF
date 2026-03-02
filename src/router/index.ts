import { createRouter, createWebHistory } from 'vue-router'
import Home from "@/views/Home.vue";
import Compare from "@/views/Compare.vue";
import About from "@/views/About.vue";
import Grouping from "@/views/Grouping.vue";
import Auth from "@/views/Auth.vue";
import { currentUser, waitForAuthReady } from "@/utils/authSession";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/home" },
    { path: "/auth", component: Auth, meta: { public: true } },
    { path: "/home", component: Home },
    { path: "/grouping", component: Grouping },
    { path: "/compare", component: Compare },
    { path: "/about", component: About },
  ],
});

router.beforeEach(async (to) => {
  await waitForAuthReady();
  const isPublic = to.meta.public === true;
  const user = currentUser.value;

  if (!user && !isPublic) {
    return {
      path: "/auth",
      query: { redirect: to.fullPath },
    };
  }

  if (user && to.path === "/auth") {
    const redirect = typeof to.query.redirect === "string" && to.query.redirect.startsWith("/")
      ? to.query.redirect
      : "/home";
    return redirect;
  }

  return true;
});
