const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

const now = new Date();

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

  const progress = req > 0 ? (remaining / req) : 0;
  return { level, req, progress, remaining };
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();

  if (!user) return;

  const displayName = user.displayName || user.name || user.username || "User";

  const dashName = document.getElementById("dashName");
  const sideUser = document.getElementById("sideUser");

  if (dashName) dashName.textContent = displayName;
  if (sideUser) sideUser.textContent = displayName;

  // Load old quest rows from storage for backwards compatibility
  let completedQuests = JSON.parse(localStorage.getItem("completedQuests")) || [
    false,
    false,
    false,
  ];
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
    if (e.key === QUEST_STORAGE_KEY || e.key === XP_STORAGE_KEY) {
      updateXP();
      updateGraph();
      loadAndRenderPreviewTasks();
    }
  });
});

async function loadAndRenderPreviewTasks() {
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
    const challenges = await api.fetchAllChallenges(
      HABITICA_CONFIG.challenges,
    );
    if (challenges.length === 0) return;

    // Get first 3 challenges
    const firstThree = challenges.slice(0, 3);
    previewContainer.innerHTML = "";

    
    let state = {};
    try {
      const stored = localStorage.getItem(QUEST_STORAGE_KEY);
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
  const row = checkEl.closest(".quest-row");
  if (!row) return;

  const qid = row.getAttribute("data-qid");
  if (!qid) return;

  const nowComplete = row.classList.toggle("is-complete");

  if (checkEl) {
    checkEl.setAttribute("aria-pressed", nowComplete ? "true" : "false");
  }

 
  try {
    let state = JSON.parse(localStorage.getItem(QUEST_STORAGE_KEY)) || {};
    state.completed = state.completed || {};
    state.completed[qid] = nowComplete;
    localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(state));
  } catch {}

  
  let totalXP = 0;
  try {
    const state = JSON.parse(localStorage.getItem(QUEST_STORAGE_KEY)) || {};
    state.completed = state.completed || {};
    Object.keys(state.completed).forEach((questId) => {
      if (state.completed[questId]) {
        const questCard = document.querySelector(`[data-qid="${questId}"]`);
        if (questCard) {
          const xpValue = questCard.getAttribute("data-xp");
          if (xpValue) {
            totalXP += Number(xpValue);
          } else {
            
            const expEl = questCard.querySelector(".reward.exp");
            if (expEl) {
              const txt = expEl.textContent || "";
              const m = txt.match(/\+(\d+)/);
              if (m) totalXP += Number(m[1]);
            }
          }
        }
      }
    });
  } catch {}

  localStorage.setItem(XP_STORAGE_KEY, totalXP.toString());
  updateGraph();
  updateXP();
}

function updateXP() {
  let totalXP;
  try {
    const stored = localStorage.getItem(XP_STORAGE_KEY);
    totalXP = stored ? Math.max(0, Number(stored) || 0) : 0;
  } catch {
    totalXP = 0;
  }

  const info = getLevelInfo(totalXP);
  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");
  const tileXpGained = document.getElementById("tileXpGained");

  if (dashLevel) dashLevel.textContent = `LVL ${info.level}`;
  if (dashXpText) dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
  if (dashXpFill)
    dashXpFill.style.width = `${Math.min(info.progress * 100, 100)}%`;
  if (tileXpGained) tileXpGained.textContent = totalXP;
}

function updateGraph() {
  const dayOfWeek = new Date().getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; 

  let lastResetDate = localStorage.getItem("weeklyGraphResetDate");
  let weeklyData = JSON.parse(localStorage.getItem("weeklyQuestData")) || [
    0, 0, 0, 0, 0, 0, 0,
  ];

  
  const currentMonday = new Date();
  currentMonday.setDate(currentMonday.getDate() - dayIndex);
  currentMonday.setHours(0, 0, 0, 0);
  const currentMondayStr = currentMonday.toISOString().split("T")[0];

  if (lastResetDate !== currentMondayStr) {
    weeklyData = [0, 0, 0, 0, 0, 0, 0];
    localStorage.setItem("weeklyGraphResetDate", currentMondayStr);
  }

  // Count all completed quests from storage, not just visible preview quests
  let completedCount = 0;
  try {
    const state = JSON.parse(localStorage.getItem(QUEST_STORAGE_KEY)) || {};
    state.completed = state.completed || {};
    completedCount = Object.values(state.completed).filter(Boolean).length;
  } catch {}
  weeklyData[dayIndex] = completedCount;

  localStorage.setItem("weeklyQuestData", JSON.stringify(weeklyData));

  // Update all SVG graphs on the page with the new data
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
  });
}

window.completeQuest = function (checkEl) {
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
        let state = JSON.parse(localStorage.getItem(QUEST_STORAGE_KEY)) || {};
        state.completed = state.completed || {};
        state.completed[qid] = nowComplete;
        localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(state));
      } catch {}
    }

    let completedQuests = JSON.parse(
      localStorage.getItem("completedQuests")
    ) || [false, false, false];
    completedQuests[index] = nowComplete;
    localStorage.setItem("completedQuests", JSON.stringify(completedQuests));
  }

  
  let totalXP = 0;
  try {
    const state = JSON.parse(localStorage.getItem(QUEST_STORAGE_KEY)) || {};
    state.completed = state.completed || {};
    Object.keys(state.completed).forEach((qid) => {
      if (state.completed[qid]) {
        const card = document.querySelector(`[data-qid="${qid}"]`);
        if (card) {
          
          const xpValue = card.getAttribute("data-xp");
          if (xpValue) {
            totalXP += Number(xpValue);
          } else {
            
            const expEl = card.querySelector(".reward.exp");
            if (expEl) {
              const txt = expEl.textContent || "";
              const m = txt.match(/\+(\d+)/);
              if (m) totalXP += Number(m[1]);
            }
          }
        }
      }
    });
  } catch {}
  
  localStorage.setItem(XP_STORAGE_KEY, totalXP.toString());
  updateGraph();
  updateXP();
};
