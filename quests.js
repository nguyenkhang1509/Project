(() => {
  "use strict";

  const storeApiPromise = import("./userStore.js").catch(() => null);
  const hunterCelebrationApiPromise = import("./hunterCelebrations.js").catch(
    () => null,
  );

  async function getStoreApi() {
    return storeApiPromise;
  }

  async function getHunterCelebrationApi() {
    return hunterCelebrationApiPromise;
  }

  const STORAGE_KEY = "aurak_quests_v4";
  const XP_STORAGE_KEY = "totalXP";
  const DAILY_RESET_KEY = "dailyQuestResetDate";
  const TASK_HISTORY_KEY = "dailyTaskHistory";
  const USER_DOC_CACHE_BASE = "aurak_user_doc_cache_v1";

  const BASE_XP_PER_LEVEL = 500;
  const LEVEL_GROWTH = 1.2;
  const QUEST_CATEGORIES = [
    {
      key: "physical",
      title: "Physical",
      hint: "Train your body and stamina.",
    },
    {
      key: "intellectual",
      title: "Intellectual",
      hint: "Sharpen learning and problem solving.",
    },
    {
      key: "discipline",
      title: "Discipline",
      hint: "Build structure and self-control.",
    },
    {
      key: "confidence",
      title: "Confidence",
      hint: "Practice expression and leadership.",
    },
    { key: "mental", title: "Mental", hint: "Protect focus and recovery." },
  ];

  function getAccountKey(baseKey) {
    try {
      const raw = localStorage.getItem("aurakCurrentUser");
      const user = raw ? JSON.parse(raw) : null;
      if (user?.uid) {
        return `${baseKey}_${user.uid}`;
      }
    } catch {}
    return baseKey;
  }

  function readCurrentUser() {
    try {
      const raw = localStorage.getItem("aurakCurrentUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function readUserProfile(uid) {
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(`aurak_user_profile_${uid}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function pumpQuestCelebrations(targetEl = null) {
    const celebrationApi = await getHunterCelebrationApi();
    const currentUser = readCurrentUser();
    if (!celebrationApi?.pumpHunterCelebrationQueue || !currentUser?.uid) {
      return false;
    }

    return celebrationApi.pumpHunterCelebrationQueue({
      uid: currentUser.uid,
      returnTargetEl:
        targetEl ||
        document.querySelector(".qbar") ||
        document.querySelector(".main") ||
        questList,
      returnLabel: "Back to Quests",
    });
  }

  async function maybeQueueQuestLockedInCelebration(
    previousTaskCount,
    nowComplete,
    user,
    accountState,
  ) {
    if (!nowComplete || !user?.uid) return false;

    const celebrationApi = await getHunterCelebrationApi();
    if (!celebrationApi?.queueHunterLockedInCelebration) return false;

    const profile =
      (accountState?.profile &&
      typeof accountState.profile === "object" &&
      !Array.isArray(accountState.profile)
        ? accountState.profile
        : null) || readUserProfile(user.uid);
    const stats = accountState?.stats || user.stats || profile?.stats || null;

    return celebrationApi.queueHunterLockedInCelebration({
      uid: user.uid,
      profile,
      rank: resolveRank(accountState, stats),
      previousTaskCount,
      nextTaskCount: previousTaskCount + 1,
    });
  }

  function readAccountState(uid) {
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(`${USER_DOC_CACHE_BASE}_${uid}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeOptimisticAccountState(uid, patch) {
    if (!uid || !patch || typeof patch !== "object") return null;

    const current = readAccountState(uid) || {};
    const profile = {
      ...(current.profile && typeof current.profile === "object"
        ? current.profile
        : {}),
      ...(patch.profile && typeof patch.profile === "object"
        ? patch.profile
        : {}),
    };

    if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
      profile.displayName = patch.displayName;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "stats")) {
      profile.stats = patch.stats;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "survey")) {
      profile.survey = patch.survey;
    }

    const next = {
      ...current,
      ...patch,
      profile,
    };

    try {
      localStorage.setItem(
        `${USER_DOC_CACHE_BASE}_${uid}`,
        JSON.stringify(next),
      );
      return next;
    } catch {
      return current;
    }
  }

  async function syncCloudState(patch = null) {
    const cachedUser = readCurrentUser();
    if (patch && cachedUser?.uid) {
      writeOptimisticAccountState(cachedUser.uid, patch);
    }

    const api = await getStoreApi();
    const user = api?.getCurrentUser?.() || cachedUser;
    if (!api || !user?.uid) return;

    if (patch && typeof api.mergeUserState === "function") {
      await api.mergeUserState(user.uid, patch);
      return;
    }

    if (typeof api.syncUserState === "function") {
      await api.syncUserState(user.uid);
    }
  }

  function createEmptyStatPoints() {
    return {
      Physical: 0,
      Intellectual: 0,
      Mental: 0,
      Confidence: 0,
      Discipline: 0,
    };
  }

  function createEmptyStats() {
    return {
      Physical: 0,
      Intellectual: 0,
      Mental: 0,
      Confidence: 0,
      Discipline: 0,
    };
  }

  function normalizeStatPoints(api, value) {
    if (typeof api?.normalizeStatPoints === "function") {
      return api.normalizeStatPoints(value);
    }

    const next = createEmptyStatPoints();
    if (!value || typeof value !== "object") return next;

    Object.keys(next).forEach((key) => {
      const num = Math.floor(Number(value[key]));
      next[key] = Number.isFinite(num) ? Math.max(0, num) : 0;
    });

    return next;
  }

  function getStatKeyFromCategory(api, category) {
    if (typeof api?.getStatKeyFromCategory === "function") {
      return api.getStatKeyFromCategory(category);
    }

    const map = {
      physical: "Physical",
      intellectual: "Intellectual",
      mental: "Mental",
      confidence: "Confidence",
      discipline: "Discipline",
    };
    const safeCategory = String(category || "")
      .trim()
      .toLowerCase();
    return map[safeCategory] || "Physical";
  }

  function applyQuestPointChange(
    api,
    stats,
    statPoints,
    statUpgrades,
    category,
    delta,
  ) {
    if (typeof api?.applyQuestPointChange === "function") {
      return api.applyQuestPointChange(
        stats,
        statPoints,
        statUpgrades,
        category,
        delta,
      );
    }

    const next = normalizeStatPoints(api, statPoints);
    const statKey = getStatKeyFromCategory(api, category);
    const nextValue = next[statKey] + Math.floor(Number(delta) || 0);
    const safeStats =
      stats && typeof stats === "object"
        ? { ...createEmptyStats(), ...stats }
        : createEmptyStats();

    next[statKey] = Math.max(0, nextValue);
    return {
      stats: safeStats,
      statPoints: next,
      statUpgrades: Array.isArray(statUpgrades) ? statUpgrades.slice() : [],
      statKey,
      autoReversedLevels: 0,
      autoReversedTargets: {},
      unresolvedShortfall: nextValue < 0 ? Math.abs(nextValue) : 0,
    };
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

  function rankFromAverage(avg) {
    if (!Number.isFinite(avg)) return "—";
    if (avg >= 90) return "S";
    if (avg >= 75) return "A";
    if (avg >= 60) return "B";
    if (avg >= 45) return "C";
    if (avg >= 25) return "D";
    return "E";
  }

  function resolveRank(accountState, stats) {
    const rank = String(accountState?.rank || "")
      .trim()
      .toUpperCase();
    if (["S", "A", "B", "C", "D", "E"].includes(rank)) return rank;
    return rankFromAverage(averageStat(stats));
  }

  function getISODate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const tabs = Array.from(document.querySelectorAll(".qtab"));
  const tablist = document.querySelector(".qtabs");
  const showCompleted = document.getElementById("showCompleted");
  const questList = document.getElementById("questList");

  function displayUsername() {
    try {
      const raw = localStorage.getItem("aurakCurrentUser");
      const user = raw ? JSON.parse(raw) : null;
      if (user) {
        const displayName =
          user.displayName || user.name || user.username || "User";
        const dashName = document.getElementById("dashName");
        const sideUser = document.getElementById("sideUser");
        if (dashName) dashName.textContent = displayName;
        if (sideUser) sideUser.textContent = displayName;
      }
    } catch {}
  }

  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!questList || !showCompleted || tabs.length === 0) {
    return;
  }

  displayUsername();

  let cards = Array.from(document.querySelectorAll(".qcard"));

  function safeId(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function getCardId(card, index) {
    const name =
      card.querySelector(".qname")?.textContent?.trim() || `q${index}`;
    const type = card.dataset.type || "all";
    return card.getAttribute("data-qid") || `${type}__${safeId(name)}`;
  }

  function getSlotByIndex(index) {
    return QUEST_CATEGORIES[index % QUEST_CATEGORIES.length]?.key || "physical";
  }

  function buildSectionShell() {
    if (!questList) return;
    questList.innerHTML = "";
    QUEST_CATEGORIES.forEach((slot) => {
      const section = document.createElement("section");
      section.className = "qsection";
      section.setAttribute("data-slot", slot.key);
      section.innerHTML = `
        <header class="qsection-head">
          <h3 class="qsection-title">${slot.title}</h3>
          <p class="qsection-hint">${slot.hint}</p>
        </header>
        <div class="qsection-list" data-slot-list="${slot.key}"></div>
      `;
      questList.appendChild(section);
    });
  }

  function renderCardsBySlot() {
    buildSectionShell();
    cards.forEach((card, index) => {
      const slot = card.dataset.slot || getSlotByIndex(index);
      card.dataset.slot = slot;
      const bucket = questList.querySelector(`[data-slot-list="${slot}"]`);
      if (bucket) bucket.appendChild(card);
    });
  }

  function parseExp(card) {
    const expEl = card.querySelector(".reward.exp");
    if (!expEl) return 0;
    const txt = expEl.textContent || "";
    const m = txt.match(/\+(\d+)\s*EXP/i);
    const val = m ? Number(m[1]) : 0;
    return Number.isFinite(val) && val > 0 ? val : 0;
  }

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(getAccountKey(STORAGE_KEY));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveState(state, syncCloud = true) {
    try {
      localStorage.setItem(getAccountKey(STORAGE_KEY), JSON.stringify(state));
    } catch {}
    if (!syncCloud) return;
    void syncCloudState({ quests: state }).catch((error) => {
      console.warn("Quest state sync failed:", error);
    });
  }

  function readTaskHistoryMap() {
    try {
      const raw = localStorage.getItem(getAccountKey(TASK_HISTORY_KEY));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeTaskHistoryMap(map, syncCloud = true) {
    try {
      localStorage.setItem(
        getAccountKey(TASK_HISTORY_KEY),
        JSON.stringify(map),
      );
    } catch {}
    if (!syncCloud) return;
    void syncCloudState({ dailyTaskHistory: map }).catch((error) => {
      console.warn("Task history sync failed:", error);
    });
  }

  function updateTaskHistoryForToday(qid, qname, isDone, syncCloud = true) {
    const today =
      localStorage.getItem(getAccountKey(DAILY_RESET_KEY)) || getISODate();
    const map = readTaskHistoryMap();
    const day = map[today] && typeof map[today] === "object" ? map[today] : {};

    if (isDone) {
      day[qid] = qname || qid;
    } else {
      delete day[qid];
    }

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

  function snapshotCompletedTasksForDate(state, dateStr) {
    if (!state || typeof state !== "object" || !dateStr) return;
    const completed =
      state.completed && typeof state.completed === "object"
        ? state.completed
        : {};
    const completedIds = Object.keys(completed).filter(
      (qid) => !!completed[qid],
    );
    if (!completedIds.length) return;

    const nameById = new Map();
    cards.forEach((card, index) => {
      const qid = getCardId(card, index);
      const qname = card.querySelector(".qname")?.textContent?.trim();
      if (qid && qname) nameById.set(qid, qname);
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

  function ensureDailyQuestReset(state) {
    const today = getISODate();
    const resetKey = getAccountKey(DAILY_RESET_KEY);
    const lastReset = localStorage.getItem(resetKey);
    if (lastReset === today) return false;

    if (lastReset) snapshotCompletedTasksForDate(state, lastReset);
    state.completed = {};
    saveState(state, false);
    try {
      localStorage.setItem(
        getAccountKey("completedQuests"),
        JSON.stringify([]),
      );
    } catch {}
    localStorage.setItem(resetKey, today);
    void syncCloudState({
      quests: state,
      completedQuests: [],
      dailyQuestResetDate: today,
      dailyTaskHistory: readTaskHistoryMap(),
    }).catch((error) => {
      console.warn("Daily quest reset sync failed:", error);
    });
    return true;
  }

  function ensureToastEl() {
    let el = document.getElementById("aurak-toast");
    if (el) return el;
    el = document.createElement("div");
    el.id = "aurak-toast";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    return el;
  }

  function toast(message) {
    const t = ensureToastEl();
    t.textContent = message;

    clearTimeout(t._hideTimer);

    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0px)";

    if (prefersReducedMotion) {
      t._hideTimer = setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateX(-50%) translateY(8px)";
      }, 900);
      return;
    }

    t.animate(
      [
        { opacity: 0, transform: "translateX(-50%) translateY(8px)" },
        { opacity: 1, transform: "translateX(-50%) translateY(0px)" },
      ],
      { duration: 160, easing: "ease-out", fill: "forwards" },
    );

    t._hideTimer = setTimeout(() => {
      t.animate(
        [
          { opacity: 1, transform: "translateX(-50%) translateY(0px)" },
          { opacity: 0, transform: "translateX(-50%) translateY(8px)" },
        ],
        { duration: 200, easing: "ease-in", fill: "forwards" },
      );
    }, 1200);
  }

  function pulse(card) {
    if (prefersReducedMotion) return;
    card.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.015)" },
        { transform: "scale(1)" },
      ],
      { duration: 180, easing: "ease-out" },
    );
  }

  function burstParticles(card) {
    if (prefersReducedMotion) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = [
      "rgba(34,211,238,.9)",
      "rgba(168,85,247,.9)",
      "rgba(96,165,250,.9)",
      "rgba(52,211,153,.9)",
      "rgba(34,211,238,.6)",
      "rgba(168,85,247,.6)",
    ];
    for (let i = 0; i < 14; i++) {
      const dot = document.createElement("div");
      const size = 4 + Math.random() * 4;
      const dist = 55 + Math.random() * 50;
      const angle = (360 / 14) * i + Math.random() * 8;
      const dx = Math.cos((angle * Math.PI) / 180) * dist;
      const dy = Math.sin((angle * Math.PI) / 180) * dist;
      Object.assign(dot.style, {
        position: "fixed",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: colors[i % colors.length],
        left: `${cx}px`,
        top: `${cy}px`,
        pointerEvents: "none",
        zIndex: "9999",
        transform: "translate(-50%,-50%)",
      });
      document.body.appendChild(dot);
      dot
        .animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            {
              transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(0)`,
              opacity: 0,
            },
          ],
          {
            duration: 550 + Math.random() * 150,
            delay: Math.random() * 50,
            easing: "cubic-bezier(0,0,0.2,1)",
            fill: "forwards",
          },
        )
        .addEventListener("finish", () => dot.remove());
    }
    const chip = document.createElement("div");
    const xpText = card.querySelector(".reward")?.textContent?.trim() || "+XP";
    Object.assign(chip.style, {
      position: "fixed",
      left: `${cx}px`,
      top: `${cy - 20}px`,
      transform: "translate(-50%,0)",
      background: "rgba(34,211,238,0.15)",
      border: "1px solid rgba(34,211,238,0.5)",
      color: "rgba(34,211,238,1)",
      fontSize: "13px",
      fontWeight: "700",
      padding: "4px 12px",
      borderRadius: "999px",
      pointerEvents: "none",
      zIndex: "9999",
      whiteSpace: "nowrap",
    });
    chip.textContent = xpText;
    document.body.appendChild(chip);
    chip
      .animate(
        [
          { transform: "translate(-50%,0)", opacity: 1 },
          { transform: "translate(-50%,-52px)", opacity: 0 },
        ],
        { duration: 750, easing: "cubic-bezier(0,0,0.2,1)", fill: "forwards" },
      )
      .addEventListener("finish", () => chip.remove());
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

    const progress = req > 0 ? clamp(remaining / req, 0, 1) : 0;
    return { level, req, progress, remaining };
  }

  function renderXp(totalXp) {
    if (!dashLevel || !dashXpText || !dashXpFill) return;

    const xp = Number.isFinite(totalXp) ? totalXp : 0;
    const info = getLevelInfo(xp);
    const user = readCurrentUser();
    const accountState = readAccountState(user?.uid);
    const profile =
      (accountState?.profile &&
      typeof accountState.profile === "object" &&
      !Array.isArray(accountState.profile)
        ? accountState.profile
        : null) || readUserProfile(user?.uid);
    const stats =
      accountState?.stats ||
      (user && user.stats) ||
      (profile && profile.stats) ||
      null;
    const rank = resolveRank(accountState, stats);
    const sideSub = document.getElementById("sideSub");

    dashLevel.textContent = `LVL ${info.level}`;
    dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
    dashXpFill.style.width = `${Math.round(info.progress * 100)}%`;
    if (sideSub) sideSub.textContent = `Rank ${rank}`;
  }

  const state = loadState();
  state.completed = state.completed || {};
  state.activeFilter = state.activeFilter || "all";
  state.showCompleted =
    typeof state.showCompleted === "boolean" ? state.showCompleted : true;

  ensureDailyQuestReset(state);

  cards.forEach((card, i) => {
    const qid = getCardId(card, i);
    card.setAttribute("data-qid", qid);

    const isDone = !!state.completed[qid];
    card.dataset.completed = isDone ? "true" : "false";
    card.classList.toggle("is-done", isDone);

    const check = card.querySelector(".qcheck");
    if (check) check.setAttribute("aria-pressed", isDone ? "true" : "false");

    const btn = card.querySelector(".qbtn");
    if (btn) btn.textContent = isDone ? "Completed" : "Complete";
  });

  showCompleted.checked = !!state.showCompleted;

  function recomputeXpTotal() {
    let total = 0;
    cards.forEach((card) => {
      if (card.dataset.completed === "true") total += parseExp(card);
    });
    return Math.max(0, total);
  }

  function persistXpTotal(total) {
    try {
      localStorage.setItem(getAccountKey(XP_STORAGE_KEY), String(total));
    } catch {}
  }

  function syncXpTotal(total) {
    void syncCloudState({ totalXP: total }).catch((error) => {
      console.warn("XP sync failed:", error);
    });
  }

  function loadXpTotal() {
    try {
      const stored = localStorage.getItem(getAccountKey(XP_STORAGE_KEY));
      if (stored === null) return null;
      return Math.max(0, Number(stored) || 0);
    } catch {
      return null;
    }
  }

  function updateCountsRemainingOnly() {
    const countBy = {
      all: 0,
      physical: 0,
      intellectual: 0,
      discipline: 0,
      confidence: 0,
      mental: 0,
    };

    cards.forEach((card) => {
      const slot = card.dataset.slot || "physical";
      const isDone = card.dataset.completed === "true";
      if (isDone) return;

      countBy.all += 1;
      if (countBy[slot] !== undefined) countBy[slot] += 1;
    });

    document.querySelectorAll(".qcount").forEach((el) => {
      const key = el.getAttribute("data-count");
      if (!key) return;
      el.textContent = String(countBy[key] ?? 0);
    });
  }

  function applyFilter() {
    const active = document.querySelector(".qtab.is-active");
    const filter = active ? active.dataset.filter : "all";
    const includeDone = showCompleted.checked;

    cards.forEach((card) => {
      const slot = card.dataset.slot || "physical";
      const isDone = card.dataset.completed === "true";
      const matchType = filter === "all" ? true : slot === filter;
      const matchDone = includeDone ? true : !isDone;
      card.style.display = matchType && matchDone ? "" : "none";
    });

    document.querySelectorAll(".qsection").forEach((section) => {
      const hasVisibleCards = Array.from(
        section.querySelectorAll(".qcard"),
      ).some((card) => card.style.display !== "none");
      section.style.display = hasVisibleCards ? "" : "none";
    });

    updateCountsRemainingOnly();
  }

  tabs.forEach((t) => {
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", "false");
    t.setAttribute("tabindex", "-1");
  });

  function setActiveTab(filter, focusButton) {
    tabs.forEach((t) => {
      const isActive = (t.dataset.filter || "all") === filter;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
      t.setAttribute("tabindex", isActive ? "0" : "-1");
      if (isActive && focusButton) t.focus();
    });

    state.activeFilter = filter;
    saveState(state);
    applyFilter();
  }

  if (tabs.some((t) => t.dataset.filter === state.activeFilter)) {
    setActiveTab(state.activeFilter, false);
  } else {
    setActiveTab("all", false);
  }

  if (tablist) {
    tablist.addEventListener("keydown", (e) => {
      const isArrow = e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isArrow) return;

      const current = document.querySelector(".qtab.is-active");
      const idx = tabs.indexOf(current);
      if (idx < 0) return;

      e.preventDefault();
      const next =
        e.key === "ArrowRight"
          ? (idx + 1) % tabs.length
          : (idx - 1 + tabs.length) % tabs.length;

      setActiveTab(tabs[next].dataset.filter || "all", true);
    });
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.filter || "all", false);
    });
  });

  let xpTotal = loadXpTotal();
  if (!Number.isFinite(xpTotal)) xpTotal = recomputeXpTotal();
  renderXp(xpTotal);
  persistXpTotal(xpTotal);
  syncXpTotal(xpTotal);

  async function setCardCompleted(card, makeDone) {
    const qid = card.getAttribute("data-qid");
    if (!qid) return;

    const wasDone = card.dataset.completed === "true";
    if (wasDone === makeDone) return;
    const previousTaskCount = Object.values(state.completed || {}).filter(
      Boolean,
    ).length;

    const api = await getStoreApi();
    const currentUser = api?.getCurrentUser?.() || readCurrentUser();
    const accountState =
      typeof api?.readCachedAccountState === "function" && currentUser?.uid
        ? api.readCachedAccountState(currentUser.uid)
        : null;
    const pointUpdate = applyQuestPointChange(
      api,
      accountState?.stats,
      accountState?.statPoints,
      accountState?.statUpgrades,
      card.dataset.slot || getSlotByIndex(0),
      makeDone ? 1 : -1,
    );

    card.dataset.completed = makeDone ? "true" : "false";
    card.classList.toggle("is-done", makeDone);
    state.completed[qid] = makeDone;

    const check = card.querySelector(".qcheck");
    if (check) check.setAttribute("aria-pressed", makeDone ? "true" : "false");

    const btn = card.querySelector(".qbtn");
    if (btn) btn.textContent = makeDone ? "Completed" : "Complete";

    saveState(state, false);
    const qname = card.querySelector(".qname")?.textContent?.trim() || qid;
    updateTaskHistoryForToday(qid, qname, makeDone, false);

    const xpDelta = parseExp(card);
    const signedDelta = makeDone ? xpDelta : -xpDelta;
    xpTotal = Math.max(0, xpTotal + signedDelta);
    persistXpTotal(xpTotal);
    const nextPoints = pointUpdate.statPoints;

    void syncCloudState({
      quests: state,
      totalXP: xpTotal,
      dailyTaskHistory: readTaskHistoryMap(),
      stats: pointUpdate.stats,
      statPoints: nextPoints,
      statUpgrades: pointUpdate.statUpgrades,
    }).catch((error) => {
      console.warn("Quest progress sync failed:", error);
    });
    renderXp(xpTotal);

    const pointLabel = pointUpdate.statKey;
    if (signedDelta !== 0) {
      toast(
        signedDelta > 0
          ? `Quest completed +${signedDelta} XP, +1 ${pointLabel} point`
          : `Quest undone ${signedDelta} XP, -1 ${pointLabel} point${buildUndoReverseText(pointUpdate)}`,
      );
    } else {
      toast(
        makeDone
          ? `Quest completed +1 ${pointLabel} point`
          : `Quest marked incomplete -1 ${pointLabel} point${buildUndoReverseText(pointUpdate)}`,
      );
    }

    pulse(card);
    if (makeDone) burstParticles(card);
    applyFilter();
    await maybeQueueQuestLockedInCelebration(
      previousTaskCount,
      makeDone,
      currentUser,
      accountState,
    );
    void pumpQuestCelebrations();
  }

  showCompleted.addEventListener("change", () => {
    state.showCompleted = !!showCompleted.checked;
    saveState(state);
    applyFilter();
  });

  function handleQuestClick(e) {
    const hit = e.target.closest(".qbtn, .qcheck");
    if (!hit) return;

    const card = e.target.closest(".qcard");
    if (!card) return;

    const isDone = card.dataset.completed === "true";
    void setCardCompleted(card, !isDone);
  }

  questList.addEventListener("click", handleQuestClick);

  async function initializeChallenges() {
    try {
      await syncCloudState();
      Object.assign(state, loadState());
      state.completed = state.completed || {};
      state.activeFilter = state.activeFilter || "all";
      state.showCompleted =
        typeof state.showCompleted === "boolean" ? state.showCompleted : true;
      displayUsername();
    } catch (error) {
      console.warn("Initial quest sync failed:", error);
    }

    if (
      typeof HabiticaAPI === "undefined" ||
      typeof HABITICA_CONFIG === "undefined"
    ) {
      console.error("HabiticaAPI or HABITICA_CONFIG not loaded");
      questList.innerHTML =
        '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">Error: Configuration not loaded. Please check habiticaConfig.js and habiticaAPI.js</p>';
      return;
    }

    const api = new HabiticaAPI(HABITICA_CONFIG);

    try {
      const challenges = await api.fetchAllChallenges(
        HABITICA_CONFIG.challenges,
      );

      if (challenges.length === 0) {
        questList.innerHTML =
          '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No challenges configured. Add challenge IDs to habiticaConfig.js</p>';
        return;
      }

      cards = [];

      challenges.forEach((challenge, index) => {
        const cardHTML = api.generateCardHTML(challenge, challenge.category);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHTML;
        const card = tempDiv.firstElementChild;

        const qid = challenge.id;
        card.setAttribute("data-qid", qid);
        card.dataset.slot = challenge.category || getSlotByIndex(index);

        const isDone = !!state.completed[qid];
        card.dataset.completed = isDone ? "true" : "false";
        card.classList.toggle("is-done", isDone);

        const check = card.querySelector(".qcheck");
        if (check)
          check.setAttribute("aria-pressed", isDone ? "true" : "false");

        const btn = card.querySelector(".qbtn");
        if (btn) btn.textContent = isDone ? "Completed" : "Complete";

        cards.push(card);
      });

      renderCardsBySlot();

      showCompleted.checked = !!state.showCompleted;
      const storedXp = loadXpTotal();
      xpTotal = Number.isFinite(storedXp) ? storedXp : recomputeXpTotal();
      persistXpTotal(xpTotal);
      renderXp(xpTotal);
      applyFilter();
      void pumpQuestCelebrations();
    } catch (error) {
      console.error("Error loading challenges:", error);
      questList.innerHTML =
        '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">Error loading challenges. Check console for details.</p>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeChallenges);
  } else {
    initializeChallenges();
  }
})();
