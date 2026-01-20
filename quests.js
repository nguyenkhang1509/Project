(() => {
  "use strict";

  const STORAGE_KEY = "aurak_quests_v4";
  const XP_STORAGE_KEY = "totalXP";

  const BASE_XP_PER_LEVEL = 500;
  const LEVEL_GROWTH = 1.2;

  const tabs = Array.from(document.querySelectorAll(".qtab"));
  const tablist = document.querySelector(".qtabs");
  const showCompleted = document.getElementById("showCompleted");
  const questList = document.getElementById("questList");

  // Display username at the top
  function displayUsername() {
    try {
      const raw = localStorage.getItem("aurakCurrentUser");
      const user = raw ? JSON.parse(raw) : null;
      if (user) {
        const displayName = user.displayName || user.name || user.username || "User";
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

  // Display username on page load
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
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
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

  const state = loadState();
  state.completed = state.completed || {};
  state.activeFilter = state.activeFilter || "all";
  state.showCompleted =
    typeof state.showCompleted === "boolean" ? state.showCompleted : true;

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
      localStorage.setItem(XP_STORAGE_KEY, String(total));
    } catch {}
  }

  function loadXpTotal() {
    try {
      const stored = localStorage.getItem(XP_STORAGE_KEY);
      return stored ? Math.max(0, Number(stored) || 0) : 0;
    } catch {
      return 0;
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
      const type = card.dataset.type;
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

  function applyFilter() {
    const active = document.querySelector(".qtab.is-active");
    const filter = active ? active.dataset.filter : "all";
    const includeDone = showCompleted.checked;

    cards.forEach((card) => {
      const type = card.dataset.type;
      const isDone = card.dataset.completed === "true";
      const matchType = filter === "all" ? true : type === filter;
      const matchDone = includeDone ? true : !isDone;
      card.style.display = matchType && matchDone ? "" : "none";
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

  let xpTotal = loadXpTotal() || recomputeXpTotal();
  renderXp(xpTotal);
  persistXpTotal(xpTotal);

  function setCardCompleted(card, makeDone) {
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

    saveState(state);

    const before = xpTotal;
    xpTotal = recomputeXpTotal();
    persistXpTotal(xpTotal);
    renderXp(xpTotal);

    const delta = xpTotal - before;
    if (delta !== 0) {
      toast(
        delta > 0 ? `Quest completed +${delta} XP` : `Quest undone ${delta} XP`,
      );
    } else {
      toast(makeDone ? "Quest completed" : "Quest marked incomplete");
    }

    pulse(card);
    applyFilter();
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
    setCardCompleted(card, !isDone);
  }

  questList.addEventListener("click", handleQuestClick);

  async function initializeChallenges() {
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

      questList.innerHTML = "";
      cards = [];

      challenges.forEach((challenge) => {
        const cardHTML = api.generateCardHTML(challenge, challenge.category);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHTML;
        const card = tempDiv.firstElementChild;
        questList.appendChild(card);

        const qid = challenge.id;
        card.setAttribute("data-qid", qid);

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
      xpTotal = recomputeXpTotal();
      persistXpTotal(xpTotal);
      renderXp(xpTotal);
      applyFilter();
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
