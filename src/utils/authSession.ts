import { ref } from "vue";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/firebase/client";

export const currentUser = ref<User | null>(null);

let resolved = false;
let resolveReady: (() => void) | null = null;

const authReadyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

onAuthStateChanged(auth, (user) => {
  currentUser.value = user;
  if (!resolved) {
    resolved = true;
    resolveReady?.();
  }
});

export function waitForAuthReady() {
  return authReadyPromise;
}

export function logout() {
  return signOut(auth);
}

