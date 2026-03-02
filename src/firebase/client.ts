import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAAcAs-6DTGXIiG5zbajmkrnx0VDH_0BKk",
  authDomain: "grouping-a9237.firebaseapp.com",
  projectId: "grouping-a9237",
  storageBucket: "grouping-a9237.firebasestorage.app",
  messagingSenderId: "697849040597",
  appId: "1:697849040597:web:c4ecaaccd44c0c12cd9c5c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(() => {
  // ignore persistence failures and fallback to default
});
