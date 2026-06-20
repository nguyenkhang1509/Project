import { auth, db, waitForAuthReady } from "./firebase.js";
import {
  applyQuestPointChange,
  applyQuestPointDelta,
  applyStatUpgrade,
  createEmptyStatPoints,
  createEmptyStatUpgrades,
  getMaxUpgradeLevels,
  getStatKeyFromCategory,
  getUpgradeCost,
  normalizeStatPoints,
  normalizeStatUpgrades,
  normalizeStats,
  spendStatPoints,
  STAT_KEYS,
  sumStatPoints,
} from "./statProgress.js";
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
const HUNTER_CELEBRATION_QUEUE_BASE = "aurak_hunter_celebrations_v1";
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
  if (avg >= 75) return "A";
  if (avg >= 60) return "B";
  if (avg >= 45) return "C";
  if (avg >= 25) return "D";
  return "E";
}

function normalizeRank(rank) {
  const val = String(rank || "")
    .trim()
    .toUpperCase();
  if (val === "S") return "S";
  if (val === "A") return "A";
  if (val === "B") return "B";
  if (val === "C") return "C";
  if (val === "D") return "D";
  if (val === "E") return "E";
  return "E";
}

function hasKnownRank(rank) {
  const val = String(rank || "")
    .trim()
    .toUpperCase();
  return (
    val === "S" ||
    val === "A" ||
    val === "B" ||
    val === "C" ||
    val === "D" ||
    val === "E"
  );
}

function resolveStoredRank(...candidates) {
  for (const candidate of candidates) {
    if (hasKnownRank(candidate)) return normalizeRank(candidate);
  }
  return "";
}

const HERO_FULL_RANK_SET = ["E", "D", "C", "B", "A", "S"];

const HERO_RANK_ART_SUPPORT = {
  executioner: HERO_FULL_RANK_SET,
  insightphantom: HERO_FULL_RANK_SET,
  reaper: HERO_FULL_RANK_SET,
  saint: HERO_FULL_RANK_SET,
  vanguard: HERO_FULL_RANK_SET,
};

function heroMoodKeyFromTaskCount(taskCount) {
  const count = Math.max(0, Number(taskCount) || 0);
  if (count <= 2) return "exhausted";
  if (count <= 5) return "warming-up";
  if (count <= 10) return "focused";
  return "locked-in";
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHunterCelebrationType(value) {
  const type = safeString(value).toLowerCase();
  return type === "locked-in" || type === "rank-up" ? type : "";
}

function normalizeHunterCelebrationEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const type = normalizeHunterCelebrationType(value.type);
  if (!type) return null;

  const createdAt = Number(value.createdAt);
  const taskCount = Number(value.taskCount);

  return {
    id:
      safeString(value.id) ||
      `hunter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    characterKey: safeString(value.characterKey).toLowerCase(),
    displayName: safeString(value.displayName),
    rank: hasKnownRank(value.rank) ? normalizeRank(value.rank) : "",
    previousRank: hasKnownRank(value.previousRank)
      ? normalizeRank(value.previousRank)
      : "",
    nextRank: hasKnownRank(value.nextRank) ? normalizeRank(value.nextRank) : "",
    taskCount: Number.isFinite(taskCount) ? Math.max(0, Math.floor(taskCount)) : 0,
    moodKey: normalizeHeroMoodKey(value.moodKey),
  };
}

function normalizeHunterCelebrationQueue(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeHunterCelebrationEvent(item))
    .filter(Boolean)
    .slice(-12);
}

function normalizeHeroMoodKey(moodKey) {
  const key = String(moodKey || "")
    .trim()
    .toLowerCase();

  if (key === "warming-up" || key === "warmingup" || key === "warmup") {
    return "warming-up";
  }
  if (key === "locked-in" || key === "lockedin") return "locked-in";
  if (key === "focused") return "focused";
  if (key === "exhausted") return "exhausted";
  return "";
}

function resolveStoredHeroMoodKey(...candidates) {
  for (const candidate of candidates) {
    const moodKey = normalizeHeroMoodKey(candidate);
    if (moodKey) return moodKey;
  }
  return "";
}

function heroCharacterKeyFromProfile(profile) {
  const title = safeString(profile?.title).toLowerCase();
  if (title.includes("vanguard")) return "vanguard";
  if (title.includes("phantom")) return "insightphantom";
  if (title.includes("executioner")) return "executioner";
  if (title.includes("emperor")) return "saint";
  if (title.includes("saint")) return "saint";
  if (title.includes("reaper")) return "reaper";

  const bySurveyKey = {
    Physical: "vanguard",
    Intellectual: "insightphantom",
    Confidence: "saint",
    Discipline: "executioner",
    Mental: "reaper",
  };

  const surveyKey = safeString(profile?.titleSurvey?.titleKey);
  if (surveyKey && bySurveyKey[surveyKey]) return bySurveyKey[surveyKey];

  const surveyTitle = safeString(profile?.titleSurvey?.title);
  const legacyKey = safeString(profile?.titleSurvey?.titleKey);
  const combined = `${title} ${surveyTitle} ${legacyKey}`.toLowerCase();

  if (combined.includes("vanguard")) return "vanguard";
  if (combined.includes("phantom")) return "insightphantom";
  if (combined.includes("executioner")) return "executioner";
  if (combined.includes("emperor")) return "saint";
  if (combined.includes("saint")) return "saint";
  if (combined.includes("reaper")) return "reaper";

  return "";
}

function heroMoodFileKey(moodKey) {
  const key = normalizeHeroMoodKey(moodKey);
  if (key === "warming-up") return "warmingup";
  if (key === "locked-in") return "lockedin";
  return key || "exhausted";
}

function hasHeroRankArt(characterKey, rank) {
  if (!hasKnownRank(rank)) return false;
  const key = safeString(characterKey).toLowerCase();
  if (!key) return false;
  const supportedRanks = HERO_RANK_ART_SUPPORT[key] || ["E"];
  return supportedRanks.includes(normalizeRank(rank));
}

function heroCharacterAssetFileKeys(characterKey, rank, moodKey) {
  const key = safeString(characterKey).toLowerCase();
  if (!key) return [];
  if (
    key === "saint" &&
    normalizeRank(rank) === "C" &&
    heroMoodFileKey(moodKey) === "warmingup"
  ) {
    return [key, "sainit"];
  }
  if (
    key === "insightphantom" &&
    normalizeRank(rank) === "D" &&
    heroMoodFileKey(moodKey) === "warmingup"
  ) {
    return [key, "insight_phantom"];
  }
  return [key];
}

function heroFigureSrcCandidatesFromProfileRankAndMoodKey(profile, rank, moodKey) {
  const safeRank = normalizeRank(rank);
  const characterKey = heroCharacterKeyFromProfile(profile);
  if (!characterKey || !hasHeroRankArt(characterKey, safeRank)) return [];
  const moodFile = heroMoodFileKey(moodKey);
  return heroCharacterAssetFileKeys(characterKey, safeRank, moodKey).map(
    (assetKey) => `./${safeRank}_${assetKey}_${moodFile}.png`,
  );
}

function heroFigureSrcFromProfileRankAndMoodKey(profile, rank, moodKey) {
  if (!heroCharacterKeyFromProfile(profile)) return "";
  const candidates = heroFigureSrcCandidatesFromProfileRankAndMoodKey(
    profile,
    rank,
    moodKey,
  );
  return candidates[0] || "";
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
    title:
      seed.profile?.title ??
      seed.title ??
      cached.profile?.title ??
      cached.title ??
      legacyProfile.title ??
      "",
    titleSurvey:
      seed.profile?.titleSurvey ??
      seed.titleSurvey ??
      cached.profile?.titleSurvey ??
      cached.titleSurvey ??
      legacyProfile.titleSurvey ??
      null,
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

  const statPoints = normalizeStatPoints(
    seed.statPoints ?? cached.statPoints ?? legacyProfile.statPoints ?? null,
  );
  const statUpgrades = normalizeStatUpgrades(
    seed.statUpgrades ?? cached.statUpgrades ?? null,
  );

  const totalXPValue = Number.isFinite(Number(seed.totalXP))
    ? Number(seed.totalXP)
    : Number.isFinite(Number(cached.totalXP))
      ? Number(cached.totalXP)
      : totalXP;
  const levelInfo = getLevelInfo(totalXPValue);
  const average = averageStat(profile.stats);
  const derivedRank = rankFromAverage(average);
  const storedHeroStatus = sanitizeObject(seed.heroStatus, {});
  const storedRank = resolveStoredRank(
    seed.rank,
    seed.profile?.rank,
    cached.rank,
    cached.profile?.rank,
  );
  const rank = Number.isFinite(average)
    ? derivedRank
    : resolveStoredRank(storedRank, storedHeroStatus.rank) || derivedRank;
  const todayIso = getISODate();
  const quests = sanitizeObject(seed.quests ?? cached.quests ?? questState, {});
  const completed = sanitizeObject(quests.completed, {});
  const derivedTasksDone = Object.values(completed).filter(Boolean).length;
  const tasksDone = Math.max(0, derivedTasksDone);
  const heroRank = normalizeRank(rank);
  const moodKey = heroMoodKeyFromTaskCount(tasksDone);
  const computedFigureSrc = heroFigureSrcFromProfileRankAndMoodKey(
    profile,
    heroRank,
    moodKey,
  );
  const figureSrc = computedFigureSrc || safeString(storedHeroStatus.figureSrc);
  const heroStatus = {
    ...storedHeroStatus,
    date: todayIso,
    tasksDone,
    moodKey,
    rank: heroRank,
    figureSrc,
  };

  return {
    profile,
    displayName: profile.displayName,
    stats: profile.stats,
    statPoints,
    statUpgrades,
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

export function readHunterCelebrationQueue(uid) {
  if (!uid) return [];
  return normalizeHunterCelebrationQueue(
    readScopedValue(HUNTER_CELEBRATION_QUEUE_BASE, uid, []),
  );
}

export function enqueueHunterCelebration(uid, payload) {
  if (!uid || !payload || typeof payload !== "object") return [];

  const queue = readHunterCelebrationQueue(uid);
  const event = normalizeHunterCelebrationEvent(payload);
  if (!event) return queue;

  const nextQueue = [...queue, event].slice(-12);
  writeLocalJSON(getStorageKey(HUNTER_CELEBRATION_QUEUE_BASE, uid), nextQueue);
  return nextQueue;
}

export function shiftHunterCelebration(uid, eventId = "") {
  if (!uid) return null;

  const queue = readHunterCelebrationQueue(uid);
  if (!queue.length) return null;

  const targetId = safeString(eventId);
  const index = targetId
    ? queue.findIndex((item) => item.id === targetId)
    : 0;
  if (index < 0) return null;

  const nextQueue = queue.slice();
  const [removed] = nextQueue.splice(index, 1);
  writeLocalJSON(getStorageKey(HUNTER_CELEBRATION_QUEUE_BASE, uid), nextQueue);
  return removed || null;
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

  const statBackfill = buildMissingCloudStatPayload(localState, cloud);
  if (statBackfill) {
    const mergedCloudState = mergeMirroredProfileFields(cloud, statBackfill);
    await mergeUserDoc(uid, statBackfill);
    return writeCachedUserDoc(uid, mergedCloudState);
  }

  return writeCachedUserDoc(uid, cloud);
}

function mergeMirroredProfileFields(baseState, payload) {
  const base = baseState && typeof baseState === "object" ? baseState : {};
  const patch = payload && typeof payload === "object" ? payload : {};
  const profilePatch = sanitizeObject(patch.profile, {});
  const heroStatusPatch =
    patch.heroStatus &&
    typeof patch.heroStatus === "object" &&
    !Array.isArray(patch.heroStatus)
      ? patch.heroStatus
      : null;
  const profile = {
    ...sanitizeObject(base.profile, {}),
    ...profilePatch,
  };

  if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
    profile.displayName = patch.displayName;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "membership")) {
    profile.membership = patch.membership;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "stats")) {
    profile.stats = patch.stats;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "survey")) {
    profile.survey = patch.survey;
  }

  const next = {
    ...base,
    ...patch,
    profile,
  };
  if (heroStatusPatch) {
    next.heroStatus = {
      ...sanitizeObject(base.heroStatus, {}),
      ...heroStatusPatch,
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(profilePatch, "displayName") &&
    !Object.prototype.hasOwnProperty.call(patch, "displayName")
  ) {
    next.displayName = profile.displayName;
  }
  if (
    Object.prototype.hasOwnProperty.call(profilePatch, "membership") &&
    !Object.prototype.hasOwnProperty.call(patch, "membership")
  ) {
    next.membership = profile.membership;
  }
  if (
    Object.prototype.hasOwnProperty.call(profilePatch, "stats") &&
    !Object.prototype.hasOwnProperty.call(patch, "stats")
  ) {
    next.stats = profile.stats;
  }
  if (
    Object.prototype.hasOwnProperty.call(profilePatch, "survey") &&
    !Object.prototype.hasOwnProperty.call(patch, "survey")
  ) {
    next.survey = profile.survey;
  }

  return next;
}

function payloadTouchesDerivedRankSource(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(payload, "stats")) return true;

  const profilePatch = payload.profile;
  return (
    profilePatch &&
    typeof profilePatch === "object" &&
    !Array.isArray(profilePatch) &&
    Object.prototype.hasOwnProperty.call(profilePatch, "stats")
  );
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function hasUsableStats(value) {
  return (
    isPlainObject(value) &&
    STAT_KEYS.some((key) => Number.isFinite(Number(value[key])))
  );
}

function resolvePersistedStatsSource(...candidates) {
  for (const candidate of candidates) {
    if (hasUsableStats(candidate)) {
      return normalizeStats(candidate);
    }
  }
  return null;
}

function buildMissingCloudStatPayload(localState, cloudState) {
  const local = sanitizeObject(localState, {});
  const cloud = sanitizeObject(cloudState, {});
  const statsSource = resolvePersistedStatsSource(
    cloud.stats,
    cloud.profile?.stats,
    local.stats,
    local.profile?.stats,
    cloud.baseline?.stats,
    local.baseline?.stats,
  );

  const backfill = {};

  if (!hasUsableStats(cloud.stats) && statsSource) {
    backfill.stats = statsSource;
  }

  if (!hasUsableStats(cloud.profile?.stats) && statsSource) {
    backfill.profile = { stats: statsSource };
  }

  if (
    !isPlainObject(cloud.statPoints) &&
    (statsSource || isPlainObject(local.statPoints))
  ) {
    backfill.statPoints = normalizeStatPoints(local.statPoints ?? null);
  }

  if (
    !Array.isArray(cloud.statUpgrades) &&
    (statsSource || Array.isArray(local.statUpgrades))
  ) {
    backfill.statUpgrades = normalizeStatUpgrades(local.statUpgrades ?? null);
  }

  return Object.keys(backfill).length ? backfill : null;
}

export async function mergeUserState(uid, payload) {
  if (!uid || !payload || typeof payload !== "object") return null;

  const nextPayload = mergeMirroredProfileFields(readCachedAccountState(uid), payload);
  if (
    payloadTouchesDerivedRankSource(payload) &&
    !Object.prototype.hasOwnProperty.call(payload, "rank")
  ) {
    delete nextPayload.rank;
  }

  const nextState = writeCachedUserDoc(uid, nextPayload);
  await mergeUserDoc(uid, {
    ...nextPayload,
    rank: nextState?.rank ?? nextPayload.rank,
    heroStatus: nextState?.heroStatus ?? nextPayload.heroStatus,
  });
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
    HUNTER_CELEBRATION_QUEUE_BASE,
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

export {
  applyQuestPointChange,
  applyQuestPointDelta,
  applyStatUpgrade,
  createEmptyStatPoints,
  createEmptyStatUpgrades,
  getMaxUpgradeLevels,
  getStatKeyFromCategory,
  getUpgradeCost,
  normalizeStatPoints,
  normalizeStatUpgrades,
  normalizeStats,
  spendStatPoints,
  STAT_KEYS,
  sumStatPoints,
};
