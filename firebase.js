import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDMEcjWkDhGa_eHiWgAeMlzgmPy5-7FpEw",
  authDomain: "aurak-leveling.firebaseapp.com",
  projectId: "aurak-leveling",
  storageBucket: "aurak-leveling.firebasestorage.app",
  messagingSenderId: "146240319472",
  appId: "1:146240319472:web:41b29978c6f79bd0ebf735",
  measurementId: "G-3Q1Z4M1EB5",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

let authReady = false;
let authReadyPromise = null;

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence setup failed:", error);
});

export function waitForAuthReady() {
  if (authReady) return Promise.resolve(auth.currentUser);
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      () => {
        authReady = true;
        unsubscribe();
        resolve(auth.currentUser);
      },
      () => {
        authReady = true;
        unsubscribe();
        resolve(auth.currentUser);
      },
    );
  });

  return authReadyPromise;
}
