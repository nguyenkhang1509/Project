import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function readUserDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function mergeUserDoc(uid, payload) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

export async function patchUserDoc(uid, payload) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
}
/**
 * Gets the current user from localStorage
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Creates an account-specific storage key using the user's UID
 * @param {string} baseKey - The base key name (e.g., "quests", "totalXP")
 * @param {string} uid - The user's UID. If not provided, uses current user's UID
 * @returns {string} The account-specific key
 */
export function getStorageKey(baseKey, uid = null) {
  const userId = uid || getCurrentUser()?.uid;
  if (!userId) {
    console.warn(`getStorageKey: No user ID available for key "${baseKey}"`);
    return baseKey;
  }
  return `${baseKey}_${userId}`;
}

/**
 * Clears all account-specific data for a given user
 * @param {string} uid - The user's UID
 */
export function clearAccountData(uid) {
  const accountKeys = [
    "aurak_quests_v4",
    "totalXP",
    "completedQuests",
    "weeklyGraphResetDate",
    "weeklyQuestData",
    "aurak_streak",
    "aurak_streak_last",
    "aurak_week_presence",
  ];

  accountKeys.forEach((key) => {
    const storageKey = getStorageKey(key, uid);
    localStorage.removeItem(storageKey);
  });
}

/**
 * Logs out the current user and clears their account data
 */
export function logout() {
  const user = getCurrentUser();
  if (user && user.uid) {
    clearAccountData(user.uid);
  }
  localStorage.removeItem("aurakCurrentUser");
  window.location.href = "login.html";
}
