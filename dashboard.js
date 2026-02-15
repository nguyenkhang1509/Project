import { getStorageKey, getCurrentUser } from "./userStore.js";

const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const TASK_HISTORY_KEY = "dailyTaskHistory";
const JOURNAL_KEY_BASE = "aurak_journal_v1";
const DASH_REFLECTION_KEY_BASE = "aurak_dashboard_reflection_v1";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

const now = new Date();

function getAccountStorageKey(baseKey) {
  return getStorageKey(baseKey);
}

function readUserProfile(uid) {
  if (!uid) return null;
  const key = getStorageKey("aurak_user_profile", uid);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

function writeTaskHistoryMap(map) {
  try {
    localStorage.setItem(
      getAccountStorageKey(TASK_HISTORY_KEY),
      JSON.stringify(map),
    );
  } catch {}
}

function updateTaskHistoryForToday(qid, qname, isDone) {
  const today = getISODate();
  const map = readTaskHistoryMap();
  const day = map[today] && typeof map[today] === "object" ? map[today] : {};

  if (isDone) day[qid] = qname || qid;
  else delete day[qid];

  if (Object.keys(day).length > 0) map[today] = day;
  else delete map[today];

  writeTaskHistoryMap(map);
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
  const day =
    map[dateStr] && typeof map[dateStr] === "object" ? { ...map[dateStr] } : {};
  completedIds.forEach((qid) => {
    if (!day[qid]) day[qid] = nameById.get(qid) || prettifyQuestId(qid);
  });
  map[dateStr] = day;
  writeTaskHistoryMap(map);
}

function rankFromAverage(avg) {
  if (!Number.isFinite(avg)) return "—";
  if (avg >= 90) return "S";
  if (avg >= 80) return "A";
  if (avg >= 60) return "B";
  if (avg >= 40) return "C";
  if (avg >= 20) return "D";
  return "E";
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();

  if (!user) return;

  if (!user.stats) {
    const profile = readUserProfile(user.uid);
    if (profile?.stats) {
      user.stats = profile.stats;
      localStorage.setItem("aurakCurrentUser", JSON.stringify(user));
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
    if (completedQuests[i]) {
      row.classList.add("is-complete");
      const check = row.querySelector(".quest-check");
      if (check) {
        check.setAttribute("aria-pressed", "true");
        check.setAttribute("aria-label", "Mark quest as incomplete");
      }
    }
  });

  if (user.stats) {
    const statKeys = [
      "Physical",
      "Intellectual",
      "Mental",
      "Confidence",
      "Discipline",
    ];
    const pillarRows = document.querySelectorAll(".pillar-row");

    statKeys.forEach((key, i) => {
      const row = pillarRows[i];
      if (!row) return;

      const nameEl = row.querySelector(".pillar-name");
      const valEl = row.querySelector(".pillar-val");
      const barFill = row.querySelector(".bar-fill");

      if (nameEl) nameEl.textContent = key;
      if (valEl) valEl.textContent = `${user.stats[key]} / 100`;
      if (barFill) barFill.style.width = `${user.stats[key]}%`;
    });

    const radar = document.getElementById("dashRadar");
    if (radar) {
      const outerPoints = [
        { x: 100, y: 18 },
        { x: 176, y: 72 },
        { x: 148, y: 162 },
        { x: 52, y: 162 },
        { x: 24, y: 72 },
      ];

      const points = statKeys
        .map((key, i) => {
          const pct = user.stats[key] / 100;
          const outer = outerPoints[i];
          const x = 100 + pct * (outer.x - 100);
          const y = 100 + pct * (outer.y - 100);
          return `${x},${y}`;
        })
        .join(" ");

      radar.setAttribute("points", points);
    }

    const dashLevel = document.getElementById("dashLevel");
    const dashXpText = document.getElementById("dashXpText");
    const dashXpFill = document.getElementById("dashXpFill");
  }

  updateGraph();
  updateXP();
  loadAndRenderPreviewTasks();

  window.addEventListener("storage", (e) => {
    if (
      e.key === getAccountStorageKey(QUEST_STORAGE_KEY) ||
      e.key === getAccountStorageKey(XP_STORAGE_KEY) ||
      e.key === getAccountStorageKey(TASK_HISTORY_KEY)
    ) {
      updateXP();
      updateGraph();
      loadAndRenderPreviewTasks();
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

function completePreviewQuest(checkEl) {
  ensureDailyQuestReset();
  const row = checkEl.closest(".quest-row");
  if (!row) return;

  const qid = row.getAttribute("data-qid");
  if (!qid) return;

  const nowComplete = row.classList.toggle("is-complete");

  if (checkEl) {
    checkEl.setAttribute("aria-pressed", nowComplete ? "true" : "false");
  }

  try {
    let state =
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
  updateTaskHistoryForToday(qid, qname, nowComplete);

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
  updateGraph();
  updateXP();
}

function updateXP() {
  let totalXP;
  try {
    const stored = localStorage.getItem(getAccountStorageKey(XP_STORAGE_KEY));
    totalXP = stored ? Math.max(0, Number(stored) || 0) : 0;
  } catch {
    totalXP = 0;
  }

  const info = getLevelInfo(totalXP);
  const user = getCurrentUser();
  const profile = readUserProfile(user?.uid);
  const stats = (user && user.stats) || (profile && profile.stats) || null;
  const avg = averageStat(stats);
  const rank = rankFromAverage(avg);
  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");
  const tileXpGained = document.getElementById("tileXpGained");
  const sideSub = document.getElementById("sideSub");

  if (dashLevel) dashLevel.textContent = `LVL ${info.level}`;
  if (dashXpText) dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
  if (dashXpFill)
    dashXpFill.style.width = `${Math.min(info.progress * 100, 100)}%`;
  if (tileXpGained) tileXpGained.textContent = totalXP;
  if (sideSub) sideSub.textContent = `Rank ${rank}`;
}

function updateGraph() {
  ensureDailyQuestReset();
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayOfWeek = new Date().getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const resetKey = getAccountStorageKey("weeklyGraphResetDate");
  const dataKey = getAccountStorageKey("weeklyQuestData");
  let lastResetDate = localStorage.getItem(resetKey);
  let weeklyData = JSON.parse(localStorage.getItem(dataKey)) || [
    0, 0, 0, 0, 0, 0, 0,
  ];
  const legacyResetDate = localStorage.getItem("weeklyGraphResetDate");
  const legacyWeeklyData = JSON.parse(
    localStorage.getItem("weeklyQuestData"),
  ) || [0, 0, 0, 0, 0, 0, 0];
  const hasCurrentData =
    Array.isArray(weeklyData) && weeklyData.some((v) => Number(v) > 0);
  const hasLegacyData =
    Array.isArray(legacyWeeklyData) &&
    legacyWeeklyData.some((v) => Number(v) > 0);

  if (!hasCurrentData && hasLegacyData) {
    weeklyData = legacyWeeklyData.slice(0, 7);
    if (!lastResetDate && legacyResetDate) lastResetDate = legacyResetDate;
  }

  const currentMonday = new Date();
  currentMonday.setDate(currentMonday.getDate() - dayIndex);
  currentMonday.setHours(0, 0, 0, 0);
  const currentMondayStr = currentMonday.toISOString().split("T")[0];

  const hasPersistedData =
    Array.isArray(weeklyData) && weeklyData.some((v) => Number(v) > 0);
  if (!lastResetDate) {
    localStorage.setItem(resetKey, currentMondayStr);
    localStorage.setItem("weeklyGraphResetDate", currentMondayStr);
  } else if (lastResetDate !== currentMondayStr) {
    weeklyData = [0, 0, 0, 0, 0, 0, 0];
    localStorage.setItem(resetKey, currentMondayStr);
    localStorage.setItem("weeklyGraphResetDate", currentMondayStr);
  } else if (!hasPersistedData && lastResetDate === currentMondayStr) {
    localStorage.setItem(resetKey, currentMondayStr);
    localStorage.setItem("weeklyGraphResetDate", currentMondayStr);
  }

  let completedCount = 0;
  try {
    const state =
      JSON.parse(
        localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY)),
      ) || {};
    state.completed = state.completed || {};
    completedCount = Object.values(state.completed).filter(Boolean).length;
  } catch {}
  weeklyData[dayIndex] = completedCount;

  localStorage.setItem(dataKey, JSON.stringify(weeklyData));
  localStorage.setItem("weeklyQuestData", JSON.stringify(weeklyData));

  const history = readTaskHistoryMap();
  const weeklyTasks = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentMonday);
    d.setDate(currentMonday.getDate() + i);
    const iso = getISODate(d);
    weeklyTasks.push(Object.values(history[iso] || {}).filter(Boolean));
  }

  const svgs = document.querySelectorAll(".line-graph-svg");
  svgs.forEach((svg) => {
    let path = svg.querySelector(".data-line");
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("data-line");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--aqua)");
      path.setAttribute("stroke-width", "3");
      svg.appendChild(path);
    }

    const points = weeklyData.map((val, i) => {
      const x = 60 + i * 100;
      const y = 220 - (Math.min(val, 20) / 20) * 200;
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
      const y = 220 - (Math.min(val, 20) / 20) * 200;
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

      const rect = svg.getBoundingClientRect();
      const container = svg.closest(".line-graph");
      const containerRect = container?.getBoundingClientRect() || rect;
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

window.completeQuest = function (checkEl) {
  ensureDailyQuestReset();
  const row = checkEl.closest(".quest-row");
  if (!row) return;
  const nowComplete = row.classList.toggle("is-complete");
  if (nowComplete) {
    checkEl.setAttribute("aria-pressed", "true");
    checkEl.setAttribute("aria-label", "Mark quest as incomplete");
  } else {
    checkEl.setAttribute("aria-pressed", "false");
    checkEl.setAttribute("aria-label", "Mark quest as complete");
  }

  const questRows = document.querySelectorAll(".quest-row");
  const index = Array.from(questRows).indexOf(row);
  if (index !== -1) {
    const qid = row.getAttribute("data-qid");
    if (qid) {
      try {
        let state =
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
      updateTaskHistoryForToday(qid, qname, nowComplete);
    }

    let completedQuests = JSON.parse(
      localStorage.getItem(getAccountStorageKey("completedQuests")),
    ) || [false, false, false];
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

  try {
    const raw = localStorage.getItem(getAccountStorageKey(QUEST_STORAGE_KEY));
    const state = raw ? JSON.parse(raw) : {};
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

document
  .getElementById("dashCheckinRefresh")
  .addEventListener("click", renderDailyCheckin);

document.addEventListener("DOMContentLoaded", renderDailyCheckin);
