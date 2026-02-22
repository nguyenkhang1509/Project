import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ACCOUNT_SYNC_BASE_KEYS = [
  "aurak_quests_v4",
  "totalXP",
  "completedQuests",
  "dailyQuestResetDate",
  "dailyTaskHistory",
  "weeklyGraphResetDate",
  "weeklyQuestData",
  "aurak_streak",
  "aurak_streak_last",
  "aurak_week_presence",
  "aurak_journal_v1",
  "aurak_dashboard_reflection_v1",
  "aurak_journal_recent_collapsed_v1",
  "aurakDashboard",
  "aurak_user_profile",
  "aurak_dpl_daily_done_v1",
  "aurak_daily_done_v1",
  "aurak_dpl_track_v1",
  "aurak_dpl_tracking_v1",
];

const SYNC_INTERVAL_MS = 3000;
const syncSessions = new Map();

export async function readUserDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function mergeUserDoc(uid, payload) {
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function patchUserDoc(uid, payload) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
}
/**

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

 * @param {string} baseKey 
 * @param {string} uid 
 * @returns {string}
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

function getAccountSyncKeys(uid) {
  if (!uid) return [];
  return ACCOUNT_SYNC_BASE_KEYS.map((baseKey) => getStorageKey(baseKey, uid));
}

function collectAccountState(uid) {
  const state = {};
  getAccountSyncKeys(uid).forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) state[key] = value;
  });
  return state;
}

function applyAccountState(state) {
  if (!state || typeof state !== "object") return;
  const changedKeys = [];
  Object.entries(state).forEach(([key, value]) => {
    if (typeof value === "string") {
      const prev = localStorage.getItem(key);
      if (prev !== value) {
        localStorage.setItem(key, value);
        changedKeys.push(key);
      }
    }
  });

  // storage events do not fire in the same tab; emit synthetic events so
  // active pages can re-render after cloud hydration updates localStorage.
  changedKeys.forEach((key) => {
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          oldValue: null,
          newValue: localStorage.getItem(key),
          storageArea: localStorage,
          url: window.location.href,
        }),
      );
    } catch {}
  });

  if (changedKeys.length > 0) {
    try {
      window.dispatchEvent(
        new CustomEvent("aurak:account-state-hydrated", {
          detail: { keys: changedKeys },
        }),
      );
    } catch {}
  }
}

export async function hydrateAccountState(uid) {
  if (!uid) return false;
  const cloud = await readUserDoc(uid);
  const appState = cloud?.appState;
  if (!appState || typeof appState !== "object") return false;
  applyAccountState(appState);
  return true;
}

export async function flushAccountState(uid) {
  if (!uid) return;
  const appState = collectAccountState(uid);
  await mergeUserDoc(uid, { appState });
}

export function startAccountCloudSync(uidArg = null) {
  const uid = uidArg || getCurrentUser()?.uid;
  if (!uid) return Promise.resolve(false);

  const existing = syncSessions.get(uid);
  if (existing?.promise) return existing.promise;

  const promise = (async () => {
    let allowFlush = false;
    let lastSerialized = "";
    let flushing = false;

    const tryHydrateOnce = async () => {
      const cloud = await readUserDoc(uid);
      const appState = cloud?.appState;

      if (appState && typeof appState === "object") {
        applyAccountState(appState);
      }

      // Allow writes only after we have successfully read the cloud document.
      // This prevents a fresh/slow device from overwriting cloud state with
      // empty local data when initial hydrate fails.
      allowFlush = true;
      lastSerialized = JSON.stringify(collectAccountState(uid));
    };

    try {
      await tryHydrateOnce();
    } catch (err) {
      console.warn("Cloud hydrate failed:", err);
      allowFlush = false;
    }

    const tryFlush = async () => {
      if (flushing) return;
      if (!allowFlush) {
        try {
          await tryHydrateOnce();
        } catch (err) {
          console.warn("Cloud hydrate retry failed:", err);
          return;
        }
      }
      const snapshot = collectAccountState(uid);
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSerialized) return;
      flushing = true;
      try {
        await mergeUserDoc(uid, { appState: snapshot });
        lastSerialized = serialized;
      } catch (err) {
        console.warn("Cloud sync failed:", err);
      } finally {
        flushing = false;
      }
    };

    const timer = window.setInterval(tryFlush, SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void tryFlush();
      }
    };
    const onUnload = () => {
      void tryFlush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);

    syncSessions.set(uid, {
      promise,
      timer,
      tryFlush,
      onVisibility,
      onUnload,
    });

    await tryFlush();
    return true;
  })();

  syncSessions.set(uid, { promise });
  return promise;
}

export function logout() {
  const user = getCurrentUser();
  if (user && user.uid) {
    const sync = syncSessions.get(user.uid);
    if (sync?.timer) {
      window.clearInterval(sync.timer);
    }
    if (sync?.onVisibility) {
      document.removeEventListener("visibilitychange", sync.onVisibility);
    }
    if (sync?.onUnload) {
      window.removeEventListener("beforeunload", sync.onUnload);
    }
    if (sync?.tryFlush) {
      void sync.tryFlush();
    }
    syncSessions.delete(user.uid);
  }
  localStorage.removeItem("aurakCurrentUser");
  window.location.href = "login.html";
}
