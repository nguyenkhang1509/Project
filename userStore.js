import { auth, db, waitForAuthReady } from "./firebase.js";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const USER_DOC_CACHE_BASE = "aurak_user_doc_cache_v1";
const PROFILE_KEY_BASE = "aurak_user_profile";
const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const TASK_HISTORY_KEY = "dailyTaskHistory";
const JOURNAL_KEY_BASE = "aurak_journal_v1";
const DASH_REFLECTION_KEY_BASE = "aurak_dashboard_reflection_v1";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

function getISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLevelInfo(totalXp) {
  let level = 1;
  let req = BASE_XP_PER_LEVEL;
  let remaining = Number.isFinite(totalXp) ? totalXp : 0;

  for (let guard = 0; guard < 200; guard++) {
    if (remaining < req) break;
    remaining -= req;
    level += 1;
    req = Math.max(1, Math.round(req * LEVEL_GROWTH));
  }

  const progress = req > 0 ? remaining / req : 0;
  return { level, req, progress, remaining };
}

function averageStat(stats) {
  if (!stats) return null;
  const keys = [
    "Physical",
    "Intellectual",
    "Mental",
    "Confidence",
    "Discipline",
  ];
  const vals = keys
    .map((key) => Number(stats[key]))
    .filter((value) => Number.isFinite(value));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function rankFromAverage(avg) {
  if (!Number.isFinite(avg)) return "-";
  if (avg >= 90) return "S";
  if (avg >= 80) return "A";
  if (avg >= 60) return "B";
  if (avg >= 40) return "C";
  if (avg >= 20) return "D";
  return "E";
}

function heroMoodKeyFromTaskCount(taskCount) {
  const count = Math.max(0, Number(taskCount) || 0);
  if (count <= 0) return "exhausted";
  if (count <= 2) return "warming-up";
  if (count <= 4) return "focused";
  return "locked-in";
}

function safeParseJSON(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readLocalJSON(key, fallback = null) {
  try {
    return safeParseJSON(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeLocalJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readScopedValue(baseKey, uid, fallback = null) {
  return readLocalJSON(getStorageKey(baseKey, uid), fallback);
}

function readScopedString(baseKey, uid, fallback = "") {
  try {
    const raw = localStorage.getItem(getStorageKey(baseKey, uid));
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function writeScopedString(baseKey, uid, value) {
  try {
    localStorage.setItem(getStorageKey(baseKey, uid), String(value));
    return true;
  } catch {
    return false;
  }
}

function sanitizeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeWeeklyData(value) {
  if (!Array.isArray(value)) return [0, 0, 0, 0, 0, 0, 0];
  const list = value
    .slice(0, 7)
    .map((item) => (Number.isFinite(Number(item)) ? Number(item) : 0));
  while (list.length < 7) list.push(0);
  return list;
}

function normalizeJournal(value) {
  if (Array.isArray(value?.entries)) {
    return {
      entries: value.entries.filter(
        (entry) => entry && typeof entry === "object",
      ),
    };
  }
  if (value && typeof value === "object") {
    return {
      entries: Object.values(value).filter(
        (entry) => entry && typeof entry === "object",
      ),
    };
  }
  return { entries: [] };
}

function readLegacyProfile(uid) {
  return readScopedValue(PROFILE_KEY_BASE, uid, null);
}

function buildLocalState(uid, seed = {}) {
  const currentUser = getCurrentUser();
  const cached = readCachedUserDoc(uid) || {};
  const legacyProfile = readLegacyProfile(uid) || {};
  const questState = readScopedValue(QUEST_STORAGE_KEY, uid, {});
  const taskHistory = readScopedValue(TASK_HISTORY_KEY, uid, {});
  const journalStore =
    readScopedValue(JOURNAL_KEY_BASE, uid, null) ||
    readLocalJSON("aurakJournal", null);
  const dashboardReflection = readScopedValue(
    DASH_REFLECTION_KEY_BASE,
    uid,
    null,
  );
  const membership =
    readScopedValue("aurak_membership", uid, null) ||
    cached.membership ||
    legacyProfile.membership ||
    null;
  const completedQuests = readScopedValue("completedQuests", uid, []);
  const totalXP = Math.max(
    0,
    Number(readScopedString(XP_STORAGE_KEY, uid, "0")) || 0,
  );
  const weeklyQuestData =
    readScopedValue("weeklyQuestData", uid, null) ||
    readLocalJSON("weeklyQuestData", null);
  const weeklyGraphResetDate =
    readScopedString("weeklyGraphResetDate", uid, "") ||
    readLocalJSON("weeklyGraphResetDate", "") ||
    "";
  const dailyQuestResetDate = readScopedString("dailyQuestResetDate", uid, "");
  const dashboard =
    readScopedValue("aurakDashboard", uid, null) ||
    readLocalJSON("aurakDashboard", null);

  const profile = {
    displayName:
      seed.profile?.displayName ??
      seed.displayName ??
      cached.profile?.displayName ??
      cached.displayName ??
      (currentUser?.uid === uid
        ? currentUser.displayName || currentUser.name || null
        : null) ??
      legacyProfile.displayName ??
      legacyProfile.name ??
      null,
    tagline:
      seed.profile?.tagline ??
      cached.profile?.tagline ??
      legacyProfile.tagline ??
      legacyProfile.subtitle ??
      "",
    bio: seed.profile?.bio ?? cached.profile?.bio ?? legacyProfile.bio ?? "",
    socials:
      sanitizeObject(seed.profile?.socials) &&
      Object.keys(sanitizeObject(seed.profile?.socials)).length
        ? sanitizeObject(seed.profile?.socials)
        : sanitizeObject(cached.profile?.socials, legacyProfile.socials || {}),
    membership:
      seed.profile?.membership ??
      seed.membership ??
      cached.profile?.membership ??
      cached.membership ??
      membership,
    stats:
      seed.profile?.stats ??
      seed.stats ??
      cached.profile?.stats ??
      cached.stats ??
      legacyProfile.stats ??
      null,
    survey:
      seed.profile?.survey ??
      seed.survey ??
      cached.profile?.survey ??
      cached.survey ??
      legacyProfile.survey ??
      null,
    updatedAt:
      seed.profile?.updatedAt ??
      seed.updatedAt ??
      cached.profile?.updatedAt ??
      legacyProfile.updatedAt ??
      new Date().toISOString(),
  };

  const totalXPValue = Number.isFinite(Number(seed.totalXP))
    ? Number(seed.totalXP)
    : Number.isFinite(Number(cached.totalXP))
      ? Number(cached.totalXP)
      : totalXP;
  const levelInfo = getLevelInfo(totalXPValue);
  const rank = rankFromAverage(averageStat(profile.stats));
  const todayIso = getISODate();
  const quests = sanitizeObject(seed.quests ?? cached.quests ?? questState, {});
  const completed = sanitizeObject(quests.completed, {});
  const tasksDone = Object.values(completed).filter(Boolean).length;
  const heroStatus = {
    date: todayIso,
    tasksDone,
    moodKey: heroMoodKeyFromTaskCount(tasksDone),
  };

  return {
    profile,
    displayName: profile.displayName,
    stats: profile.stats,
    survey: profile.survey,
    membership: profile.membership,
    totalXP: totalXPValue,
    level: levelInfo.level,
    xpIntoLevel: levelInfo.remaining,
    xpToNextLevel: levelInfo.req,
    levelProgress: levelInfo.progress,
    rank,
    heroStatus,
    quests,
    weeklyQuestData: normalizeWeeklyData(
      seed.weeklyQuestData ?? cached.weeklyQuestData ?? weeklyQuestData,
    ),
    weeklyGraphResetDate:
      seed.weeklyGraphResetDate ??
      cached.weeklyGraphResetDate ??
      weeklyGraphResetDate,
    dailyTaskHistory: sanitizeObject(
      seed.dailyTaskHistory ?? cached.dailyTaskHistory ?? taskHistory,
      {},
    ),
    completedQuests: Array.isArray(seed.completedQuests)
      ? seed.completedQuests
      : Array.isArray(cached.completedQuests)
        ? cached.completedQuests
        : Array.isArray(completedQuests)
          ? completedQuests
          : [],
    dailyQuestResetDate:
      seed.dailyQuestResetDate ??
      cached.dailyQuestResetDate ??
      dailyQuestResetDate,
    journal: normalizeJournal(seed.journal ?? cached.journal ?? journalStore),
    dashboardReflection:
      seed.dashboardReflection ??
      cached.dashboardReflection ??
      dashboardReflection ??
      null,
    dashboard: sanitizeObject(
      seed.dashboard ?? cached.dashboard ?? dashboard,
      {},
    ),
    baseline: sanitizeObject(seed.baseline ?? cached.baseline, {}),
  };
}

function syncCompatibilityCache(uid, state) {
  if (!uid || !state) return state;

  writeLocalJSON(getUserDocCacheKey(uid), state);

  const profile = {
    ...sanitizeObject(state.profile, {}),
    displayName: state.displayName ?? state.profile?.displayName ?? null,
    stats: state.stats ?? state.profile?.stats ?? null,
    survey: state.survey ?? state.profile?.survey ?? null,
    membership: state.membership ?? state.profile?.membership ?? null,
    updatedAt: state.profile?.updatedAt ?? new Date().toISOString(),
  };

  writeLocalJSON(getStorageKey(PROFILE_KEY_BASE, uid), profile);
  writeScopedString(
    XP_STORAGE_KEY,
    uid,
    Math.max(0, Number(state.totalXP) || 0),
  );
  writeLocalJSON(
    getStorageKey(QUEST_STORAGE_KEY, uid),
    sanitizeObject(state.quests, {}),
  );
  writeLocalJSON(
    getStorageKey(TASK_HISTORY_KEY, uid),
    sanitizeObject(state.dailyTaskHistory, {}),
  );
  writeLocalJSON(
    getStorageKey(JOURNAL_KEY_BASE, uid),
    normalizeJournal(state.journal),
  );
  writeLocalJSON("aurakJournal", normalizeJournal(state.journal));
  if (state.dashboardReflection) {
    writeLocalJSON(
      getStorageKey(DASH_REFLECTION_KEY_BASE, uid),
      state.dashboardReflection,
    );
  }
  writeLocalJSON(
    getStorageKey("weeklyQuestData", uid),
    normalizeWeeklyData(state.weeklyQuestData),
  );
  writeLocalJSON(
    getStorageKey("completedQuests", uid),
    state.completedQuests || [],
  );
  writeScopedString(
    "weeklyGraphResetDate",
    uid,
    state.weeklyGraphResetDate || "",
  );
  writeScopedString(
    "dailyQuestResetDate",
    uid,
    state.dailyQuestResetDate || "",
  );

  if (state.membership) {
    writeLocalJSON(getStorageKey("aurak_membership", uid), state.membership);
  }

  if (state.dashboard && Object.keys(state.dashboard).length > 0) {
    writeLocalJSON(getStorageKey("aurakDashboard", uid), state.dashboard);
    writeLocalJSON("aurakDashboard", state.dashboard);
  }

  const currentUser = getCurrentUser();
  if (currentUser?.uid === uid) {
    const nextUser = {
      ...currentUser,
      displayName:
        state.displayName ||
        profile.displayName ||
        currentUser.displayName ||
        currentUser.name ||
        "User",
      ...(state.stats ? { stats: state.stats } : {}),
      ...(state.survey ? { survey: state.survey } : {}),
      ...(state.dashboard ? { dashboard: state.dashboard } : {}),
    };
    writeCurrentUser(nextUser);
  }

  return state;
}

export async function readUserDoc(uid) {
  if (!uid) return null;
  await waitForAuthReady();
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function mergeUserDoc(uid, payload) {
  if (!uid) return null;
  await waitForAuthReady();
  if (!auth.currentUser) {
    throw new Error(
      "Cannot write Firestore user document without an authenticated session.",
    );
  }
  if (auth.currentUser.uid !== uid) {
    throw new Error(
      `Authenticated Firebase user (${auth.currentUser.uid}) does not match target user document (${uid}).`,
    );
  }

  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return payload;
}

export async function patchUserDoc(uid, payload) {
  if (!uid) return null;
  await waitForAuthReady();
  if (!auth.currentUser) {
    throw new Error(
      "Cannot patch Firestore user document without an authenticated session.",
    );
  }
  if (auth.currentUser.uid !== uid) {
    throw new Error(
      `Authenticated Firebase user (${auth.currentUser.uid}) does not match target user document (${uid}).`,
    );
  }

  const ref = doc(db, "users", uid);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
  return payload;
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCurrentUser(user) {
  try {
    localStorage.setItem("aurakCurrentUser", JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
}

export function getStorageKey(baseKey, uid = null) {
  const userId = uid || getCurrentUser()?.uid;
  if (!userId) return baseKey;
  return `${baseKey}_${userId}`;
}

export function getUserDocCacheKey(uid) {
  return getStorageKey(USER_DOC_CACHE_BASE, uid);
}

export function readCachedUserDoc(uid) {
  if (!uid) return null;
  return readLocalJSON(getUserDocCacheKey(uid), null);
}

export function writeCachedUserDoc(uid, payload) {
  if (!uid || !payload || typeof payload !== "object") return null;
  const state = buildLocalState(uid, payload);
  return syncCompatibilityCache(uid, state);
}

export function readCachedUserProfile(uid) {
  const cached = readCachedUserDoc(uid);
  if (cached?.profile) return cached.profile;
  return readLegacyProfile(uid);
}

export function readCachedAccountState(uid) {
  if (!uid) return null;
  const cached = readCachedUserDoc(uid);
  return buildLocalState(uid, cached || {});
}

export async function syncUserState(uid) {
  if (!uid) return null;

  const localState = readCachedAccountState(uid);
  const cloud = await readUserDoc(uid);

  if (!cloud) {
    if (!localState) return null;
    await mergeUserDoc(uid, localState);
    return writeCachedUserDoc(uid, localState);
  }

  return writeCachedUserDoc(uid, cloud);
}

export async function mergeUserState(uid, payload) {
  if (!uid || !payload || typeof payload !== "object") return null;

  const nextState = writeCachedUserDoc(uid, {
    ...(readCachedAccountState(uid) || {}),
    ...payload,
  });

  await mergeUserDoc(uid, nextState);
  return nextState;
}

export function subscribeToUserState(uid, onData, onError) {
  if (!uid || typeof onData !== "function") return () => {};

  const ref = doc(db, "users", uid);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const state = writeCachedUserDoc(uid, snapshot.data());
      onData(state);
    },
    onError,
  );
}

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
    "dailyTaskHistory",
    "dailyQuestResetDate",
    "aurak_journal_v1",
    "aurak_dashboard_reflection_v1",
    "aurak_user_profile",
    "aurak_membership",
    "aurakDashboard",
    USER_DOC_CACHE_BASE,
  ];

  accountKeys.forEach((key) => {
    localStorage.removeItem(getStorageKey(key, uid));
  });

  localStorage.removeItem("aurakDashboard");
  localStorage.removeItem("aurakJournal");
}

export function logout() {
  const user = getCurrentUser();
  if (user?.uid) {
    clearAccountData(user.uid);
  }
  localStorage.removeItem("aurakCurrentUser");
  window.location.href = "login.html";
}
