<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "@/firebase/client";

const route = useRoute();
const router = useRouter();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const error = ref("");

const redirectPath = computed(() => {
  const raw = route.query.redirect;
  if (typeof raw === "string" && raw.startsWith("/")) return raw;
  return "/home";
});

function clearFormError() {
  error.value = "";
}

async function submitEmailAuth() {
  clearFormError();
  const normalizedEmail = email.value.trim();
  if (!normalizedEmail || !password.value) {
    error.value = "Please enter both email and password.";
    return;
  }
  if (mode.value === "register" && password.value !== confirmPassword.value) {
    error.value = "Passwords do not match.";
    return;
  }

  loading.value = true;
  try {
    if (mode.value === "register") {
      await createUserWithEmailAndPassword(auth, normalizedEmail, password.value);
    } else {
      await signInWithEmailAndPassword(auth, normalizedEmail, password.value);
    }
    await router.replace(redirectPath.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed.";
    error.value = message;
  } finally {
    loading.value = false;
  }
}

async function submitGoogleAuth() {
  clearFormError();
  loading.value = true;
  try {
    await signInWithPopup(auth, googleProvider);
    await router.replace(redirectPath.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google sign-in failed.";
    error.value = message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="authPage">
    <section class="authCard level-1">
      <h2>Welcome</h2>
      <p class="sub">Login or register to use the dashboard.</p>

      <div class="modeSwitch" role="group" aria-label="auth mode switch">
        <button class="modeBtn" :class="{ active: mode === 'login' }" type="button" @click="mode = 'login'; clearFormError()">
          Login
        </button>
        <button class="modeBtn" :class="{ active: mode === 'register' }" type="button" @click="mode = 'register'; clearFormError()">
          Register
        </button>
      </div>

      <form class="authForm" @submit.prevent="submitEmailAuth">
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" autocomplete="email" required />
        </label>

        <label class="field">
          <span>Password</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>

        <label v-if="mode === 'register'" class="field">
          <span>Confirm Password</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" required />
        </label>

        <div v-if="error" class="errorMsg">{{ error }}</div>

        <button class="submitBtn" type="submit" :disabled="loading">
          {{ loading ? "Please wait..." : mode === "register" ? "Create account" : "Login" }}
        </button>
      </form>

      <div class="divider"><span>or</span></div>

      <button class="googleBtn" type="button" :disabled="loading" @click="submitGoogleAuth">
        Continue with Google
      </button>
    </section>
  </main>
</template>

<style scoped>
.authPage {
  min-height: calc(100vh - 120px);
  display: grid;
  place-items: center;
  padding: 16px;
}

.authCard {
  width: min(440px, 100%);
  padding: 18px;
  border-radius: 14px;
}

h2 {
  margin: 0;
}

.sub {
  margin: 6px 0 12px;
  color: #64748b;
  font-size: 13px;
}

.modeSwitch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.modeBtn {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  height: 32px;
  font-weight: 600;
  cursor: pointer;
}

.modeBtn.active {
  border-color: #60a5fa;
  background: #dbeafe;
  color: #1d4ed8;
}

.authForm {
  display: grid;
  gap: 10px;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  font-size: 12px;
  color: #475569;
}

.field input {
  height: 34px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 10px;
}

.errorMsg {
  font-size: 12px;
  color: #b91c1c;
  background: #fee2e2;
  border-radius: 8px;
  padding: 8px 10px;
}

.submitBtn,
.googleBtn {
  height: 34px;
  border: 1px solid #93c5fd;
  background: #e0f2fe;
  color: #0c4a6e;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
}

.submitBtn:disabled,
.googleBtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.divider {
  margin: 12px 0;
  position: relative;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

.divider::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px solid #e2e8f0;
}

.divider span {
  position: relative;
  background: #fff;
  padding: 0 8px;
}
</style>

