import {
  applyQuestPointChange,
  getCurrentUser,
  getStorageKey,
  mergeUserState,
  normalizeStats,
  readCachedAccountState,
  readCachedUserProfile,
  STAT_KEYS,
  subscribeToUserState,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const TASK_HISTORY_KEY = "dailyTaskHistory";
const JOURNAL_KEY_BASE = "aurak_journal_v1";
const DASH_REFLECTION_KEY_BASE = "aurak_dashboard_reflection_v1";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

function getAccountStorageKey(baseKey) {
  return getStorageKey(baseKey);
}

function readUserProfile(uid) {
  return uid ? readCachedUserProfile(uid) : null;
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

function ensureToastEl() {
  let el = document.getElementById("aurak-toast");
  if (el) return el;

  el = document.createElement("div");
  el.id = "aurak-toast";
  el.setAttribute("aria-live", "polite");
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "22px",
    transform: "translateX(-50%) translateY(8px)",
    padding: "12px 16px",
    borderRadius: "14px",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    background: "rgba(2, 6, 23, 0.9)",
    color: "#f8fafc",
    fontWeight: "800",
    boxShadow: "0 18px 36px rgba(0, 0, 0, 0.3)",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 160ms ease, transform 160ms ease",
    zIndex: "220",
  });
  document.body.appendChild(el);
  return el;
}

function toast(message) {
  const el = ensureToastEl();
  el.textContent = message;
  clearTimeout(el._hideTimer);
  el.style.opacity = "1";
  el.style.transform = "translateX(-50%) translateY(0)";

  el._hideTimer = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(8px)";
  }, 1400);
}

function buildUndoReverseText(pointUpdate) {
  const reversed = Number(pointUpdate?.autoReversedLevels) || 0;
  const unresolved = Number(pointUpdate?.unresolvedShortfall) || 0;
  if (reversed <= 0 && unresolved <= 0) return "";

  let message = "";
  if (reversed > 0) {
    message += `, auto-reversed ${reversed} upgrade level${reversed === 1 ? "" : "s"}`;
  }
  if (unresolved > 0) {
    message += `${message ? "," : ","} older upgrade history could not be fully traced`;
  }
  return message;
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
    .map((k) => Number(stats[k]))
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function readTaskHistoryMap() {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(TASK_HISTORY_KEY));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTaskHistoryMap(map, syncCloud = true) {
  try {
    localStorage.setItem(
      getAccountStorageKey(TASK_HISTORY_KEY),
      JSON.stringify(map),
    );
  } catch {}

  const user = getCurrentUser();
  if (syncCloud && user?.uid) {
    void mergeUserState(user.uid, { dailyTaskHistory: map }).catch((error) => {
      console.warn("Task history sync failed:", error);
    });
  }
}

function updateTaskHistoryForToday(qid, qname, isDone, syncCloud = true) {
  const today =
    localStorage.getItem(getAccountStorageKey("dailyQuestResetDate")) ||
    getISODate();
  const map = readTaskHistoryMap();
  const day = map[today] && typeof map[today] === "object" ? map[today] : {};

  if (isDone) day[qid] = qname || qid;
  else delete day[qid];

  if (Object.keys(day).length > 0) map[today] = day;
  else delete map[today];

  writeTaskHistoryMap(map, syncCloud);
}

function prettifyQuestId(qid) {
  const raw = String(qid || "").trim();
  if (!raw) return "Completed task";
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function snapshotCompletedTasksForDate(dateStr, state) {
  if (!dateStr || !state || typeof state !== "object") return;

  const completed =
    state.completed && typeof state.completed === "object"
      ? state.completed
      : {};
  const completedIds = Object.keys(completed).filter((qid) => !!completed[qid]);
  if (!completedIds.length) return;

  const rows = Array.from(document.querySelectorAll(".quest-row"));
  const nameById = new Map();

  rows.forEach((row) => {
    const qid = row.getAttribute("data-qid");
    if (!qid) return;
    const qname = row.querySelector("h4")?.textContent?.trim();
    if (qname) nameById.set(qid, qname);
  });

  const map = readTaskHistoryMap();
  const existing =
    map[dateStr] && typeof map[dateStr] === "object" ? map[dateStr] : {};
  const day = {};

  completedIds.forEach((qid) => {
    day[qid] = existing[qid] || nameById.get(qid) || prettifyQuestId(qid);
  });

  if (Object.keys(day).length > 0) map[dateStr] = day;
  else delete map[dateStr];
  writeTaskHistoryMap(map);
}

function rankFromAverage(avg) {
  if (!Number.isFinite(avg)) return "—";
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

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const HERO_FULL_RANK_SET = ["E", "D", "C", "B", "A", "S"];

const HERO_RANK_ART_SUPPORT = {
  executioner: HERO_FULL_RANK_SET,
  insightphantom: HERO_FULL_RANK_SET,
  reaper: HERO_FULL_RANK_SET,
  saint: HERO_FULL_RANK_SET,
  vanguard: HERO_FULL_RANK_SET,
};

const HERO_LOCKED_IN_BACKDROP_SUPPORT = {};

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

function resolveHeroMoodKey(...candidates) {
  for (const candidate of candidates) {
    const moodKey = normalizeHeroMoodKey(candidate);
    if (moodKey) return moodKey;
  }
  return "";
}

function heroMoodKeyFromTaskCount(taskCount) {
  const count = Math.max(0, Number(taskCount) || 0);
  if (count <= 2) return "exhausted";
  if (count <= 5) return "warming-up";
  if (count <= 10) return "focused";
  return "locked-in";
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

function hunterFigureSrcCandidatesFromProfileRankAndMoodKey(profile, rank, moodKey) {
  const safeRank = normalizeRank(rank);
  const characterKey = heroCharacterKeyFromProfile(profile);
  if (!characterKey || !hasHeroRankArt(characterKey, safeRank)) return [];
  const moodFile = heroMoodFileKey(moodKey);
  return heroCharacterAssetFileKeys(characterKey, safeRank, moodKey).map(
    (assetKey) => `./${safeRank}_${assetKey}_${moodFile}.png`,
  );
}

function hunterFigureSrcFromProfileRankAndMoodKey(profile, rank, moodKey) {
  if (!heroCharacterKeyFromProfile(profile)) return "";
  const candidates = hunterFigureSrcCandidatesFromProfileRankAndMoodKey(
    profile,
    rank,
    moodKey,
  );
  return candidates[0] || "";
}

function isLockedInMoodKey(moodKey) {
  return heroMoodFileKey(moodKey) === "lockedin";
}

function hunterLockedInBackdropSrcFromProfileRankAndMoodKey(profile, rank, moodKey) {
  const safeRank = normalizeRank(rank);
  const characterKey = heroCharacterKeyFromProfile(profile);
  if (!characterKey) return "";
  const supportedBackdropRanks =
    HERO_LOCKED_IN_BACKDROP_SUPPORT[safeString(characterKey).toLowerCase()] || [];
  if (
    !hasHeroRankArt(characterKey, safeRank) ||
    !isLockedInMoodKey(moodKey) ||
    !supportedBackdropRanks.includes(safeRank)
  ) {
    return "";
  }
  const assetKeys = heroCharacterAssetFileKeys(characterKey, safeRank, moodKey);
  return assetKeys[0] ? `./${safeRank}_${assetKeys[0]}_background.png` : "";
}

function setImageWithFallback(imgEl, candidates) {
  if (!imgEl) return;
  const list = Array.isArray(candidates)
    ? candidates.map((s) => safeString(s)).filter(Boolean)
    : [];
  if (!list.length) {
    imgEl.onerror = null;
    imgEl.removeAttribute("src");
    imgEl.style.visibility = "hidden";
    return;
  }

  imgEl.style.visibility = "";

  let index = 0;
  imgEl.onerror = () => {
    index += 1;
    if (index >= list.length) {
      imgEl.onerror = null;
      imgEl.removeAttribute("src");
      imgEl.style.visibility = "hidden";
      return;
    }
    imgEl.src = list[index];
  };

  imgEl.src = list[0];
}

function getTodayCompletedTaskCount() {
  const user = getCurrentUser();
  if (user?.uid) {
    const state = readCachedAccountState(user.uid);
    const completed =
      state?.quests?.completed && typeof state.quests.completed === "object"
        ? state.quests.completed
        : null;
    if (completed) {
      return Object.values(completed).filter(Boolean).length;
    }
  }

  let questCount = 0;
  try {
    const state =
      JSON.parse(
        localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY)),
      ) || {};
    const completed =
      state.completed && typeof state.completed === "object"
        ? state.completed
        : {};
    questCount = Object.values(completed).filter(Boolean).length;
  } catch {}

  return questCount;
}

function getHunterMoodDataFromKey(moodKey, level) {
  const resolvedMoodKey = resolveHeroMoodKey(moodKey) || "exhausted";

  if (resolvedMoodKey === "exhausted") {
    return {
      key: "exhausted",
      label: "Exhausted",
      pill: "LOW POWER",
      mode: level >= 10 ? "Recovery Arc" : "Survival",
      hint: "Low output detected",
      subline: "0-2 tasks completed today. The hunter is fading.",
      desc: "Your hunter mirrors the day’s output. Clear one task to wake the system and restore momentum.",
    };
  }

  if (resolvedMoodKey === "warming-up") {
    return {
      key: "warming-up",
      label: "Warming Up",
      pill: "BOOTING UP",
      mode: level >= 10 ? "Momentum Build" : "Starter Flow",
      hint: "Engine is starting to wake up",
      subline: "Early progress is building momentum.",
      desc: "The system is online and moving. A few more completions will push the hunter into a stronger state.",
    };
  }

  if (resolvedMoodKey === "focused") {
    return {
      key: "focused",
      label: "Focused",
      pill: "ON TRACK",
      mode: level >= 15 ? "Precision Mode" : "Flow State",
      hint: "Stable output and clean execution",
      subline: "Strong consistency across today’s quests.",
      desc: "The hunter is stable and engaged. Your current pace shows clean progress and strong control for the day.",
    };
  }

  return {
    key: "locked-in",
    label: "Locked In",
    pill: "MAX FOCUS",
    mode: level >= 20 ? "Ascendant Mode" : "Beast Mode",
    hint: "Peak output detected today",
    subline: "High task completion with dominant pace.",
    desc: "The hunter is operating at peak condition today. Maintain the pressure while your momentum is still high.",
  };
}

function getHunterMoodData(taskCount, level) {
  return getHunterMoodDataFromKey(heroMoodKeyFromTaskCount(taskCount), level);
}

function renderHunterStatus(level, totalXP, xpProgress) {
  const tile = document.getElementById("hunterTile");
  const moodEl = document.getElementById("hunterMood");
  const pillEl = document.getElementById("hunterMoodPill");
  const tasksEl = document.getElementById("hunterTasksDone");
  const modeEl = document.getElementById("hunterMode");
  const hintEl = document.getElementById("hunterLevelHint");
  const sublineEl = document.getElementById("hunterSubline");
  const descEl = document.getElementById("hunterDesc");
  const xpValueEl = document.getElementById("hunterXpValue");
  const xpMiniTextEl = document.getElementById("hunterXpMiniText");
  const xpMiniFillEl = document.getElementById("hunterXpMiniFill");
  const figureBackdropEl = document.getElementById("hunterFigureBackdrop");
  const figureEl = document.getElementById("hunterFigure");

  if (
    !tile ||
    !moodEl ||
    !pillEl ||
    !tasksEl ||
    !modeEl ||
    !hintEl ||
    !sublineEl ||
    !descEl ||
    !xpValueEl ||
    !xpMiniTextEl ||
    !xpMiniFillEl ||
    !figureBackdropEl ||
    !figureEl
  ) {
    return;
  }

  const localTaskCount = getTodayCompletedTaskCount();
  const user = getCurrentUser();
  const cached = user?.uid ? readCachedAccountState(user.uid) : null;
  const storedHeroStatus =
    cached?.heroStatus && typeof cached.heroStatus === "object"
      ? cached.heroStatus
      : null;
  const profile =
    (cached?.profile && typeof cached.profile === "object" ? cached.profile : null) ||
    readUserProfile(user?.uid);
  const taskCount = Math.max(0, localTaskCount);
  const moodKey = heroMoodKeyFromTaskCount(taskCount);
  const mood = getHunterMoodDataFromKey(moodKey, level);
  const rawRank = String(cached?.rank || storedHeroStatus?.rank || "")
    .trim()
    .toUpperCase();
  const rank = hasKnownRank(rawRank) ? rawRank : "";
  const characterKey = heroCharacterKeyFromProfile(profile);
  const hasTitle =
    !!safeString(profile?.title) || !!safeString(profile?.titleSurvey?.title);
  const hasRankCharacterArt =
    hasTitle && !!characterKey && hasHeroRankArt(characterKey, rank);

  const savedFigureSrc =
    hasRankCharacterArt &&
    typeof storedHeroStatus?.figureSrc === "string" &&
    safeString(storedHeroStatus.figureSrc) !== "./Unknown.png"
      ? storedHeroStatus.figureSrc
      : "";
  const computedFigureCandidates = hasRankCharacterArt
    ? hunterFigureSrcCandidatesFromProfileRankAndMoodKey(profile, rank, moodKey)
    : [];
  const computedBackdropSrc = hasRankCharacterArt
    ? hunterLockedInBackdropSrcFromProfileRankAndMoodKey(profile, rank, moodKey)
    : "";
  const candidates = hasRankCharacterArt
    ? [...computedFigureCandidates, savedFigureSrc].filter(Boolean)
    : [];
  const backdropCandidates = computedBackdropSrc ? [computedBackdropSrc] : [];

  tile.dataset.mood = mood.key;
  tile.dataset.character = characterKey || "unknown";
  tile.dataset.rank = rank || "";
  moodEl.textContent = mood.label;
  pillEl.textContent = mood.pill;
  tasksEl.textContent = String(taskCount);
  modeEl.textContent = mood.mode;
  hintEl.textContent = mood.hint;
  sublineEl.textContent = mood.subline;
  descEl.textContent = hasTitle
    ? rank && !hasRankCharacterArt
      ? `${mood.desc} Character art for rank ${rank} is not available yet.`
      : mood.desc
    : "Select your title in the Profile page to unlock your character.";
  xpValueEl.textContent = String(totalXP);
  xpMiniTextEl.textContent = `${totalXP} XP`;
  xpMiniFillEl.style.width = `${Math.min(Math.max(xpProgress * 100, 0), 100)}%`;
  setImageWithFallback(figureBackdropEl, backdropCandidates);
  setImageWithFallback(figureEl, candidates);
}

function renderStatsPanel(accountState = null) {
  const user = getCurrentUser();
  const cached = accountState || (user?.uid ? readCachedAccountState(user.uid) : null);
  const profile = readUserProfile(user?.uid);
  const stats = normalizeStats(cached?.stats || user?.stats || profile?.stats);
  const pillarRows = document.querySelectorAll(".pillar-row");

  STAT_KEYS.forEach((key, index) => {
    const row = pillarRows[index];
    if (!row) return;

    const nameEl = row.querySelector(".pillar-name");
    const valEl = row.querySelector(".pillar-val");
    const barFill = row.querySelector(".bar-fill");
    const value = Math.max(0, Math.min(100, Number(stats[key]) || 0));

    if (nameEl) nameEl.textContent = key;
    if (valEl) valEl.textContent = `${value} / 100`;
    if (barFill) barFill.style.width = `${value}%`;
  });

  const radar = document.getElementById("dashRadar");
  if (!radar) return;

  const outerPoints = [
    { x: 100, y: 18 },
    { x: 176, y: 72 },
    { x: 148, y: 162 },
    { x: 52, y: 162 },
    { x: 24, y: 72 },
  ];

  const points = STAT_KEYS.map((key, index) => {
    const pct = Math.max(0, Math.min(1, (Number(stats[key]) || 0) / 100));
    const outer = outerPoints[index];
    const x = 100 + pct * (outer.x - 100);
    const y = 100 + pct * (outer.y - 100);
    return `${x},${y}`;
  }).join(" ");

  radar.setAttribute("points", points);
}

document.addEventListener("DOMContentLoaded", async () => {
  let user = getCurrentUser();
  if (!user) return;

  try {
    await syncUserState(user.uid);
    user = getCurrentUser() || user;
  } catch (error) {
    console.warn("Dashboard cloud sync failed:", error);
  }

  if (!user.stats) {
    const profile = readUserProfile(user.uid);
    if (profile?.stats) {
      user.stats = profile.stats;
      writeCurrentUser(user);
    }
  }

  ensureDailyQuestReset();

  const displayName = user.displayName || user.name || user.username || "User";

  const dashName = document.getElementById("dashName");
  const sideUser = document.getElementById("sideUser");
  const sideSub = document.getElementById("sideSub");

  if (dashName) dashName.textContent = displayName;
  if (sideUser) sideUser.textContent = displayName;
  if (sideSub) sideSub.textContent = "Rank —";

  let completedQuests = JSON.parse(
    localStorage.getItem(getAccountStorageKey("completedQuests")),
  ) || [false, false, false];

  const legacyQuestRows = document.querySelectorAll(".quest-row:not(.qcard)");
  legacyQuestRows.forEach((row, i) => {
    row.setAttribute("data-qid", `legacy-${i}`);
    row.dataset.slot = "physical";
    if (completedQuests[i]) {
      row.classList.add("is-complete");
      const check = row.querySelector(".quest-check");
      if (check) {
        check.setAttribute("aria-pressed", "true");
        check.setAttribute("aria-label", "Mark quest as incomplete");
      }
    }
  });

  renderStatsPanel();

  updateGraph();
  updateXP();
  await loadAndRenderPreviewTasks();
  renderDailyCheckin();

  if (user.uid) {
    subscribeToUserState(
      user.uid,
      async (state) => {
        renderStatsPanel(state);
        updateXP();
        updateGraph();
        await loadAndRenderPreviewTasks();
        renderDailyCheckin();
      },
      (error) => {
        console.warn("Dashboard realtime sync failed:", error);
      },
    );
  }

  window.addEventListener("storage", (e) => {
    if (
      e.key === getAccountStorageKey(QUEST_STORAGE_KEY) ||
      e.key === getAccountStorageKey(XP_STORAGE_KEY) ||
      e.key === getAccountStorageKey(TASK_HISTORY_KEY)
    ) {
      renderStatsPanel();
      updateXP();
      updateGraph();
      void loadAndRenderPreviewTasks();
    }
  });
});

async function loadAndRenderPreviewTasks() {
  ensureDailyQuestReset();
  if (
    typeof HabiticaAPI === "undefined" ||
    typeof HABITICA_CONFIG === "undefined"
  ) {
    return;
  }

  const api = new HabiticaAPI(HABITICA_CONFIG);
  const previewContainer = document.querySelector(".quests-preview");
  if (!previewContainer) return;

  try {
    const challenges = await api.fetchAllChallenges(HABITICA_CONFIG.challenges);
    if (challenges.length === 0) return;

    const firstThree = challenges.slice(0, 3);
    previewContainer.innerHTML = "";

    let state = {};
    try {
      const stored = localStorage.getItem(
        getAccountStorageKey(QUEST_STORAGE_KEY),
      );
      state = stored ? JSON.parse(stored) : {};
    } catch {}
    state.completed = state.completed || {};

    firstThree.forEach((challenge) => {
      const isDone = !!state.completed[challenge.id];
      const questName = challenge.name || challenge.shortName || "Unnamed";
      const xpReward =
        HABITICA_CONFIG.defaultXpPerCategory[challenge.category] ||
        HABITICA_CONFIG.defaultXpPerCategory.mental;

      const row = document.createElement("div");
      row.className = "quest-row";
      row.setAttribute("data-qid", challenge.id);
      row.setAttribute("data-xp", xpReward);
      row.dataset.slot = challenge.category || "physical";
      if (isDone) row.classList.add("is-complete");

      row.innerHTML = `
        <span
          class="quest-check"
          role="button"
          tabindex="0"
          aria-label="Mark quest as complete"
          aria-pressed="${isDone ? "true" : "false"}"
        ></span>
        <div class="quest-text">
          <h4>${api.escapeHtml(questName)}</h4>
        </div>
        <span class="quest-icon" aria-hidden="true">
          <i class="fa-solid fa-check"></i>
        </span>
      `;

      const check = row.querySelector(".quest-check");
      if (check) {
        check.onclick = function () {
          completePreviewQuest(this);
        };
        check.onkeydown = function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            completePreviewQuest(this);
          }
        };
      }

      previewContainer.appendChild(row);
    });

    updateXP();
  } catch (error) {
    console.error("Error loading preview tasks:", error);
  }
}

async function completePreviewQuest(checkEl) {
  ensureDailyQuestReset();
  const row = checkEl.closest(".quest-row");
  if (!row) return;

  const qid = row.getAttribute("data-qid");
  if (!qid) return;

  const wasComplete = row.classList.contains("is-complete");
  const nowComplete = !wasComplete;
  const user = getCurrentUser();
  const accountState = user?.uid ? readCachedAccountState(user.uid) : null;
  const pointUpdate = applyQuestPointChange(
    accountState?.stats,
    accountState?.statPoints,
    accountState?.statUpgrades,
    row.dataset.slot || "physical",
    nowComplete ? 1 : -1,
  );

  row.classList.toggle("is-complete", nowComplete);

  if (checkEl) {
    checkEl.setAttribute("aria-pressed", nowComplete ? "true" : "false");
    checkEl.setAttribute(
      "aria-label",
      nowComplete ? "Mark quest as incomplete" : "Mark quest as complete",
    );
  }

  let state = {};
  try {
    state =
      JSON.parse(
        localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY)),
      ) || {};
    state.completed = state.completed || {};
    state.completed[qid] = nowComplete;
    localStorage.setItem(
      getAccountStorageKey(QUEST_STORAGE_KEY),
      JSON.stringify(state),
    );
  } catch {}

  const qname = row.querySelector("h4")?.textContent?.trim() || qid;
  updateTaskHistoryForToday(qid, qname, nowComplete, false);

  let xpDelta = Number(row.getAttribute("data-xp"));
  if (!Number.isFinite(xpDelta)) {
    const expEl = row.querySelector(".reward.exp");
    const txt = expEl?.textContent || "";
    const m = txt.match(/\+(\d+)/);
    xpDelta = m ? Number(m[1]) : 0;
  }
  if (!Number.isFinite(xpDelta)) xpDelta = 0;

  let totalXP = 0;
  try {
    const stored = localStorage.getItem(getAccountStorageKey(XP_STORAGE_KEY));
    totalXP = Math.max(0, Number(stored) || 0);
  } catch {}
  totalXP = Math.max(0, totalXP + (nowComplete ? xpDelta : -xpDelta));

  localStorage.setItem(getAccountStorageKey(XP_STORAGE_KEY), `${totalXP}`);

  if (user?.uid) {
    await mergeUserState(user.uid, {
      quests: state,
      stats: pointUpdate.stats,
      totalXP,
      dailyTaskHistory: readTaskHistoryMap(),
      statPoints: pointUpdate.statPoints,
      statUpgrades: pointUpdate.statUpgrades,
    }).catch((error) => {
      console.warn("Preview quest sync failed:", error);
    });
  }

  toast(
    nowComplete
      ? `Quest completed +${xpDelta} XP, +1 ${pointUpdate.statKey} point`
      : `Quest undone -${xpDelta} XP, -1 ${pointUpdate.statKey} point${buildUndoReverseText(pointUpdate)}`,
  );
  updateGraph();
  updateXP();
}

function updateXP() {
  const user = getCurrentUser();
  const cached = user?.uid ? readCachedAccountState(user.uid) : null;
  const profile =
    (cached?.profile && typeof cached.profile === "object" ? cached.profile : null) ||
    readUserProfile(user?.uid);
  let totalXP = Number.isFinite(Number(cached?.totalXP))
    ? Math.max(0, Number(cached.totalXP) || 0)
    : 0;

  if (!Number.isFinite(totalXP)) totalXP = 0;
  if (!cached || !Number.isFinite(Number(cached?.totalXP))) {
    try {
      const stored = localStorage.getItem(getAccountStorageKey(XP_STORAGE_KEY));
      totalXP = stored ? Math.max(0, Number(stored) || 0) : 0;
    } catch {
      totalXP = 0;
    }
  }

  const info = getLevelInfo(totalXP);
  const stats = cached?.stats || (user && user.stats) || (profile && profile.stats) || null;
  const avg = averageStat(stats);
  const rank =
    typeof cached?.rank === "string" && cached.rank.trim()
      ? cached.rank.trim()
      : rankFromAverage(avg);
  const title =
    typeof profile?.title === "string" && profile.title.trim()
      ? profile.title.trim()
      : typeof profile?.titleSurvey?.title === "string" &&
          profile.titleSurvey.title.trim()
        ? profile.titleSurvey.title.trim()
        : "";

  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");
  const sideSub = document.getElementById("sideSub");
  const hunterTitle = document.getElementById("hunterTitle");

  if (dashLevel) dashLevel.textContent = `LVL ${info.level}`;
  if (dashXpText) dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
  if (dashXpFill)
    dashXpFill.style.width = `${Math.min(info.progress * 100, 100)}%`;
  if (sideSub) sideSub.textContent = title || `Rank ${rank}`;
  if (hunterTitle) hunterTitle.textContent = title || "Unassigned";

  renderHunterStatus(info.level, totalXP, info.progress);
}

function updateGraph() {
  ensureDailyQuestReset();

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const user = getCurrentUser();
  const cached = user?.uid ? readCachedAccountState(user.uid) : null;

  const questDayIso =
    cached?.dailyQuestResetDate ||
    localStorage.getItem(getAccountStorageKey("dailyQuestResetDate")) ||
    getISODate();

  let questDayDate = new Date();
  const parts = String(questDayIso).split("-").map((v) => Number(v));
  if (
    parts.length === 3 &&
    parts.every((v) => Number.isFinite(v)) &&
    parts[1] >= 1 &&
    parts[1] <= 12 &&
    parts[2] >= 1 &&
    parts[2] <= 31
  ) {
    questDayDate = new Date(parts[0], parts[1] - 1, parts[2]);
  }
  questDayDate.setHours(0, 0, 0, 0);

  const dayOfWeek = questDayDate.getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const currentMonday = new Date(questDayDate);
  currentMonday.setDate(questDayDate.getDate() - dayIndex);
  currentMonday.setHours(0, 0, 0, 0);
  const currentMondayStr = getISODate(currentMonday);

  const resetKey = getAccountStorageKey("weeklyGraphResetDate");
  const dataKey = getAccountStorageKey("weeklyQuestData");

  let lastResetDate =
    (typeof cached?.weeklyGraphResetDate === "string"
      ? cached.weeklyGraphResetDate
      : "") ||
    localStorage.getItem(resetKey) ||
    "";

  let weeklyData = Array.isArray(cached?.weeklyQuestData)
    ? cached.weeklyQuestData.slice(0, 7)
    : JSON.parse(localStorage.getItem(dataKey)) || [0, 0, 0, 0, 0, 0, 0];

  if (!Array.isArray(weeklyData)) weeklyData = [0, 0, 0, 0, 0, 0, 0];
  weeklyData = weeklyData.slice(0, 7);
  while (weeklyData.length < 7) weeklyData.push(0);

  const previousResetDate = lastResetDate;
  const previousWeeklyData = weeklyData.slice(0, 7);

  if (!lastResetDate || lastResetDate !== currentMondayStr) {
    lastResetDate = currentMondayStr;
  }

  const history =
    cached?.dailyTaskHistory && typeof cached.dailyTaskHistory === "object"
      ? cached.dailyTaskHistory
      : readTaskHistoryMap();

  let todayCompletedIds = [];
  try {
    const questState =
      cached?.quests && typeof cached.quests === "object"
        ? cached.quests
        : JSON.parse(
            localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY)),
          ) || {};
    const completed =
      questState.completed && typeof questState.completed === "object"
        ? questState.completed
        : {};
    todayCompletedIds = Object.keys(completed).filter((qid) => !!completed[qid]);
  } catch {}

  const todayNames =
    history[questDayIso] && typeof history[questDayIso] === "object"
      ? history[questDayIso]
      : {};
  const todayTasks = todayCompletedIds
    .map((qid) => todayNames[qid] || prettifyQuestId(qid))
    .filter(Boolean);

  const weeklyTasks = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentMonday);
    d.setDate(currentMonday.getDate() + i);
    const iso = getISODate(d);
    if (i === dayIndex) {
      weeklyTasks.push(todayTasks);
    } else {
      weeklyTasks.push(Object.values(history[iso] || {}).filter(Boolean));
    }
  }

  weeklyData = weeklyTasks.map((tasks) => tasks.length);

  try {
    localStorage.setItem(resetKey, lastResetDate);
    localStorage.setItem("weeklyGraphResetDate", lastResetDate);
    localStorage.setItem(dataKey, JSON.stringify(weeklyData));
    localStorage.setItem("weeklyQuestData", JSON.stringify(weeklyData));
  } catch {}

  const graphChanged =
    previousResetDate !== lastResetDate ||
    JSON.stringify(previousWeeklyData) !== JSON.stringify(weeklyData);

  if (graphChanged && user?.uid) {
    void mergeUserState(user.uid, {
      weeklyQuestData: weeklyData,
      weeklyGraphResetDate: lastResetDate,
    }).catch((error) => {
      console.warn("Weekly graph sync failed:", error);
    });
  }

  const maxValue = Math.max(8, ...weeklyData.map((v) => Number(v) || 0));
  const roundedMax = Math.ceil(maxValue / 4) * 4;
  const yMax = Math.max(8, roundedMax);
  const yStep = yMax / 4;

  const mapY = (val) => {
    const safeVal = Math.max(0, Math.min(Number(val) || 0, yMax));
    return 220 - (safeVal / yMax) * 200;
  };

  const svgs = document.querySelectorAll(".line-graph-svg");
  svgs.forEach((svg) => {
    let gridGroup = svg.querySelector(".graph-grid-lines");
    if (!gridGroup) {
      gridGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gridGroup.classList.add("graph-grid-lines");
      svg.insertBefore(gridGroup, svg.firstChild);
    }
    gridGroup.innerHTML = "";

    const gridLines = [
      { y: 220, value: 0 },
      { y: 170, value: yStep },
      { y: 120, value: yStep * 2 },
      { y: 70, value: yStep * 3 },
      { y: 20, value: yMax },
    ];

    gridLines.forEach((item) => {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", "60");
      line.setAttribute("y1", String(item.y));
      line.setAttribute("x2", "660");
      line.setAttribute("y2", String(item.y));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("opacity", item.y === 220 ? "0.18" : "0.08");
      gridGroup.appendChild(line);
    });

    let yLabels = svg.querySelector(".graph-y-labels");
    if (!yLabels) {
      yLabels = document.createElementNS("http://www.w3.org/2000/svg", "g");
      yLabels.classList.add("graph-y-labels");
      svg.appendChild(yLabels);
    }
    yLabels.innerHTML = "";

    gridLines.forEach((item) => {
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", "46");
      text.setAttribute("y", String(item.y + 4));
      text.setAttribute("text-anchor", "end");
      text.setAttribute("font-size", "12");
      text.textContent = String(Math.round(item.value));
      yLabels.appendChild(text);
    });

    let path = svg.querySelector(".data-line");
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("data-line");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--aqua)");
      path.setAttribute("stroke-width", "3");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
    }

    const points = weeklyData.map((val, i) => {
      const x = 60 + i * 100;
      const y = mapY(val);
      return `${x},${y}`;
    });

    const d = points.length > 0 ? "M" + points.join(" L") : "";
    path.setAttribute("d", d);

    let tooltip = document.getElementById("taskGraphTooltip");
    if (!tooltip) {
      const container = svg.closest(".line-graph");
      if (container) {
        tooltip = document.createElement("div");
        tooltip.className = "graph-tooltip";
        tooltip.id = "taskGraphTooltip";
        tooltip.hidden = true;
        container.appendChild(tooltip);
      }
    }

    let group = svg.querySelector(".data-points");
    if (!group) {
      group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("data-points");
      svg.appendChild(group);
    }
    group.innerHTML = "";

    weeklyData.forEach((val, i) => {
      const x = 60 + i * 100;
      const y = mapY(val);

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", String(x));
      circle.setAttribute("cy", String(y));
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", "var(--aqua)");
      circle.setAttribute("opacity", "0.95");
      group.appendChild(circle);
    });

    let hitGroup = svg.querySelector(".data-hitboxes");
    if (!hitGroup) {
      hitGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      hitGroup.classList.add("data-hitboxes");
      svg.appendChild(hitGroup);
    }
    hitGroup.innerHTML = "";

    const showTooltip = (evt, i) => {
      if (!tooltip) return;
      const tasks = weeklyTasks[i] || [];
      const count = Number(weeklyData[i] || 0);
      const lines =
        tasks.length > 0 ? tasks : count > 0 ? [] : ["No tasks completed"];

      tooltip.innerHTML = `
        <div class="gtt-day">${dayLabels[i]} - ${count} done</div>
        ${lines.map((t) => `<div class="gtt-item">${t}</div>`).join("")}
      `;

      tooltip.hidden = false;
      tooltip.style.visibility = "hidden";

      const container = svg.closest(".line-graph");
      const containerRect =
        container?.getBoundingClientRect() || svg.getBoundingClientRect();
      const tooltipW = tooltip.offsetWidth || 220;
      const tooltipH = tooltip.offsetHeight || 120;
      const pad = 8;

      const anchorX = evt.clientX - containerRect.left;
      const anchorY = evt.clientY - containerRect.top;

      let left = anchorX - tooltipW - 14;
      let top = anchorY - tooltipH / 2;

      const maxLeft = Math.max(pad, containerRect.width - tooltipW - pad);
      const maxTop = Math.max(pad, containerRect.height - tooltipH - pad);

      left = Math.min(Math.max(pad, left), maxLeft);
      top = Math.min(Math.max(pad, top), maxTop);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.visibility = "visible";
    };

    const hideTooltip = () => {
      if (tooltip) {
        tooltip.hidden = true;
        tooltip.style.visibility = "";
      }
    };

    for (let i = 0; i < 7; i++) {
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rect.setAttribute("x", String(60 + i * 100 - 45));
      rect.setAttribute("y", "20");
      rect.setAttribute("width", "90");
      rect.setAttribute("height", "200");
      rect.setAttribute("fill", "transparent");
      rect.style.pointerEvents = "all";
      rect.addEventListener("mousemove", (e) => showTooltip(e, i));
      rect.addEventListener("mouseenter", (e) => showTooltip(e, i));
      rect.addEventListener("mouseleave", hideTooltip);
      hitGroup.appendChild(rect);
    }
  });
}

window.completeQuest = async function (checkEl) {
  ensureDailyQuestReset();
  const row = checkEl.closest(".quest-row");
  if (!row) return;

  const wasComplete = row.classList.contains("is-complete");
  const nowComplete = !wasComplete;
  const user = getCurrentUser();
  const accountState = user?.uid ? readCachedAccountState(user.uid) : null;
  const pointUpdate = applyQuestPointChange(
    accountState?.stats,
    accountState?.statPoints,
    accountState?.statUpgrades,
    row.dataset.slot || "physical",
    nowComplete ? 1 : -1,
  );

  row.classList.toggle("is-complete", nowComplete);
  if (nowComplete) {
    checkEl.setAttribute("aria-pressed", "true");
    checkEl.setAttribute("aria-label", "Mark quest as incomplete");
  } else {
    checkEl.setAttribute("aria-pressed", "false");
    checkEl.setAttribute("aria-label", "Mark quest as complete");
  }

  const questRows = document.querySelectorAll(".quest-row");
  const index = Array.from(questRows).indexOf(row);

  let state = {};
  let completedQuests = JSON.parse(
    localStorage.getItem(getAccountStorageKey("completedQuests")),
  ) || [false, false, false];

  if (index !== -1) {
    const qid = row.getAttribute("data-qid");
    if (qid) {
      try {
        state =
          JSON.parse(
            localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY)),
          ) || {};
        state.completed = state.completed || {};
        state.completed[qid] = nowComplete;
        localStorage.setItem(
          getAccountStorageKey(QUEST_STORAGE_KEY),
          JSON.stringify(state),
        );
      } catch {}
      const qname = row.querySelector("h4")?.textContent?.trim() || qid;
      updateTaskHistoryForToday(qid, qname, nowComplete, false);
    }

    completedQuests[index] = nowComplete;
    localStorage.setItem(
      getAccountStorageKey("completedQuests"),
      JSON.stringify(completedQuests),
    );
  }

  let xpDelta = Number(row.getAttribute("data-xp"));
  if (!Number.isFinite(xpDelta)) {
    const expEl = row.querySelector(".reward.exp");
    const txt = expEl?.textContent || "";
    const m = txt.match(/\+(\d+)/);
    xpDelta = m ? Number(m[1]) : 0;
  }
  if (!Number.isFinite(xpDelta)) xpDelta = 0;

  let totalXP = 0;
  try {
    const stored = localStorage.getItem(getAccountStorageKey(XP_STORAGE_KEY));
    totalXP = Math.max(0, Number(stored) || 0);
  } catch {}
  totalXP = Math.max(0, totalXP + (nowComplete ? xpDelta : -xpDelta));

  localStorage.setItem(getAccountStorageKey(XP_STORAGE_KEY), `${totalXP}`);

  if (user?.uid) {
    await mergeUserState(user.uid, {
      quests: state,
      stats: pointUpdate.stats,
      totalXP,
      completedQuests,
      dailyTaskHistory: readTaskHistoryMap(),
      statPoints: pointUpdate.statPoints,
      statUpgrades: pointUpdate.statUpgrades,
    }).catch((error) => {
      console.warn("Quest sync failed:", error);
    });
  }

  toast(
    nowComplete
      ? `Quest completed +${xpDelta} XP, +1 ${pointUpdate.statKey} point`
      : `Quest undone -${xpDelta} XP, -1 ${pointUpdate.statKey} point${buildUndoReverseText(pointUpdate)}`,
  );
  updateGraph();
  updateXP();
};

function getISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureDailyQuestReset() {
  const today = getISODate();
  const resetKey = getAccountStorageKey("dailyQuestResetDate");
  const lastReset = localStorage.getItem(resetKey);
  if (lastReset === today) return false;

  let state = {};
  try {
    const raw = localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY));
    state = raw ? JSON.parse(raw) : {};
    if (lastReset) snapshotCompletedTasksForDate(lastReset, state);
    state.completed = {};
    localStorage.setItem(
      getAccountStorageKey(QUEST_STORAGE_KEY),
      JSON.stringify(state),
    );
  } catch {}

  localStorage.setItem(
    getAccountStorageKey("completedQuests"),
    JSON.stringify([]),
  );
  localStorage.setItem(resetKey, today);

  const user = getCurrentUser();
  if (user?.uid) {
    void mergeUserState(user.uid, {
      quests: state,
      completedQuests: [],
      dailyQuestResetDate: today,
      dailyTaskHistory: readTaskHistoryMap(),
    }).catch((error) => {
      console.warn("Daily quest reset sync failed:", error);
    });
  }

  return true;
}

function getJournalStore() {
  try {
    const key = getAccountStorageKey(JOURNAL_KEY_BASE);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.entries)) {
        const map = {};
        parsed.entries.forEach((e) => {
          if (e?.date) map[e.date] = e;
        });
        return map;
      }
      if (parsed && typeof parsed === "object") return parsed;
    }

    const legacyRaw = localStorage.getItem("aurakJournal");
    return legacyRaw ? JSON.parse(legacyRaw) : {};
  } catch {
    return {};
  }
}

function getDashboardReflectionEntry() {
  try {
    const key = getAccountStorageKey(DASH_REFLECTION_KEY_BASE);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCheckinEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const rawMood = Number(entry.mood);
  const rawBaseline = Number(
    Number.isFinite(Number(entry.baseline)) ? entry.baseline : entry.rest,
  );

  const mood10Source = Number.isFinite(rawMood) ? rawMood : 0;
  const baselineSource = Number.isFinite(rawBaseline) ? rawBaseline : 0;

  const mood10 =
    mood10Source <= 5
      ? Math.max(0, Math.min(10, mood10Source * 2))
      : Math.max(0, Math.min(10, mood10Source));

  const baseline10 = Math.max(0, Math.min(10, baselineSource / 10));

  return {
    mood10,
    baseline10,
    reflection: String(entry.reflection || "").trim(),
  };
}

function pct(v) {
  return Math.max(0, Math.min(100, v));
}

function renderDailyCheckin() {
  const today = getISODate();
  const journal = getJournalStore();
  let entry = journal[today];

  if (!entry) {
    const refl = getDashboardReflectionEntry();
    if (refl?.date === today) entry = refl;
  }

  const normalized = normalizeCheckinEntry(entry);

  const datePill = document.getElementById("dashCheckinDatePill");
  const moodFill = document.getElementById("dashMoodFill");
  const moodVal = document.getElementById("dashMoodVal");
  const baseFill = document.getElementById("dashBaseFill");
  const baseVal = document.getElementById("dashBaseVal");
  const snippet = document.getElementById("dashReflectionSnippet");

  if (!datePill || !moodFill || !moodVal || !baseFill || !baseVal || !snippet) {
    return;
  }

  datePill.textContent = today;

  if (!normalized) {
    moodFill.style.width = "0%";
    baseFill.style.width = "0%";
    moodVal.textContent = "—";
    baseVal.textContent = "—";
    snippet.textContent = "No journal data yet.";
    return;
  }

  const moodPercent = pct((normalized.mood10 / 10) * 100);
  const basePercent = pct((normalized.baseline10 / 10) * 100);

  moodFill.style.width = moodPercent + "%";
  baseFill.style.width = basePercent + "%";

  moodVal.textContent = normalized.mood10.toFixed(1).replace(".0", "") + "/10";
  baseVal.textContent =
    normalized.baseline10.toFixed(1).replace(".0", "") + "/10";

  snippet.textContent =
    normalized.reflection.slice(0, 120) +
    (normalized.reflection.length > 120 ? "…" : "");
}

const dashCheckinRefresh = document.getElementById("dashCheckinRefresh");
if (dashCheckinRefresh) {
  dashCheckinRefresh.addEventListener("click", renderDailyCheckin);
}

document.addEventListener("DOMContentLoaded", renderDailyCheckin);
