import {
  applyStatUpgrade,
  applyQuestPointChange,
  getCurrentUser,
  getUpgradeCost,
  getStorageKey,
  mergeUserState,
  normalizeStatPoints,
  normalizeStatUpgrades,
  normalizeStats,
  readCachedAccountState,
  readCachedUserProfile,
  STAT_KEYS,
  subscribeToUserState,
  sumStatPoints,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";
import {
  pumpHunterCelebrationQueue,
  queueHunterLockedInCelebration,
  queueHunterRankUpCelebration,
} from "./hunterCelebrations.js";

const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const TASK_HISTORY_KEY = "dailyTaskHistory";
const JOURNAL_KEY_BASE = "aurak_journal_v1";
const DASH_REFLECTION_KEY_BASE = "aurak_dashboard_reflection_v1";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;
const HUNTER_LOCKED_IN_OPENINGS = {
  executioner: {
    src: "./executioner_opening.mp4",
    figureFallback: "./S_executioner_lockedin.png",
    label: "Executioner",
  },
  insightphantom: {
    src: "./phantom_opening.mp4",
    figureFallback: "./S_insightphantom_lockedin.png",
    label: "Insight Phantom",
  },
  saint: {
    src: "./saint_opening.mp4",
    figureFallback: "./S_saint_lockedin.png",
    label: "Saint",
  },
  vanguard: {
    src: "./vanguard_opening.mp4",
    figureFallback: "./S_vanguard_lockedin.png",
    label: "Vanguard",
  },
  reaper: {
    src: "./reaper_opening.mp4",
    figureFallback: "./S_reaper_lockedin.png",
    label: "Mind Reaper",
  },
};
const HUNTER_OPENING_DEFAULT_DURATION_SECONDS = 5.04;
const HUNTER_OPENING_PRIME_REMAINING_SECONDS = 0.62;
const HUNTER_OPENING_RETURN_MS = 940;
const HUNTER_OPENING_PENDING_TTL_MS = 15000;
const HUNTER_RANK_ORDER = ["E", "D", "C", "B", "A", "S"];
const HUNTER_RANK_UP_SWAP_DELAY_MS = 260;

let pendingHunterLockedInOpeningAt = 0;
let pendingHunterRankUp = null;
let hunterOpeningToken = 0;
let lastObservedHunterRank = "";
let lastObservedHunterRankUserKey = "";

function getAccountStorageKey(baseKey) {
  return getStorageKey(baseKey);
}

function readUserProfile(uid) {
  return uid ? readCachedUserProfile(uid) : null;
}

function getDashboardCelebrationTarget() {
  return (
    document.querySelector(".hunter-figure-shell") ||
    document.querySelector(".wide-stats") ||
    document.querySelector(".main")
  );
}

function pumpDashboardCelebrations() {
  const user = getCurrentUser();
  if (!user?.uid) return false;

  const activeFigure = document.getElementById("hunterFigure");
  return pumpHunterCelebrationQueue({
    uid: user.uid,
    returnTargetEl: getDashboardCelebrationTarget(),
    returnLabel: "Return to Dashboard",
    activeFigureSrc: activeFigure?.currentSrc || activeFigure?.src || "",
  });
}

function maybeQueueDashboardLockedInCelebration(
  previousTaskCount,
  nowComplete,
  user,
  accountState,
) {
  if (!nowComplete || !user?.uid) return false;

  const profile =
    (accountState?.profile &&
    typeof accountState.profile === "object" &&
    !Array.isArray(accountState.profile)
      ? accountState.profile
      : null) || readUserProfile(user.uid);
  const stats = accountState?.stats || user.stats || profile?.stats || null;
  const rawRank = String(accountState?.rank || "")
    .trim()
    .toUpperCase();
  const rank = hasKnownRank(rawRank)
    ? rawRank
    : rankFromAverage(averageStat(stats));

  return queueHunterLockedInCelebration({
    uid: user.uid,
    profile,
    rank,
    previousTaskCount,
    nextTaskCount: previousTaskCount + 1,
  });
}

const STAT_VISUALS = Object.freeze({
  Physical: {
    accent: "#60a5fa",
    soft: "rgba(96, 165, 250, 0.16)",
    preview: "rgba(191, 219, 254, 0.9)",
  },
  Intellectual: {
    accent: "#a78bfa",
    soft: "rgba(167, 139, 250, 0.16)",
    preview: "rgba(221, 214, 254, 0.92)",
  },
  Mental: {
    accent: "#4ade80",
    soft: "rgba(74, 222, 128, 0.16)",
    preview: "rgba(187, 247, 208, 0.92)",
  },
  Confidence: {
    accent: "#f59e0b",
    soft: "rgba(245, 158, 11, 0.18)",
    preview: "rgba(253, 230, 138, 0.92)",
  },
  Discipline: {
    accent: "#f87171",
    soft: "rgba(248, 113, 113, 0.18)",
    preview: "rgba(254, 202, 202, 0.92)",
  },
});

const upgradeState = {
  sourceKey: "Physical",
  allocations: createEmptyUpgradePlan(),
  saving: false,
};

let upgradeNotice = "";

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatPointText(count) {
  return `${count} ${count === 1 ? "point" : "points"}`;
}

function getResolvedStatsState(stateOverride = null) {
  const user = getCurrentUser();
  const accountState = stateOverride || readCachedAccountState(user?.uid);
  const profile = readUserProfile(user?.uid);
  const stats = normalizeStats(
    accountState?.stats || (user && user.stats) || (profile && profile.stats),
  );
  const statPoints = normalizeStatPoints(accountState?.statPoints);
  const statUpgrades = normalizeStatUpgrades(accountState?.statUpgrades);

  return { user, accountState, profile, stats, statPoints, statUpgrades };
}

function createEmptyUpgradePlan() {
  const next = {};
  STAT_KEYS.forEach((key) => {
    next[key] = 0;
  });
  return next;
}

function resetUpgradePlan() {
  upgradeState.allocations = createEmptyUpgradePlan();
}

function getPlannedLevels(targetKey) {
  return Math.max(
    0,
    Math.floor(Number(upgradeState.allocations?.[targetKey]) || 0),
  );
}

function getPlannedSpend(sourceKey = upgradeState.sourceKey) {
  return STAT_KEYS.reduce(
    (total, key) => total + getPlannedLevels(key) * getUpgradeCost(sourceKey, key),
    0,
  );
}

function getPreviewStats(stats) {
  const preview = normalizeStats(stats);
  STAT_KEYS.forEach((key) => {
    preview[key] = clampValue(
      (Number(preview[key]) || 0) + getPlannedLevels(key),
      0,
      100,
    );
  });
  return preview;
}

function getStatStyleVars(key) {
  const visual = STAT_VISUALS[key] || STAT_VISUALS.Physical;
  return `--sup-accent:${visual.accent};--sup-accent-soft:${visual.soft};--sup-preview:${visual.preview};`;
}

function ensureUpgradeSelection(stats, statPoints) {
  const availableSources = STAT_KEYS.filter(
    (key) => (Number(statPoints[key]) || 0) > 0,
  );
  const totalAvailable = sumStatPoints(statPoints);

  if (!availableSources.length) {
    upgradeState.sourceKey = "Physical";
    resetUpgradePlan();
    return {
      totalAvailable,
      selectedAvailable: 0,
      remainingPoints: 0,
    };
  }

  if (!availableSources.includes(upgradeState.sourceKey)) {
    upgradeState.sourceKey = availableSources[0];
    resetUpgradePlan();
  }

  const nextPlan = createEmptyUpgradePlan();
  let remainingPoints = Math.max(
    0,
    Number(statPoints[upgradeState.sourceKey]) || 0,
  );

  STAT_KEYS.forEach((targetKey) => {
    const desiredLevels = getPlannedLevels(targetKey);
    const room = Math.max(0, 100 - (Number(stats[targetKey]) || 0));
    const costPerLevel = getUpgradeCost(upgradeState.sourceKey, targetKey);
    const affordableLevels = Math.floor(remainingPoints / costPerLevel);
    const allowedLevels = Math.max(
      0,
      Math.min(desiredLevels, room, affordableLevels),
    );

    nextPlan[targetKey] = allowedLevels;
    remainingPoints -= allowedLevels * costPerLevel;
  });

  upgradeState.allocations = nextPlan;

  return {
    totalAvailable,
    selectedAvailable: Math.max(
      0,
      Number(statPoints[upgradeState.sourceKey]) || 0,
    ),
    remainingPoints,
  };
}

function getMaxAdditionalLevels(stats, statPoints, targetKey) {
  const previewStats = getPreviewStats(stats);
  const selectedAvailable = Math.max(
    0,
    Number(statPoints[upgradeState.sourceKey]) || 0,
  );
  const remainingPoints = Math.max(0, selectedAvailable - getPlannedSpend());
  const costPerLevel = getUpgradeCost(upgradeState.sourceKey, targetKey);
  const room = Math.max(0, 100 - (Number(previewStats[targetKey]) || 0));

  return Math.max(
    0,
    Math.min(Math.floor(remainingPoints / costPerLevel), room),
  );
}

function buildUpgradePlanSummary() {
  return STAT_KEYS.filter((key) => getPlannedLevels(key) > 0)
    .map((key) => `${key} +${getPlannedLevels(key)}`)
    .join(" | ");
}

function renderUpgradeStatList(stats, statPoints) {
  const list = document.getElementById("supStatList");
  if (!list) return;

  const previewStats = getPreviewStats(stats);
  list.innerHTML = "";

  STAT_KEYS.forEach((key) => {
    const currentValue = Math.max(0, Number(stats[key]) || 0);
    const nextValue = Math.max(0, Number(previewStats[key]) || 0);
    const plannedLevels = getPlannedLevels(key);
    const walletPoints = Math.max(0, Number(statPoints[key]) || 0);
    const costPerLevel = getUpgradeCost(upgradeState.sourceKey, key);
    const previewWidth = Math.max(0, nextValue - currentValue);
    const canDecrease = !upgradeState.saving && plannedLevels > 0;
    const canIncrease =
      !upgradeState.saving && getMaxAdditionalLevels(stats, statPoints, key) > 0;
    const isSource = key === upgradeState.sourceKey;

    const card = document.createElement("article");
    card.className = "sup-stat-card";
    card.style.cssText = getStatStyleVars(key);
    if (plannedLevels > 0) card.classList.add("is-planned");
    if (isSource) card.classList.add("is-source");
    if (!walletPoints && !plannedLevels) card.classList.add("is-empty");
    card.dataset.source = key;
    card.innerHTML = `
      <div class="sup-stat-top">
        <div class="sup-stat-nameWrap">
          <span class="sup-stat-dot" aria-hidden="true"></span>
          <div class="sup-stat-copy">
            <div class="sup-stat-name">${key}</div>
            <div class="sup-stat-rule">
              ${
                isSource
                  ? `Source wallet: ${formatPointText(walletPoints)} available.`
                  : `Costs ${costPerLevel} ${costPerLevel === 1 ? "point" : "points"} from ${upgradeState.sourceKey}.`
              }
            </div>
          </div>
        </div>
        <div class="sup-stat-badges">
          <span class="sup-stat-badge">${walletPoints} banked</span>
          ${
            plannedLevels > 0
              ? `<span class="sup-stat-badge is-preview">+${plannedLevels} queued</span>`
              : ""
          }
        </div>
      </div>
      <div class="sup-stat-track" aria-hidden="true">
        <div class="sup-stat-current" style="width:${currentValue}%"></div>
        ${
          previewWidth > 0
            ? `<div class="sup-stat-previewFill" style="left:${currentValue}%;width:${previewWidth}%"></div>`
            : ""
        }
      </div>
      <div class="sup-stat-bottom">
        <div class="sup-stat-values">
          <span>${currentValue} / 100</span>
          ${
            plannedLevels > 0
              ? `<span class="sup-stat-next">${nextValue} after upgrade</span>`
              : `<span>${100 - currentValue} levels until cap</span>`
          }
        </div>
        <div class="sup-stat-controls">
          <button
            class="sup-step"
            type="button"
            data-adjust="-1"
            data-target="${key}"
            ${canDecrease ? "" : "disabled"}
            aria-label="Remove ${key} upgrade"
          >
            -
          </button>
          <div class="sup-stat-amount">${plannedLevels}</div>
          <button
            class="sup-step"
            type="button"
            data-adjust="1"
            data-target="${key}"
            ${canIncrease ? "" : "disabled"}
            aria-label="Add ${key} upgrade"
          >
            +
          </button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function openUpgradeModal() {
  const modal = document.getElementById("supModal");
  if (!modal) return;
  upgradeNotice = "";
  renderUpgradeModal();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
}

function closeUpgradeModal() {
  const modal = document.getElementById("supModal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  upgradeNotice = "";
}

function renderUpgradeModal(stateOverride = null) {
  const modal = document.getElementById("supModal");
  if (!modal) return;

  const { stats, statPoints } = getResolvedStatsState(stateOverride);
  const totals = ensureUpgradeSelection(stats, statPoints);
  const previewStats = getPreviewStats(stats);
  const previewAverage = averageStat(previewStats);
  const averageLine = document.getElementById("supAverageLine");
  const preview = document.getElementById("supPreview");
  const totalEl = document.getElementById("supTotal");
  const hint = document.getElementById("supHint");
  const applyBtn = document.getElementById("supApply");

  renderUpgradeStatList(stats, statPoints);

  if (averageLine) {
    averageLine.textContent = Number.isFinite(previewAverage)
      ? `Average: ${Math.round(previewAverage)} / 100`
      : "Average: --";
  }

  if (totalEl) {
    totalEl.textContent =
      totals.totalAvailable > 0
        ? `${formatPointText(totals.totalAvailable)} available`
        : "0 points available";
  }

  if (hint) {
    hint.textContent =
      upgradeNotice ||
      (totals.totalAvailable > 0
        ? "Spend 1 matching point for +1 in the same stat, or spend 2 points from one category to raise another stat by 1."
        : "Complete quests to earn stat points, then spend them here to shape your build.");
  }

  const planSummary = buildUpgradePlanSummary();
  if (preview) {
    if (totals.totalAvailable <= 0) {
      preview.textContent =
        "Complete more quests to earn stat points for the shop.";
    } else if (!planSummary) {
      preview.textContent =
        `${upgradeState.sourceKey} is selected. Queue one or more stat upgrades to spend its points.`;
    } else {
      preview.textContent = `${planSummary} using ${upgradeState.sourceKey}. ${totals.remainingPoints} ${totals.remainingPoints === 1 ? "point remains" : "points remain"} in that wallet.`;
    }
  }

  if (applyBtn) {
    applyBtn.disabled = upgradeState.saving || !planSummary;
    applyBtn.textContent = upgradeState.saving
      ? "Applying..."
      : "Apply Upgrade";
  }
}

function adjustUpgradePlan(targetKey, direction) {
  if (!STAT_KEYS.includes(targetKey) || !Number.isFinite(direction)) return;

  const { stats, statPoints } = getResolvedStatsState();
  ensureUpgradeSelection(stats, statPoints);

  const currentLevels = getPlannedLevels(targetKey);

  if (direction < 0) {
    upgradeState.allocations[targetKey] = Math.max(0, currentLevels - 1);
    upgradeNotice = "";
    renderUpgradeModal();
    return;
  }

  if (getMaxAdditionalLevels(stats, statPoints, targetKey) <= 0) return;

  upgradeState.allocations[targetKey] = currentLevels + 1;
  upgradeNotice = "";
  renderUpgradeModal();
}

async function applyDashboardUpgrade() {
  const { user, accountState, stats, statPoints, statUpgrades } =
    getResolvedStatsState();
  if (!user?.uid || upgradeState.saving) return;

  const totals = ensureUpgradeSelection(stats, statPoints);
  const plannedTargets = STAT_KEYS.filter((key) => getPlannedLevels(key) > 0);
  const previousRank =
    typeof accountState?.rank === "string" && accountState.rank.trim()
      ? accountState.rank.trim()
      : rankFromAverage(averageStat(stats));
  const taskCount = getTodayCompletedTaskCount();

  if (!plannedTargets.length) {
    upgradeNotice =
      totals.totalAvailable > 0
        ? "Queue at least one upgrade before applying."
        : "Complete quests to earn stat points first.";
    renderUpgradeModal();
    return;
  }

  let nextStats = normalizeStats(stats);
  let nextPoints = normalizeStatPoints(statPoints);
  let nextUpgrades = normalizeStatUpgrades(statUpgrades);

  for (const targetKey of plannedTargets) {
    const result = applyStatUpgrade(
      nextStats,
      nextPoints,
      nextUpgrades,
      upgradeState.sourceKey,
      targetKey,
      getPlannedLevels(targetKey),
    );

    if (!result) {
      upgradeNotice =
        "That preview is no longer available. Please review the rows and try again.";
      renderUpgradeModal();
      return;
    }

    nextStats = result.stats;
    nextPoints = result.statPoints;
    nextUpgrades = result.statUpgrades;
  }

  const nextRank = rankFromAverage(averageStat(nextStats));
  upgradeState.saving = true;
  upgradeNotice = "";
  renderUpgradeModal();

  try {
    const nextState = await mergeUserState(user.uid, {
      stats: nextStats,
      statPoints: nextPoints,
      statUpgrades: nextUpgrades,
    });
    const nextProfile =
      nextState?.profile &&
      typeof nextState.profile === "object" &&
      !Array.isArray(nextState.profile)
        ? nextState.profile
        : readUserProfile(user.uid);
    queueHunterRankUpCelebration({
      uid: user.uid,
      profile: nextProfile,
      previousRank,
      nextRank,
      taskCount,
    });
    resetUpgradePlan();
    closeUpgradeModal();
    renderStatsPanel(nextState);
    updateXP();
    renderDailyCheckin();
    pumpDashboardCelebrations();
  } catch (error) {
    console.warn("Dashboard stat upgrade sync failed:", error);
    upgradeNotice =
      "We couldn't save that upgrade to Firestore. Please try again.";
  } finally {
    upgradeState.saving = false;
    renderUpgradeModal();
  }
}

function initUpgradeModal() {
  const openBtn = document.getElementById("openUpgradeShop");
  const closeBtn = document.getElementById("supClose");
  const backdrop = document.getElementById("supBackdrop");
  const statList = document.getElementById("supStatList");
  const applyBtn = document.getElementById("supApply");

  if (openBtn) openBtn.addEventListener("click", openUpgradeModal);
  if (closeBtn) closeBtn.addEventListener("click", closeUpgradeModal);
  if (backdrop) backdrop.addEventListener("click", closeUpgradeModal);

  statList?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-adjust][data-target]");
    if (btn) {
      adjustUpgradePlan(
        btn.getAttribute("data-target") || "Physical",
        Number(btn.getAttribute("data-adjust")) || 0,
      );
      return;
    }

    const card = event.target.closest("[data-source]");
    if (!card || upgradeState.saving) return;

    const nextSource = card.getAttribute("data-source") || "Physical";
    if (nextSource === upgradeState.sourceKey) return;

    const { statPoints } = getResolvedStatsState();
    if ((Number(statPoints?.[nextSource]) || 0) <= 0) {
      upgradeNotice = `No ${nextSource} points available yet.`;
      renderUpgradeModal();
      return;
    }

    upgradeState.sourceKey = nextSource;
    resetUpgradePlan();
    upgradeNotice = "";
    renderUpgradeModal();
  });

  applyBtn?.addEventListener("click", applyDashboardUpgrade);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUpgradeModal();
  });
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

function rankProgressIndex(rank) {
  return HUNTER_RANK_ORDER.indexOf(normalizeRank(rank));
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

function hunterFigureSrcCandidatesFromProfileRankAndMoodKey(
  profile,
  rank,
  moodKey,
) {
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

function getHunterLockedInOpeningConfig(characterKey, rank) {
  const key = safeString(characterKey).toLowerCase();
  if (normalizeRank(rank) !== "S" || !key) return null;
  return HUNTER_LOCKED_IN_OPENINGS[key] || null;
}

function getHunterDisplayName(profile, characterKey) {
  const title = safeString(profile?.title) || safeString(profile?.titleSurvey?.title);
  if (title) return title;

  const key = safeString(characterKey).toLowerCase();
  return (
    HUNTER_LOCKED_IN_OPENINGS[key]?.label ||
    {
      vanguard: "Vanguard",
      insightphantom: "Insight Phantom",
      executioner: "Executioner",
      saint: "Saint",
      reaper: "Mind Reaper",
    }[key] ||
    "Hunter"
  );
}

function getHunterCinematicEls() {
  return {
    overlay: document.getElementById("hunterCinematic"),
    stage: document.getElementById("hunterCinematicStage"),
    video: document.getElementById("hunterCinematicVideo"),
    figure: document.getElementById("hunterCinematicFigure"),
    figureNext: document.getElementById("hunterCinematicFigureNext"),
    popup: document.getElementById("hunterLockPopup"),
    popupKicker: document.getElementById("hunterLockPopupKicker"),
    popupTitle: document.getElementById("hunterLockPopupTitle"),
    popupSubtitle: document.getElementById("hunterLockPopupSubtitle"),
    popupRank: document.getElementById("hunterLockPopupRank"),
    popupCharacter: document.getElementById("hunterLockPopupCharacter"),
    popupTasks: document.getElementById("hunterLockPopupTasks"),
    popupButton: document.getElementById("hunterLockPopupButton"),
    shell: document.querySelector(".hunter-figure-shell"),
  };
}

function prepareHunterCinematicVideo(characterKey, rank) {
  const { overlay, video } = getHunterCinematicEls();
  if (!video) return;

  const openingConfig = getHunterLockedInOpeningConfig(characterKey, rank);
  if (openingConfig) {
    if (video.dataset.srcReady !== openingConfig.src) {
      video.src = openingConfig.src;
      video.dataset.srcReady = openingConfig.src;
      video.load();
    }
    return;
  }

  if (overlay?.classList.contains("is-active")) return;
  if (video.dataset.srcReady) {
    video.pause();
    video.removeAttribute("src");
    delete video.dataset.srcReady;
    video.load();
  }
}

function queueHunterLockedInOpeningIfNeeded(previousTaskCount, nowComplete) {
  const previousCount = Math.max(0, Number(previousTaskCount) || 0);
  const nextCount = Math.max(0, previousCount + (nowComplete ? 1 : -1));
  if (
    nowComplete &&
    !isLockedInMoodKey(heroMoodKeyFromTaskCount(previousCount)) &&
    isLockedInMoodKey(heroMoodKeyFromTaskCount(nextCount))
  ) {
    pendingHunterLockedInOpeningAt = Date.now();
  }
}

function hasPendingHunterLockedInOpening() {
  if (!pendingHunterLockedInOpeningAt) return false;
  if (Date.now() - pendingHunterLockedInOpeningAt > HUNTER_OPENING_PENDING_TTL_MS) {
    pendingHunterLockedInOpeningAt = 0;
    return false;
  }
  return true;
}

function clearHunterCinematicState(overlay, stage, shell) {
  if (overlay) {
    overlay.classList.remove(
      "is-active",
      "is-prime",
      "is-floating",
      "is-returning",
      "is-popup-live",
      "is-rank-up-mode",
      "is-rank-up-live",
      "is-rank-up-evolving",
    );
    overlay.setAttribute("aria-hidden", "true");
    clearTimeout(overlay._hunterRankUpSwapTimer);
    delete overlay.dataset.character;
  }
  if (stage) {
    stage.style.setProperty("--cinematic-return-x", "0px");
    stage.style.setProperty("--cinematic-return-y", "0px");
    stage.style.setProperty("--cinematic-return-scale", "1");
  }
  if (shell) shell.classList.remove("is-cinematic-anchor");
}

function setHunterCinematicReturnTarget(stage, shell) {
  if (!stage || !shell) return;

  const stageRect = stage.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  const stageCenterX = stageRect.left + stageRect.width / 2;
  const stageCenterY = stageRect.top + stageRect.height / 2;
  const shellCenterX = shellRect.left + shellRect.width / 2;
  const shellCenterY = shellRect.top + shellRect.height / 2;
  const scale = Math.max(
    0.18,
    Math.min(
      shellRect.width / Math.max(stageRect.width, 1),
      shellRect.height / Math.max(stageRect.height, 1),
      0.52,
    ),
  );

  stage.style.setProperty(
    "--cinematic-return-x",
    `${Math.round(shellCenterX - stageCenterX)}px`,
  );
  stage.style.setProperty(
    "--cinematic-return-y",
    `${Math.round(shellCenterY - stageCenterY)}px`,
  );
  stage.style.setProperty("--cinematic-return-scale", String(scale));
}

function populateHunterLockedInPopup({
  overlay,
  popupKicker,
  popupTitle,
  popupSubtitle,
  popupRank,
  popupCharacter,
  popupTasks,
  popupButton,
  displayName,
  rank,
  taskCount,
  characterKey,
}) {
  if (!overlay) return;
  overlay.dataset.character = safeString(characterKey).toLowerCase();
  if (popupKicker) popupKicker.textContent = "Congratulations";
  if (popupTitle) popupTitle.textContent = "Locked In State Reached";
  if (popupSubtitle) {
    popupSubtitle.textContent = `${displayName} has awakened at peak focus. ${taskCount} quests cleared today.`;
  }
  if (popupRank) popupRank.textContent = `Rank ${rank}`;
  if (popupCharacter) popupCharacter.textContent = displayName;
  if (popupTasks) {
    popupTasks.textContent = `${taskCount} Quest${taskCount === 1 ? "" : "s"}`;
  }
  if (popupButton) popupButton.textContent = "Return to Dashboard";
}

function populateHunterRankUpPopup({
  overlay,
  popupKicker,
  popupTitle,
  popupSubtitle,
  popupRank,
  popupCharacter,
  popupTasks,
  popupButton,
  displayName,
  previousRank,
  nextRank,
  characterKey,
}) {
  if (!overlay) return;
  overlay.dataset.character = safeString(characterKey).toLowerCase();
  if (popupKicker) popupKicker.textContent = "Rank Up";
  if (popupTitle) popupTitle.textContent = `Rank ${nextRank} Unlocked`;
  if (popupSubtitle) {
    popupSubtitle.textContent = `${displayName} advanced from Rank ${previousRank} to Rank ${nextRank}.`;
  }
  if (popupRank) popupRank.textContent = `New Rank ${nextRank}`;
  if (popupCharacter) popupCharacter.textContent = displayName;
  if (popupTasks) popupTasks.textContent = `${previousRank} -> ${nextRank}`;
  if (popupButton) popupButton.textContent = "Return to Dashboard";
}

function queueHunterRankUpIfNeeded({
  userKey,
  profile,
  characterKey,
  previousRank,
  nextRank,
  moodKey,
  displayName,
}) {
  if (!userKey || !characterKey || !hasKnownRank(previousRank) || !hasKnownRank(nextRank)) {
    return;
  }

  const safePreviousRank = normalizeRank(previousRank);
  const safeNextRank = normalizeRank(nextRank);
  if (rankProgressIndex(safeNextRank) <= rankProgressIndex(safePreviousRank)) return;

  const previousFigureCandidates = hunterFigureSrcCandidatesFromProfileRankAndMoodKey(
    profile,
    safePreviousRank,
    moodKey,
  );
  const nextFigureCandidates = hunterFigureSrcCandidatesFromProfileRankAndMoodKey(
    profile,
    safeNextRank,
    moodKey,
  );
  if (!previousFigureCandidates.length || !nextFigureCandidates.length) return;

  pendingHunterRankUp = {
    userKey,
    characterKey,
    displayName,
    previousRank: safePreviousRank,
    nextRank: safeNextRank,
    previousFigureCandidates,
    nextFigureCandidates,
  };
}

function maybeQueueHunterRankUp({
  userKey,
  profile,
  characterKey,
  rank,
  moodKey,
  displayName,
}) {
  const safeRank = hasKnownRank(rank) ? normalizeRank(rank) : "";
  if (!userKey) return;

  if (lastObservedHunterRankUserKey !== userKey) {
    lastObservedHunterRankUserKey = userKey;
    lastObservedHunterRank = safeRank;
    return;
  }

  const previousRank = lastObservedHunterRank;
  lastObservedHunterRank = safeRank;

  if (!previousRank || !safeRank || previousRank === safeRank) return;

  queueHunterRankUpIfNeeded({
    userKey,
    profile,
    characterKey,
    previousRank,
    nextRank: safeRank,
    moodKey,
    displayName,
  });
}

function maybePlayPendingHunterRankUp() {
  const { overlay } = getHunterCinematicEls();
  if (!pendingHunterRankUp || overlay?.classList.contains("is-active")) return;

  const queuedRankUp = pendingHunterRankUp;
  pendingHunterRankUp = null;
  requestAnimationFrame(() => playHunterRankUpSequence(queuedRankUp));
}

function playHunterLockedInOpeningSequence(options = {}) {
  const {
    overlay,
    stage,
    video,
    figure,
    figureNext,
    popup,
    popupKicker,
    popupTitle,
    popupSubtitle,
    popupRank,
    popupCharacter,
    popupTasks,
    popupButton,
    shell,
  } = getHunterCinematicEls();
  const cardFigure = document.getElementById("hunterFigure");
  if (!overlay || !stage || !video || !figure || !shell) return;

  const openingConfig = getHunterLockedInOpeningConfig(
    options.characterKey,
    options.rank,
  );
  if (!openingConfig) return;

  const taskCount = Math.max(0, Number(options.taskCount) || 0);
  const displayName = safeString(options.displayName) || openingConfig.label;

  const token = hunterOpeningToken + 1;
  hunterOpeningToken = token;

  clearTimeout(overlay._hunterOpeningFallbackTimer);
  clearTimeout(overlay._hunterOpeningFloatTimer);
  clearTimeout(overlay._hunterOpeningReturnTimer);
  if (overlay._hunterReturnHandler && popupButton) {
    popupButton.removeEventListener("click", overlay._hunterReturnHandler);
    delete overlay._hunterReturnHandler;
  }
  if (overlay._hunterKeydownHandler) {
    overlay.removeEventListener("keydown", overlay._hunterKeydownHandler);
    delete overlay._hunterKeydownHandler;
  }
  clearHunterCinematicState(overlay, stage, shell);
  populateHunterLockedInPopup({
    overlay,
    popup,
    popupKicker,
    popupTitle,
    popupSubtitle,
    popupRank,
    popupCharacter,
    popupTasks,
    popupButton,
    displayName,
    rank: normalizeRank(options.rank),
    taskCount,
    characterKey: options.characterKey,
  });

  figure.src =
    cardFigure?.currentSrc ||
    cardFigure?.src ||
    openingConfig.figureFallback;
  if (typeof figure.decode === "function") {
    void figure.decode().catch(() => {});
  }
  void overlay.offsetWidth;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-active");
  shell.classList.add("is-cinematic-anchor");

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cleanup = () => {
    if (hunterOpeningToken !== token) return;
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("ended", showFloatingFigure);
    video.removeEventListener("error", showFloatingFigure);
    if (overlay._hunterReturnHandler && popupButton) {
      popupButton.removeEventListener("click", overlay._hunterReturnHandler);
      delete overlay._hunterReturnHandler;
    }
    if (overlay._hunterKeydownHandler) {
      overlay.removeEventListener("keydown", overlay._hunterKeydownHandler);
      delete overlay._hunterKeydownHandler;
    }
    clearTimeout(overlay._hunterOpeningFallbackTimer);
    clearTimeout(overlay._hunterOpeningFloatTimer);
    clearTimeout(overlay._hunterOpeningReturnTimer);
    clearHunterCinematicState(overlay, stage, shell);
    if (figureNext) {
      figureNext.onerror = null;
      figureNext.removeAttribute("src");
      figureNext.style.visibility = "hidden";
    }
    video.pause();
    try {
      video.currentTime = 0;
    } catch {}
    maybePlayPendingHunterRankUp();
  };

  const returnToCard = () => {
    if (hunterOpeningToken !== token) return;
    overlay.classList.remove("is-popup-live");
    setHunterCinematicReturnTarget(stage, shell);
    void stage.offsetWidth;
    overlay.classList.add("is-returning");
    overlay._hunterOpeningReturnTimer = setTimeout(
      cleanup,
      HUNTER_OPENING_RETURN_MS,
    );
  };

  const showFloatingFigure = () => {
    if (hunterOpeningToken !== token) return;
    clearTimeout(overlay._hunterOpeningFallbackTimer);
    overlay.classList.add("is-prime", "is-floating");
    if (popup) {
      overlay.classList.add("is-popup-live");
      if (popupButton) {
        popupButton.focus({ preventScroll: true });
      }
    }
  };

  const onOverlayKeyDown = (event) => {
    if (hunterOpeningToken !== token) return;
    if (event.key === "Escape" && overlay.classList.contains("is-popup-live")) {
      event.preventDefault();
      returnToCard();
    }
  };

  overlay._hunterReturnHandler = returnToCard;
  overlay._hunterKeydownHandler = onOverlayKeyDown;
  popupButton?.addEventListener("click", returnToCard);
  overlay.addEventListener("keydown", onOverlayKeyDown);

  const onTimeUpdate = () => {
    const duration =
      Number(video.duration) || HUNTER_OPENING_DEFAULT_DURATION_SECONDS;
    if (duration - video.currentTime <= HUNTER_OPENING_PRIME_REMAINING_SECONDS) {
      overlay.classList.add("is-prime");
    }
  };

  if (prefersReducedMotion) {
    overlay.classList.add("is-prime", "is-floating");
    if (popup) {
      overlay.classList.add("is-popup-live");
      if (popupButton) {
        popupButton.focus({ preventScroll: true });
      }
    }
    return;
  }

  if (video.dataset.srcReady !== openingConfig.src) {
    video.src = openingConfig.src;
    video.dataset.srcReady = openingConfig.src;
  }

  video.muted = true;
  video.playsInline = true;
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("ended", showFloatingFigure, { once: true });
  video.addEventListener("error", showFloatingFigure, { once: true });

  const startFallbackTimer = () => {
    const duration =
      Number(video.duration) || HUNTER_OPENING_DEFAULT_DURATION_SECONDS;
    overlay._hunterOpeningFallbackTimer = setTimeout(
      showFloatingFigure,
      duration * 1000 + 220,
    );
  };

  const startPlayback = () => {
    if (hunterOpeningToken !== token) return;
    try {
      video.currentTime = 0;
    } catch {}

    startFallbackTimer();
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(showFloatingFigure);
    }
  };

  if (video.readyState >= 1) {
    startPlayback();
  } else {
    video.addEventListener("loadedmetadata", startPlayback, { once: true });
    video.load();
  }
}

function playHunterRankUpSequence(options = {}) {
  const {
    overlay,
    stage,
    video,
    figure,
    figureNext,
    popupKicker,
    popupTitle,
    popupSubtitle,
    popupRank,
    popupCharacter,
    popupTasks,
    popupButton,
    shell,
  } = getHunterCinematicEls();
  if (!overlay || !stage || !video || !figure || !figureNext || !shell) return;

  const displayName = safeString(options.displayName) || "Hunter";
  const previousRank = normalizeRank(options.previousRank);
  const nextRank = normalizeRank(options.nextRank);

  const token = hunterOpeningToken + 1;
  hunterOpeningToken = token;

  clearTimeout(overlay._hunterOpeningFallbackTimer);
  clearTimeout(overlay._hunterOpeningFloatTimer);
  clearTimeout(overlay._hunterOpeningReturnTimer);
  clearTimeout(overlay._hunterRankUpSwapTimer);
  if (overlay._hunterReturnHandler && popupButton) {
    popupButton.removeEventListener("click", overlay._hunterReturnHandler);
    delete overlay._hunterReturnHandler;
  }
  if (overlay._hunterKeydownHandler) {
    overlay.removeEventListener("keydown", overlay._hunterKeydownHandler);
    delete overlay._hunterKeydownHandler;
  }

  clearHunterCinematicState(overlay, stage, shell);
  populateHunterRankUpPopup({
    overlay,
    popupKicker,
    popupTitle,
    popupSubtitle,
    popupRank,
    popupCharacter,
    popupTasks,
    popupButton,
    displayName,
    previousRank,
    nextRank,
    characterKey: options.characterKey,
  });

  setImageWithFallback(figure, options.previousFigureCandidates);
  setImageWithFallback(figureNext, options.nextFigureCandidates);

  video.pause();
  if (video.dataset.srcReady) {
    video.removeAttribute("src");
    delete video.dataset.srcReady;
    video.load();
  }

  void overlay.offsetWidth;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-active", "is-rank-up-mode", "is-rank-up-live", "is-popup-live");
  shell.classList.add("is-cinematic-anchor");

  const cleanup = () => {
    if (hunterOpeningToken !== token) return;
    if (overlay._hunterReturnHandler && popupButton) {
      popupButton.removeEventListener("click", overlay._hunterReturnHandler);
      delete overlay._hunterReturnHandler;
    }
    if (overlay._hunterKeydownHandler) {
      overlay.removeEventListener("keydown", overlay._hunterKeydownHandler);
      delete overlay._hunterKeydownHandler;
    }
    clearTimeout(overlay._hunterOpeningReturnTimer);
    clearTimeout(overlay._hunterRankUpSwapTimer);
    clearHunterCinematicState(overlay, stage, shell);
    figure.onerror = null;
    figureNext.onerror = null;
    figureNext.removeAttribute("src");
    figureNext.style.visibility = "hidden";
    maybePlayPendingHunterRankUp();
  };

  const returnToCard = () => {
    if (hunterOpeningToken !== token) return;
    overlay.classList.remove("is-popup-live");
    setHunterCinematicReturnTarget(stage, shell);
    void stage.offsetWidth;
    overlay.classList.add("is-returning");
    overlay._hunterOpeningReturnTimer = setTimeout(
      cleanup,
      HUNTER_OPENING_RETURN_MS,
    );
  };

  const onOverlayKeyDown = (event) => {
    if (hunterOpeningToken !== token) return;
    if (event.key === "Escape" && overlay.classList.contains("is-popup-live")) {
      event.preventDefault();
      returnToCard();
    }
  };

  overlay._hunterReturnHandler = returnToCard;
  overlay._hunterKeydownHandler = onOverlayKeyDown;
  popupButton?.addEventListener("click", returnToCard);
  overlay.addEventListener("keydown", onOverlayKeyDown);

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    overlay.classList.add("is-rank-up-evolving");
    popupButton?.focus({ preventScroll: true });
    return;
  }

  overlay._hunterRankUpSwapTimer = setTimeout(() => {
    if (hunterOpeningToken !== token) return;
    overlay.classList.add("is-rank-up-evolving");
  }, HUNTER_RANK_UP_SWAP_DELAY_MS);

  popupButton?.focus({ preventScroll: true });
}

function hunterLockedInBackdropSrcFromProfileRankAndMoodKey(
  profile,
  rank,
  moodKey,
) {
  const safeRank = normalizeRank(rank);
  const characterKey = heroCharacterKeyFromProfile(profile);
  if (!characterKey) return "";
  const supportedBackdropRanks =
    HERO_LOCKED_IN_BACKDROP_SUPPORT[safeString(characterKey).toLowerCase()] ||
    [];
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
    (cached?.profile && typeof cached.profile === "object"
      ? cached.profile
      : null) || readUserProfile(user?.uid);
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

  prepareHunterCinematicVideo(characterKey, rank);

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

  pumpDashboardCelebrations();
}

function renderStatsPanel(accountState = null) {
  const user = getCurrentUser();
  const cached =
    accountState || (user?.uid ? readCachedAccountState(user.uid) : null);
  const profile = readUserProfile(user?.uid);
  const stats = normalizeStats(cached?.stats || user?.stats || profile?.stats);
  const statPoints = normalizeStatPoints(cached?.statPoints);
  const totalPoints = sumStatPoints(statPoints);
  const pillarRows = document.querySelectorAll(".pillar-row");
  const upgradeBtn = document.getElementById("openUpgradeShop");

  if (upgradeBtn) {
    upgradeBtn.textContent =
      totalPoints > 0 ? `Upgrade (${totalPoints})` : "Upgrade";
  }

  STAT_KEYS.forEach((key, index) => {
    const row = pillarRows[index];
    if (!row) return;

    const nameEl = row.querySelector(".pillar-name");
    const valEl = row.querySelector(".pillar-val");
    const barFill = row.querySelector(".bar-fill");
    const value = Math.max(0, Math.min(100, Number(stats[key]) || 0));

    if (nameEl) nameEl.textContent = key;

    if (valEl) {
      valEl.dataset.suffix = " / 100";
      setTimeout(() => {
        let start = performance.now();
        function tick(now) {
          const prog = Math.min((now - start) / 850, 1);
          const eased = 1 - Math.pow(1 - prog, 3);
          valEl.textContent = Math.round(eased * value) + " / 100";
          if (prog < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }, index * 100);
    }

    if (barFill) {
      barFill.style.width = "0%";
      setTimeout(() => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            barFill.style.width = `${value}%`;
          }),
        );
      }, index * 80);
    }

    if (!row.dataset.pillarBound) {
      row.dataset.pillarBound = "1";
      const pillarDescs = {
        Physical: "Core strength, endurance & body control.",
        Intellectual: "Learning depth, focus & cognitive sharpness.",
        Mental: "Emotional resilience & mindset clarity.",
        Confidence: "Self-belief, presence & communication.",
        Discipline: "Consistency, habits & follow-through.",
      };
      const pRank = (v) =>
        v >= 85
          ? "Elite"
          : v >= 70
            ? "Advanced"
            : v >= 50
              ? "Developing"
              : v >= 30
                ? "Beginner"
                : "Rookie";
      const pClass = (v) => pRank(v).toLowerCase();

      let pCard = document.getElementById("pillarFloatCard");
      if (!pCard) {
        pCard = document.createElement("div");
        pCard.id = "pillarFloatCard";
        pCard.className = "pillar-float-card";
        document.body.appendChild(pCard);
      }

      row.addEventListener("mouseenter", () => {
        pCard.innerHTML = `
          <div class="pfc-name">${key}</div>
          <div class="pfc-value-row"><span class="pfc-value-big">${value}</span><span class="pfc-value-max">/ 100</span></div>
          <div class="pfc-bar-track"><div class="pfc-bar-fill" style="width:0%"></div></div>
          <div class="pfc-rank ${pClass(value)}">${pRank(value)}</div>
          <div class="pfc-desc">${pillarDescs[key] || ""}</div>
        `;
        pCard.classList.add("visible");
        const rect = row.getBoundingClientRect();
        let left = rect.right + 14;
        let top = rect.top + rect.height / 2 - 90;
        if (left + 246 > window.innerWidth - 8) left = rect.left - 252;
        if (top < 8) top = 8;
        if (top + 200 > window.innerHeight - 8) top = window.innerHeight - 208;
        pCard.style.left = `${Math.round(left)}px`;
        pCard.style.top = `${Math.round(top)}px`;
        requestAnimationFrame(() => {
          const b = pCard.querySelector(".pfc-bar-fill");
          if (b) b.style.width = `${value}%`;
        });
      });
      row.addEventListener("mouseleave", () =>
        pCard.classList.remove("visible"),
      );
    }
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

  const modal = document.getElementById("supModal");
  if (modal && modal.getAttribute("aria-hidden") === "false") {
    renderUpgradeModal(cached);
  }

  const svgEl = radar.closest("svg");
  if (!svgEl) return;

  svgEl.querySelectorAll(".vertex-hit").forEach((el) => el.remove());

  let vCard = document.getElementById("vertexFloatCard");
  if (!vCard) {
    vCard = document.createElement("div");
    vCard.id = "vertexFloatCard";
    vCard.className = "vertex-float-card";
    document.body.appendChild(vCard);
  }

  const vRank = (v) =>
    v >= 85
      ? "Elite"
      : v >= 70
        ? "Advanced"
        : v >= 50
          ? "Developing"
          : v >= 30
            ? "Beginner"
            : "Rookie";
  const vClass = (v) => vRank(v).toLowerCase();

  STAT_KEYS.forEach((key, i) => {
    const value = Math.max(0, Math.min(100, Number(stats[key]) || 0));
    const outer = outerPoints[i];
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("vertex-hit");

    const ring = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    ring.setAttribute("cx", outer.x);
    ring.setAttribute("cy", outer.y);
    ring.setAttribute("r", "10");
    ring.setAttribute("fill", "rgba(34,211,238,0.14)");
    ring.setAttribute("stroke", "rgba(34,211,238,0.7)");
    ring.setAttribute("stroke-width", "1.5");
    ring.style.opacity = "0";
    ring.style.transition = "opacity 0.15s ease";
    ring.style.pointerEvents = "none";

    const hit = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    hit.setAttribute("cx", outer.x);
    hit.setAttribute("cy", outer.y);
    hit.setAttribute("r", "18");
    hit.setAttribute("fill", "transparent");
    hit.style.cursor = "pointer";

    g.appendChild(ring);
    g.appendChild(hit);

    hit.addEventListener("mouseenter", () => {
      ring.style.opacity = "1";
      vCard.innerHTML = `
        <div class="vfc-name">${key}</div>
        <div class="vfc-value">${value}</div>
        <div class="vfc-max">/ 100</div>
        <div class="vfc-rank ${vClass(value)}">${vRank(value)}</div>
      `;
      vCard.classList.add("visible");
      const sr = svgEl.getBoundingClientRect();
      const sx = sr.left + outer.x * (sr.width / 200);
      const sy = sr.top + outer.y * (sr.height / 200);
      let left = sx + 16;
      let top = sy - 70;
      if (left + 162 > window.innerWidth - 8) left = sx - 178;
      if (top < 8) top = sy + 16;
      if (top + 150 > window.innerHeight - 8) top = window.innerHeight - 158;
      vCard.style.left = `${Math.round(left)}px`;
      vCard.style.top = `${Math.round(top)}px`;
    });
    hit.addEventListener("mouseleave", () => {
      ring.style.opacity = "0";
      vCard.classList.remove("visible");
    });
    svgEl.appendChild(g);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  let user = getCurrentUser();
  if (!user) return;

  const figShell = document.querySelector(".hunter-figure-shell");
  if (figShell) {
    const overlay = document.createElement("div");
    overlay.className = "hunter-stat-overlay";
    overlay.innerHTML = `
      <div class="hso-label">Character Stats</div>
      <div class="hso-grid">
        <div class="hso-chip"><div class="hso-chip-k">Mood</div><div class="hso-chip-v" id="hsoMood">—</div></div>
        <div class="hso-chip"><div class="hso-chip-k">Total XP</div><div class="hso-chip-v hso-aqua" id="hsoXp">—</div></div>
        <div class="hso-chip"><div class="hso-chip-k">Today</div><div class="hso-chip-v hso-green" id="hsoTasks">—</div></div>
        <div class="hso-chip"><div class="hso-chip-k">Mode</div><div class="hso-chip-v hso-violet" id="hsoMode">—</div></div>
      </div>
    `;
    figShell.appendChild(overlay);

    figShell.addEventListener("mousemove", (e) => {
      if (figShell.classList.contains("is-cinematic-anchor")) return;
      const r = figShell.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      figShell.style.transition = "transform 0.08s ease-out";
      figShell.style.transform = `perspective(700px) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg) scale(1.012)`;
    });

    figShell.addEventListener("mouseleave", () => {
      figShell.style.transition = "transform 0.65s cubic-bezier(0.16,1,0.3,1)";
      figShell.style.transform =
        "perspective(700px) rotateX(0deg) rotateY(0deg) scale(1)";
    });

    figShell.addEventListener("mouseenter", () => {
      if (figShell.classList.contains("is-cinematic-anchor")) return;
      const moodEl = document.getElementById("hunterMood");
      const xpEl = document.getElementById("hunterXpValue");
      const tasksEl = document.getElementById("hunterTasksDone");
      const modeEl = document.getElementById("hunterMode");
      const hMood = document.getElementById("hsoMood");
      const hXp = document.getElementById("hsoXp");
      const hTasks = document.getElementById("hsoTasks");
      const hMode = document.getElementById("hsoMode");
      if (hMood) hMood.textContent = moodEl?.textContent?.trim() || "—";
      if (hXp)
        hXp.textContent = (() => {
          const n = Number(xpEl?.textContent?.trim());
          return Number.isFinite(n) ? n.toLocaleString() : "—";
        })();
      if (hTasks)
        hTasks.textContent = (tasksEl?.textContent?.trim() || "0") + " quests";
      if (hMode) hMode.textContent = modeEl?.textContent?.trim() || "—";
    });
  }

  const hunterTile = document.getElementById("hunterTile");
  if (hunterTile) {
    const bgA = hunterTile.querySelector(".hunter-bg-aqua");
    const bgV = hunterTile.querySelector(".hunter-bg-violet");
    hunterTile.addEventListener("mousemove", (e) => {
      const r = hunterTile.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      if (bgA) {
        bgA.style.transform = `translate(${nx * 40}px,${ny * 30}px)`;
        bgA.style.transition = "transform 0.12s ease-out";
      }
      if (bgV) {
        bgV.style.transform = `translate(${-nx * 35}px,${-ny * 25}px)`;
        bgV.style.transition = "transform 0.12s ease-out";
      }
    });
    hunterTile.addEventListener("mouseleave", () => {
      if (bgA) {
        bgA.style.transform = "";
        bgA.style.transition = "transform 0.6s ease-out";
      }
      if (bgV) {
        bgV.style.transform = "";
        bgV.style.transition = "transform 0.6s ease-out";
      }
    });
  }

  const revealTargets = document.querySelectorAll(
    ".panel, .wide-tile, .line-graph, .checkin-card, .focus-card",
  );
  revealTargets.forEach((el, i) => {
    el.classList.add("reveal");
    el.dataset.delay = String((i % 5) + 1);
  });
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("revealed");
          revealObs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  revealTargets.forEach((el) => revealObs.observe(el));

  const cursorGlow = document.createElement("div");
  cursorGlow.id = "cursor-glow";
  document.body.appendChild(cursorGlow);
  let mX = window.innerWidth / 2,
    mY = window.innerHeight / 2,
    gX = mX,
    gY = mY;
  document.addEventListener("mousemove", (e) => {
    mX = e.clientX;
    mY = e.clientY;
  });
  (function lerp() {
    gX += (mX - gX) * 0.07;
    gY += (mY - gY) * 0.07;
    cursorGlow.style.transform = `translate(${Math.round(gX)}px,${Math.round(gY)}px)`;
    requestAnimationFrame(lerp);
  })();

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
  initUpgradeModal();

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
  pumpDashboardCelebrations();

  if (user.uid) {
    subscribeToUserState(
      user.uid,
      async (state) => {
        renderStatsPanel(state);
        updateXP();
        updateGraph();
        await loadAndRenderPreviewTasks();
        renderDailyCheckin();
        pumpDashboardCelebrations();
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
      pumpDashboardCelebrations();
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
  const previousTaskCount = getTodayCompletedTaskCount();
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

  const syncPromise = user?.uid
    ? mergeUserState(user.uid, {
      quests: state,
      stats: pointUpdate.stats,
      totalXP,
      dailyTaskHistory: readTaskHistoryMap(),
      statPoints: pointUpdate.statPoints,
      statUpgrades: pointUpdate.statUpgrades,
    }).catch((error) => {
      console.warn("Preview quest sync failed:", error);
    })
    : null;

  toast(
    nowComplete
      ? `Quest completed +${xpDelta} XP, +1 ${pointUpdate.statKey} point`
      : `Quest undone -${xpDelta} XP, -1 ${pointUpdate.statKey} point${buildUndoReverseText(pointUpdate)}`,
  );
  maybeQueueDashboardLockedInCelebration(
    previousTaskCount,
    nowComplete,
    user,
    accountState,
  );
  updateGraph();
  updateXP();
  renderStatsPanel();
  pumpDashboardCelebrations();
  if (syncPromise) await syncPromise;
}

function updateXP() {
  const user = getCurrentUser();
  const cached = user?.uid ? readCachedAccountState(user.uid) : null;
  const profile =
    (cached?.profile && typeof cached.profile === "object"
      ? cached.profile
      : null) || readUserProfile(user?.uid);
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
  const stats =
    cached?.stats || (user && user.stats) || (profile && profile.stats) || null;
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
  if (dashXpFill) {
    dashXpFill.style.width = "0%";
    const targetW = `${Math.min(info.progress * 100, 100)}%`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        dashXpFill.style.width = targetW;
      }),
    );
    const xpBarEl = dashXpFill.closest(".xpbar");
    if (xpBarEl) {
      xpBarEl.dataset.tip = `${info.remaining.toLocaleString()} / ${info.req.toLocaleString()} XP  ·  ${Math.max(0, info.req - info.remaining).toLocaleString()} more to level up`;
    }
  }
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
  const parts = String(questDayIso)
    .split("-")
    .map((v) => Number(v));
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
    todayCompletedIds = Object.keys(completed).filter(
      (qid) => !!completed[qid],
    );
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

    let areaPath = svg.querySelector(".graph-area-fill");
    if (!areaPath) {
      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svg.insertBefore(defs, svg.firstChild);
      }
      if (!defs.querySelector("#graphGrad")) {
        const grad = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "linearGradient",
        );
        grad.setAttribute("id", "graphGrad");
        grad.setAttribute("x1", "0");
        grad.setAttribute("y1", "0");
        grad.setAttribute("x2", "0");
        grad.setAttribute("y2", "1");
        const s1 = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "stop",
        );
        s1.setAttribute("offset", "0%");
        s1.setAttribute("stop-color", "rgba(34,211,238,0.22)");
        const s2 = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "stop",
        );
        s2.setAttribute("offset", "100%");
        s2.setAttribute("stop-color", "rgba(34,211,238,0)");
        grad.appendChild(s1);
        grad.appendChild(s2);
        defs.appendChild(grad);
      }
      areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      areaPath.classList.add("graph-area-fill");
      areaPath.setAttribute("fill", "url(#graphGrad)");
      areaPath.setAttribute("stroke", "none");
      areaPath.style.opacity = "0";
      svg.insertBefore(areaPath, svg.children[1] || null);
    }

    let path = svg.querySelector(".data-line");
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("data-line");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--aqua)");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
    }

    const rawPts = weeklyData.map((val, i) => ({
      x: 60 + i * 100,
      y: mapY(val),
    }));
    const d =
      rawPts.length > 0
        ? "M" + rawPts.map((p) => `${p.x},${p.y}`).join(" L")
        : "";
    path.setAttribute("d", d);

    if (rawPts.length > 0) {
      const first = rawPts[0];
      const last = rawPts[rawPts.length - 1];
      areaPath.setAttribute(
        "d",
        `M${first.x},220 ` +
          rawPts.map((p) => `L${p.x},${p.y}`).join(" ") +
          ` L${last.x},220 Z`,
      );
    }

    const totalLen = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = String(totalLen);
    path.style.strokeDashoffset = String(totalLen);
    areaPath.style.transition = "none";
    areaPath.style.opacity = "0";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        path.style.transition =
          "stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1)";
        path.style.strokeDashoffset = "0";
        areaPath.style.transition = "opacity 0.9s ease 0.35s";
        areaPath.style.opacity = "1";
      }),
    );

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

    const lgContainer = svg.closest(".line-graph");
    let colHL = lgContainer?.querySelector(".graph-col-hl");
    if (!colHL && lgContainer) {
      lgContainer.style.position = "relative";
      colHL = document.createElement("div");
      colHL.className = "graph-col-hl";
      lgContainer.insertBefore(colHL, svg);
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
      const isToday = i === dayIndex;

      const ring = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      ring.setAttribute("cx", String(x));
      ring.setAttribute("cy", String(y));
      ring.setAttribute("r", "9");
      ring.setAttribute("fill", "rgba(34,211,238,0.12)");
      ring.setAttribute("stroke", "rgba(34,211,238,0.28)");
      ring.setAttribute("stroke-width", "1");
      group.appendChild(ring);

      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "4.5");
      dot.setAttribute("fill", "var(--aqua)");
      dot.setAttribute("opacity", "0.95");
      if (isToday) dot.style.animation = "dot-pulse 2s ease-in-out infinite";
      group.appendChild(dot);
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
      const maxDay = Math.max(1, ...weeklyData.map((v) => Number(v) || 0));
      const pct = Math.round((count / maxDay) * 100);
      const isToday = i === dayIndex;

      tooltip.innerHTML = `
        <div class="gtt-top">
          <div class="gtt-day-label">${dayLabels[i]}${isToday ? `<span class="gtt-today-dot"></span>` : ""}</div>
          <div class="gtt-count-chip">${count} done</div>
        </div>
        <div class="gtt-bar-section">
          <div class="gtt-bar-track"><div class="gtt-bar-fill" style="width:0%"></div></div>
          <div class="gtt-bar-meta">${pct}% of best day &middot; +${count * 50} XP est.</div>
        </div>
        <div class="gtt-task-list">
          ${
            tasks.length > 0
              ? tasks
                  .slice(0, 4)
                  .map((t) => `<div class="gtt-pill">${t}</div>`)
                  .join("") +
                (tasks.length > 4
                  ? `<div class="gtt-more">+${tasks.length - 4} more</div>`
                  : "")
              : `<div class="gtt-no-tasks">No quests completed</div>`
          }
        </div>
      `;

      tooltip.hidden = false;
      tooltip.style.visibility = "hidden";

      const container = svg.closest(".line-graph");
      const containerRect =
        container?.getBoundingClientRect() || svg.getBoundingClientRect();
      const tooltipW = tooltip.offsetWidth || 228;
      const tooltipH = tooltip.offsetHeight || 160;
      const pad = 8;
      const anchorX = evt.clientX - containerRect.left;
      const anchorY = evt.clientY - containerRect.top;
      let left = Math.min(
        Math.max(pad, anchorX - tooltipW - 14),
        Math.max(pad, containerRect.width - tooltipW - pad),
      );
      let top = Math.min(
        Math.max(pad, anchorY - tooltipH / 2),
        Math.max(pad, containerRect.height - tooltipH - pad),
      );
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.visibility = "visible";

      requestAnimationFrame(() => {
        const bar = tooltip.querySelector(".gtt-bar-fill");
        if (bar) bar.style.width = `${pct}%`;
      });

      if (colHL) {
        const sr = svg.getBoundingClientRect();
        const scaleX = sr.width / 720;
        colHL.style.left = `${Math.round(sr.left - containerRect.left + (60 + i * 100 - 45) * scaleX)}px`;
        colHL.style.width = `${Math.round(90 * scaleX)}px`;
        colHL.classList.add("visible");
      }
    };

    const hideTooltip = () => {
      if (tooltip) {
        tooltip.hidden = true;
        tooltip.style.visibility = "";
      }
      if (colHL) colHL.classList.remove("visible");
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
  const previousTaskCount = getTodayCompletedTaskCount();
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

  const syncPromise = user?.uid
    ? mergeUserState(user.uid, {
      quests: state,
      stats: pointUpdate.stats,
      totalXP,
      completedQuests,
      dailyTaskHistory: readTaskHistoryMap(),
      statPoints: pointUpdate.statPoints,
      statUpgrades: pointUpdate.statUpgrades,
    }).catch((error) => {
      console.warn("Quest sync failed:", error);
    })
    : null;

  toast(
    nowComplete
      ? `Quest completed +${xpDelta} XP, +1 ${pointUpdate.statKey} point`
      : `Quest undone -${xpDelta} XP, -1 ${pointUpdate.statKey} point${buildUndoReverseText(pointUpdate)}`,
  );
  maybeQueueDashboardLockedInCelebration(
    previousTaskCount,
    nowComplete,
    user,
    accountState,
  );
  updateGraph();
  updateXP();
  renderStatsPanel();
  pumpDashboardCelebrations();
  if (syncPromise) await syncPromise;
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
