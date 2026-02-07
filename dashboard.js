const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

function safeJSONParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function safeGetLS(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function safeSetLS(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function setText(id, t) {
  const el = document.getElementById(id);
  if (el) el.textContent = t;
}
function setWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${pct}%`;
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
  return { level, req, progress: clamp(progress, 0, 1), remaining };
}

function getCurrentUser() {
  return safeJSONParse(safeGetLS("aurakCurrentUser"), null);
}

function getQuestState() {
  const state = safeJSONParse(safeGetLS(QUEST_STORAGE_KEY), {});
  state.completed =
    state.completed && typeof state.completed === "object"
      ? state.completed
      : {};
  state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
  return state;
}

function setQuestState(state) {
  safeSetLS(QUEST_STORAGE_KEY, JSON.stringify(state));
}

function computeTotalXpFromState(state) {
  let total = 0;
  const completed = state.completed || {};
  const meta = state.meta || {};

  for (const qid of Object.keys(completed)) {
    if (!completed[qid]) continue;
    const xp = meta[qid]?.xp;
    if (Number.isFinite(xp)) total += xp;
  }
  return Math.max(0, Math.round(total));
}

function syncTotalXpCache(totalXp) {
  safeSetLS(XP_STORAGE_KEY, String(totalXp));
}

function renderXpUI(totalXp) {
  const info = getLevelInfo(totalXp);

  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");
  const tileXpGained = document.getElementById("tileXpGained");

  if (dashLevel) dashLevel.textContent = `LVL ${info.level}`;
  if (dashXpText) dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
  if (dashXpFill)
    dashXpFill.style.width = `${Math.round(info.progress * 100)}%`;

  if (tileXpGained) tileXpGained.textContent = String(totalXp);
}

function getISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function updateWeeklyGraphFromState(state) {
  const dayOfWeek = new Date().getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  let lastResetDate = safeGetLS("weeklyGraphResetDate", "");
  let weeklyData = safeJSONParse(
    safeGetLS("weeklyQuestData"),
    [0, 0, 0, 0, 0, 0, 0],
  );

  if (!Array.isArray(weeklyData) || weeklyData.length !== 7) {
    weeklyData = [0, 0, 0, 0, 0, 0, 0];
  }

  const currentMonday = new Date();
  currentMonday.setDate(currentMonday.getDate() - dayIndex);
  currentMonday.setHours(0, 0, 0, 0);
  const currentMondayStr = currentMonday.toISOString().split("T")[0];

  if (lastResetDate !== currentMondayStr) {
    weeklyData = [0, 0, 0, 0, 0, 0, 0];
    safeSetLS("weeklyGraphResetDate", currentMondayStr);
  }

  const completedCount = Object.values(state.completed || {}).filter(
    Boolean,
  ).length;
  weeklyData[dayIndex] = completedCount;
  safeSetLS("weeklyQuestData", JSON.stringify(weeklyData));

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

    path.setAttribute("d", points.length ? "M" + points.join(" L") : "");
  });
}

async function loadAndRenderPreviewTasks() {
  if (
    typeof HabiticaAPI === "undefined" ||
    typeof HABITICA_CONFIG === "undefined"
  )
    return;

  const api = new HabiticaAPI(HABITICA_CONFIG);
  const previewContainer = document.querySelector(".quests-preview");
  if (!previewContainer) return;

  try {
    const challenges = await api.fetchAllChallenges(HABITICA_CONFIG.challenges);
    if (!Array.isArray(challenges) || challenges.length === 0) return;

    const firstThree = challenges.slice(0, 3);
    previewContainer.innerHTML = "";

    const state = getQuestState();

    firstThree.forEach((challenge) => {
      const qid = String(challenge.id || "");
      if (!qid) return;

      const questName = challenge.name || challenge.shortName || "Unnamed";
      const category = challenge.category || "mental";
      const xpReward =
        HABITICA_CONFIG.defaultXpPerCategory?.[category] ??
        HABITICA_CONFIG.defaultXpPerCategory?.mental ??
        25;

      state.meta[qid] = {
        xp: Number(xpReward) || 0,
        name: String(questName),
        category: String(category),
      };

      const isDone = !!state.completed[qid];

      const row = document.createElement("div");
      row.className = "quest-row";
      row.setAttribute("data-qid", qid);
      if (isDone) row.classList.add("is-complete");

      row.innerHTML = `
        <span
          class="quest-check"
          role="button"
          tabindex="0"
          aria-label="${isDone ? "Mark quest as incomplete" : "Mark quest as complete"}"
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
        check.addEventListener("click", () => toggleQuestComplete(qid));
        check.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleQuestComplete(qid);
          }
        });
      }

      previewContainer.appendChild(row);
    });

    setQuestState(state);
    refreshXpAndGraph();
  } catch (err) {
    console.error("Error loading preview tasks:", err);
  }
}

function toggleQuestComplete(qid) {
  const state = getQuestState();
  const current = !!state.completed[qid];
  state.completed[qid] = !current;
  setQuestState(state);

  document
    .querySelectorAll(`[data-qid="${CSS.escape(qid)}"]`)
    .forEach((row) => {
      row.classList.toggle("is-complete", !current);
      const check = row.querySelector(".quest-check");
      if (check) {
        check.setAttribute("aria-pressed", !current ? "true" : "false");
        check.setAttribute(
          "aria-label",
          !current ? "Mark quest as incomplete" : "Mark quest as complete",
        );
      }
    });

  refreshXpAndGraph();
}

function refreshXpAndGraph() {
  const state = getQuestState();
  const totalXp = computeTotalXpFromState(state);
  syncTotalXpCache(totalXp);
  renderXpUI(totalXp);
  updateWeeklyGraphFromState(state);
}

function initThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  let isLight = false;
  try {
    isLight = localStorage.getItem("aurak_theme") === "light";
  } catch {}

  toggle.checked = isLight;

  toggle.addEventListener("change", () => {
    try {
      localStorage.setItem("aurak_theme", toggle.checked ? "light" : "dark");
    } catch {}
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();
  if (!user) return;

  const displayName = user.displayName || user.name || user.username || "User";
  const dashName = document.getElementById("dashName");
  const sideUser = document.getElementById("sideUser");
  if (dashName) dashName.textContent = displayName;
  if (sideUser) sideUser.textContent = displayName;

  initThemeToggle();

  refreshXpAndGraph();

  loadAndRenderPreviewTasks();

  window.addEventListener("storage", (e) => {
    if (e.key === QUEST_STORAGE_KEY || e.key === XP_STORAGE_KEY) {
      refreshXpAndGraph();
      loadAndRenderPreviewTasks();
    }
    if (e.key === "aurak_theme") {
      const t = document.getElementById("themeToggle");
      if (t) t.checked = localStorage.getItem("aurak_theme") === "light";
    }
  });
});
