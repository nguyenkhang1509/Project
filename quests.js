(() => {
  "use strict";

  const QUEST_STORAGE_KEY = "aurak_quests_v4";
  const XP_STORAGE_KEY = "totalXP";
  const BASE_XP_PER_LEVEL = 500;
  const LEVEL_GROWTH = 1.2;

  const tabs = Array.from(document.querySelectorAll(".qtab"));
  const tablist = document.querySelector(".qtabs");
  const showCompleted = document.getElementById("showCompleted");
  const questList = document.getElementById("questList");

  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!questList || !showCompleted || tabs.length === 0) return;

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

  function displayUsername() {
    const user = safeJSONParse(safeGetLS("aurakCurrentUser"), null);
    if (!user) return;
    const displayName =
      user.displayName || user.name || user.username || "User";
    const dashName = document.getElementById("dashName");
    const sideUser = document.getElementById("sideUser");
    if (dashName) dashName.textContent = displayName;
    if (sideUser) sideUser.textContent = displayName;
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
    dashLevel.textContent = `LVL ${info.level}`;
    dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
    dashXpFill.style.width = `${Math.round(info.progress * 100)}%`;
  }

  function getQuestState() {
    const state = safeJSONParse(safeGetLS(QUEST_STORAGE_KEY), {});
    state.completed =
      state.completed && typeof state.completed === "object"
        ? state.completed
        : {};
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.activeFilter = state.activeFilter || "all";
    state.showCompleted =
      typeof state.showCompleted === "boolean" ? state.showCompleted : true;
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

  function syncXpCache(totalXp) {
    safeSetLS(XP_STORAGE_KEY, String(totalXp));
  }

  function refreshXpFromState(state) {
    const totalXp = computeTotalXpFromState(state);
    syncXpCache(totalXp);
    renderXp(totalXp);
    return totalXp;
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
        { transform: "scale(1.01)" },
        { transform: "scale(1)" },
      ],
      { duration: 180, easing: "ease-out" },
    );
  }

  function updateCountsRemainingOnly(cards) {
    const countBy = {
      all: 0,
      physical: 0,
      intellectual: 0,
      discipline: 0,
      confidence: 0,
      mental: 0,
    };

    cards.forEach((card) => {
      const type = card.dataset.type || "all";
      const isDone = card.dataset.completed === "true";
      if (isDone) return;
      countBy.all += 1;
      if (countBy[type] !== undefined) countBy[type] += 1;
    });

    document.querySelectorAll(".qcount").forEach((el) => {
      const key = el.getAttribute("data-count");
      if (!key) return;
      el.textContent = String(countBy[key] ?? 0);
    });
  }

  function applyFilter(cards, state) {
    const active = document.querySelector(".qtab.is-active");
    const filter = active ? active.dataset.filter : "all";
    const includeDone = showCompleted.checked;

    cards.forEach((card) => {
      const type = card.dataset.type || "all";
      const isDone = card.dataset.completed === "true";
      const matchType = filter === "all" ? true : type === filter;
      const matchDone = includeDone ? true : !isDone;
      card.style.display = matchType && matchDone ? "" : "none";
    });

    updateCountsRemainingOnly(cards);
  }

  function setActiveTab(filter, focusButton, state, cards) {
    tabs.forEach((t) => {
      const isActive = (t.dataset.filter || "all") === filter;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
      t.setAttribute("tabindex", isActive ? "0" : "-1");
      if (isActive && focusButton) t.focus();
    });

    state.activeFilter = filter;
    setQuestState(state);
    applyFilter(cards, state);
  }

  function initTabs(state, cards) {
    tabs.forEach((t) => {
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", "false");
      t.setAttribute("tabindex", "-1");
    });

    const initial = tabs.some((t) => t.dataset.filter === state.activeFilter)
      ? state.activeFilter
      : "all";

    setActiveTab(initial, false, state, cards);

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

        setActiveTab(tabs[next].dataset.filter || "all", true, state, cards);
      });
    }

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveTab(btn.dataset.filter || "all", false, state, cards);
      });
    });
  }

  function setCardCompleted(card, makeDone, state) {
    const qid = card.getAttribute("data-qid");
    if (!qid) return;

    const wasDone = card.dataset.completed === "true";
    if (wasDone === makeDone) return;

    card.dataset.completed = makeDone ? "true" : "false";
    card.classList.toggle("is-done", makeDone);
    state.completed[qid] = makeDone;

    const check = card.querySelector(".qcheck");
    if (check) check.setAttribute("aria-pressed", makeDone ? "true" : "false");

    const btn = card.querySelector(".qbtn");
    if (btn) btn.textContent = makeDone ? "Completed" : "Complete";

    setQuestState(state);

    const before = Number(safeGetLS(XP_STORAGE_KEY, "0")) || 0;
    const after = refreshXpFromState(state);
    const delta = after - before;

    if (delta !== 0) {
      toast(
        delta > 0 ? `Quest completed +${delta} XP` : `Quest undone ${delta} XP`,
      );
    } else {
      toast(makeDone ? "Quest completed" : "Quest marked incomplete");
    }

    pulse(card);
  }

  function handleQuestClick(e, state, cards) {
    const hit = e.target.closest(".qbtn, .qcheck");
    if (!hit) return;

    const card = e.target.closest(".qcard");
    if (!card) return;

    const isDone = card.dataset.completed === "true";
    setCardCompleted(card, !isDone, state);

    applyFilter(cards, state);
  }

  async function initializeChallenges() {
    displayUsername();

    if (
      typeof HabiticaAPI === "undefined" ||
      typeof HABITICA_CONFIG === "undefined"
    ) {
      questList.innerHTML =
        '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">Error: Configuration not loaded. Please check habiticaConfig.js and habiticaAPI.js</p>';
      return;
    }

    const api = new HabiticaAPI(HABITICA_CONFIG);
    const state = getQuestState();

    try {
      const challenges = await api.fetchAllChallenges(
        HABITICA_CONFIG.challenges,
      );

      if (!Array.isArray(challenges) || challenges.length === 0) {
        questList.innerHTML =
          '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No challenges configured. Add challenge IDs to habiticaConfig.js</p>';
        return;
      }

      questList.innerHTML = "";
      const cards = [];

      challenges.forEach((challenge) => {
        const cardHTML = api.generateCardHTML(challenge, challenge.category);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHTML;
        const card = tempDiv.firstElementChild;
        if (!card) return;

        questList.appendChild(card);

        const qid = String(challenge.id || "");
        if (!qid) return;

        card.setAttribute("data-qid", qid);

        const category = challenge.category || card.dataset.type || "mental";
        const xpReward =
          HABITICA_CONFIG.defaultXpPerCategory?.[category] ??
          HABITICA_CONFIG.defaultXpPerCategory?.mental ??
          25;

        state.meta[qid] = {
          xp: Number(xpReward) || 0,
          name: String(challenge.name || challenge.shortName || "Unnamed"),
          category: String(category),
        };

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

      showCompleted.checked = !!state.showCompleted;

      setQuestState(state);
      refreshXpFromState(state);

      initTabs(state, cards);
      applyFilter(cards, state);

      showCompleted.addEventListener("change", () => {
        const s = getQuestState();
        s.showCompleted = !!showCompleted.checked;
        setQuestState(s);
        applyFilter(cards, s);
      });

      questList.addEventListener("click", (e) => {
        const s = getQuestState();
        handleQuestClick(e, s, cards);
      });

      window.addEventListener("storage", (e) => {
        if (e.key === QUEST_STORAGE_KEY || e.key === XP_STORAGE_KEY) {
          const s = getQuestState();
          refreshXpFromState(s);
          applyFilter(cards, s);
        }
        if (e.key === "aurak_theme") {
          const t = document.getElementById("themeToggle");
          if (t) t.checked = localStorage.getItem("aurak_theme") === "light";
        }
      });
    } catch (error) {
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
