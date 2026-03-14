import {
  getCurrentUser,
  getStorageKey,
  mergeUserState,
  readCachedUserProfile,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

const JOURNAL_KEY_BASE = "aurak_journal_v1";
const XP_KEY_BASE = "totalXP";
const DASH_REFLECTION_KEY_BASE = "aurak_dashboard_reflection_v1";
const RECENT_COLLAPSE_KEY_BASE = "aurak_journal_recent_collapsed_v1";

const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

const stepsCount = 6;

const state = {
  mood: null,
  rest: 55,
  focus: new Set(),
  reflection: "",
  helpful: null,
};

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function getISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(iso) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatWeekdayShort(iso) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { weekday: "short" });
  } catch {
    return "—";
  }
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
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

function readUserProfile(uid) {
  return uid ? readCachedUserProfile(uid) : null;
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
  if (avg >= 80) return "A";
  if (avg >= 60) return "B";
  if (avg >= 40) return "C";
  if (avg >= 20) return "D";
  return "E";
}

function setActiveSidebar() {
  const links = Array.from(document.querySelectorAll(".side-nav .side-link"));
  links.forEach((a) => a.classList.remove("active"));
  const current = links.find((a) =>
    (a.getAttribute("href") || "").includes("journal.html"),
  );
  if (current) current.classList.add("active");
}

function hydrateIdentity() {
  const user = getCurrentUser();
  const sideUser = document.getElementById("sideUser");
  const sideSub = document.getElementById("sideSub");
  const dashName = document.getElementById("dashName");
  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");

  const display =
    user?.displayName ||
    user?.name ||
    user?.username ||
    (user?.email ? user.email.split("@")[0] : null) ||
    "—";

  if (sideUser) sideUser.textContent = display;
  if (dashName) dashName.textContent = display;

  const xpKey = getStorageKey(XP_KEY_BASE);
  const totalXp = Number(readJSON(xpKey, 0)) || 0;
  const lvl = getLevelInfo(totalXp);
  const profile = readUserProfile(user?.uid);
  const stats = (user && user.stats) || (profile && profile.stats) || null;
  const avg = averageStat(stats);
  const rank = rankFromAverage(avg);

  if (dashLevel) dashLevel.textContent = `Level ${lvl.level}`;
  if (dashXpText) dashXpText.textContent = `${lvl.remaining} / ${lvl.req} XP`;
  if (dashXpFill) dashXpFill.style.width = `${Math.round(lvl.progress * 100)}%`;
  if (sideSub) sideSub.textContent = `Rank ${rank}`;
}

function moodWord(m) {
  if (m === 1) return "Drained";
  if (m === 2) return "Low";
  if (m === 3) return "Stable";
  if (m === 4) return "Charged";
  if (m === 5) return "Peak";
  return "—";
}

function moodIconClass(m) {
  if (m === 1) return "fa-regular fa-face-sad-tear";
  if (m === 2) return "fa-regular fa-face-frown";
  if (m === 3) return "fa-regular fa-face-meh";
  if (m === 4) return "fa-regular fa-face-smile";
  if (m === 5) return "fa-regular fa-face-grin-stars";
  return "fa-regular fa-face-meh";
}

function restLabel(v) {
  if (v <= 15) return "Empty";
  if (v <= 35) return "Low";
  if (v <= 60) return "Stable";
  if (v <= 82) return "Charged";
  return "Peak";
}

function restIconClass(v) {
  if (v <= 15) return "fa-solid fa-battery-empty";
  if (v <= 35) return "fa-solid fa-battery-quarter";
  if (v <= 60) return "fa-solid fa-battery-half";
  if (v <= 82) return "fa-solid fa-battery-three-quarters";
  return "fa-solid fa-battery-full";
}

function readEntries() {
  const key = getStorageKey(JOURNAL_KEY_BASE);
  const data = readJSON(key, { entries: [] });
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  entries.sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
  return entries;
}

function upsertTodayEntry(payload) {
  const key = getStorageKey(JOURNAL_KEY_BASE);
  const existing = readJSON(key, { entries: [] });
  const entries = Array.isArray(existing?.entries) ? existing.entries : [];
  const today = payload.date;
  const idx = entries.findIndex((e) => e && e.date === today);

  if (idx >= 0)
    entries[idx] = { ...entries[idx], ...payload, updatedAt: Date.now() };
  else
    entries.unshift({
      ...payload,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

  writeJSON(key, { entries });
  const user = getCurrentUser();
  if (user?.uid) {
    void mergeUserState(user.uid, { journal: { entries } }).catch((error) => {
      console.warn("Journal sync failed:", error);
    });
  }
  return entries;
}

function computeStreak(entries) {
  const set = new Set(entries.map((e) => e?.date).filter(Boolean));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 366; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = getISODate(d);
    if (set.has(iso)) streak += 1;
    else break;
  }
  return streak;
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setTodayContext(todayEntry) {
  const insMood = document.getElementById("insMood");
  const insRest = document.getElementById("insRest");
  const insFocusInline = document.getElementById("insFocusInline");

  if (!todayEntry) {
    if (insMood) insMood.textContent = "—";
    if (insRest) insRest.textContent = "—";
    if (insFocusInline) insFocusInline.textContent = "—";
    return;
  }

  const m = Number(todayEntry.mood);
  const r = Number(todayEntry.rest);
  const f = Array.isArray(todayEntry.focus) ? todayEntry.focus : [];

  if (insMood) insMood.textContent = moodWord(m);
  if (insRest) insRest.textContent = restLabel(r);
  if (insFocusInline)
    insFocusInline.textContent = f.length ? f.join(", ") : "—";
}

function setSnapshot(todayEntry) {
  const line = document.getElementById("snapLine");
  const hint = document.getElementById("snapHint");

  if (!line || !hint) return;

  if (!todayEntry) {
    line.textContent = "—";
    hint.textContent = "Complete a check-in to generate.";
    return;
  }

  const m = Number(todayEntry.mood);
  const r = Number(todayEntry.rest);
  const f = Array.isArray(todayEntry.focus) ? todayEntry.focus : [];
  const ref = String(todayEntry.reflection || "").trim();

  const moodPart = `<span class="jc-snapItem"><i class="${escapeHTML(moodIconClass(m))}"></i><span>${escapeHTML(moodWord(m))}</span></span>`;
  const energyPart = `<span class="jc-snapItem"><i class="fa-solid fa-bolt"></i><span>${escapeHTML(restLabel(r))}</span></span>`;
  const focusPart = `<span class="jc-snapItem"><i class="fa-solid fa-bullseye"></i><span>${escapeHTML(String(f.length))}</span></span>`;
  const refPart = `<span class="jc-snapItem"><i class="fa-solid fa-pen"></i><span>${escapeHTML(ref ? "1 line" : "—")}</span></span>`;

  line.innerHTML = `${moodPart}${energyPart}${focusPart}${refPart}`;
  hint.textContent = "Generated from today’s check-in.";
}

function setCheckInButtonState(isDone) {
  const btn = document.getElementById("startCheckIn");
  if (!btn) return;
  btn.disabled = !!isDone;
  btn.classList.toggle("is-disabled", !!isDone);
  btn.textContent = isDone ? "Check-In Completed" : "Start Check-In";
}

function getRecentOverview(entries, streak, todayEntry) {
  const slice = entries.slice(0, 7);
  const moods = slice
    .map((e) => Number(e?.mood))
    .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  const avgMood = moods.length
    ? moods.reduce((a, b) => a + b, 0) / moods.length
    : null;

  const focusMap = new Map();
  slice.forEach((e) => {
    const focus = Array.isArray(e?.focus) ? e.focus : [];
    focus.forEach((tag) => {
      const key = String(tag || "").trim();
      if (!key) return;
      focusMap.set(key, (focusMap.get(key) || 0) + 1);
    });
  });

  const focusLeader =
    [...focusMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "No pattern yet";

  return {
    count: slice.length,
    streak,
    avgMood,
    avgMoodWord: Number.isFinite(avgMood) ? moodWord(Math.round(avgMood)) : "—",
    focusLeader,
    latest: slice[0]?.date ? formatShortDate(slice[0].date) : "No entries yet",
    today: todayEntry ? "Logged today" : "Waiting for today",
  };
}

function buildRecentPreview(entries, streak, todayEntry) {
  const info = getRecentOverview(entries, streak, todayEntry);
  const el = document.createElement("div");
  el.className = "jc-recentPreview";

  el.innerHTML = `
    <div class="jc-rpTop">
      <div class="jc-rpBadge">
        <i class="fa-regular fa-clock"></i>
        <span>Progress history</span>
      </div>
      <div class="jc-rpState">${escapeHTML(info.today)}</div>
    </div>

    <div class="jc-rpBody">
      <div class="jc-rpCopy">
        <div class="jc-rpTitle">A clean view of your recent check-ins.</div>
        <div class="jc-rpText">
          Expand this section to see your last seven entries with mood, energy, focus, and reflection history.
        </div>
      </div>

      <div class="jc-rpStats">
        <div class="jc-rpStat">
          <span class="jc-rpK">Entries</span>
          <span class="jc-rpV">${escapeHTML(String(info.count))}/7</span>
        </div>
        <div class="jc-rpStat">
          <span class="jc-rpK">Mood</span>
          <span class="jc-rpV">${escapeHTML(info.avgMoodWord)}</span>
        </div>
        <div class="jc-rpStat">
          <span class="jc-rpK">Focus</span>
          <span class="jc-rpV">${escapeHTML(info.focusLeader)}</span>
        </div>
        <div class="jc-rpStat">
          <span class="jc-rpK">Last</span>
          <span class="jc-rpV">${escapeHTML(info.latest)}</span>
        </div>
      </div>
    </div>

    <div class="jc-rpFoot">
      <span class="jc-rpChip">
        <i class="fa-solid fa-fire"></i>
        <span>${escapeHTML(`${info.streak} day streak`)}</span>
      </span>
      <span class="jc-rpChip">
        <i class="fa-solid fa-chevron-down"></i>
        <span>Tap to open details</span>
      </span>
    </div>
  `;

  return el;
}

function buildRecentCard(entry) {
  const card = document.createElement("article");
  const mood = clamp(Number(entry?.mood || 3), 1, 5);
  const rest = clamp(Number(entry?.rest || 55), 0, 100);
  const focus = Array.isArray(entry?.focus) ? entry.focus : [];
  const reflection = String(entry?.reflection || "").trim();
  const date = entry?.date ? formatShortDate(String(entry.date)) : "—";
  const weekday = entry?.date ? formatWeekdayShort(String(entry.date)) : "—";

  const tags = focus.length
    ? focus
        .slice(0, 4)
        .map((t) => `<span class="jc-tag">${escapeHTML(t)}</span>`)
        .join("")
    : `<span class="jc-tag is-muted">No focus tags</span>`;

  card.className = "jc-item";
  card.innerHTML = `
    <div class="jc-itemTop">
      <div class="jc-itemDateWrap">
        <div class="jc-itemDate">${escapeHTML(date)}</div>
        <div class="jc-itemStamp">${escapeHTML(weekday)}</div>
      </div>
      <div class="jc-itemMood">
        <i class="${escapeHTML(moodIconClass(mood))}"></i>
        <span>${escapeHTML(moodWord(mood))}</span>
      </div>
    </div>

    <div class="jc-itemStats">
      <span class="jc-miniStat">
        <i class="fa-solid fa-bolt"></i>
        <span>${escapeHTML(restLabel(rest))}</span>
      </span>
      <span class="jc-miniStat">
        <i class="fa-solid fa-bullseye"></i>
        <span>${escapeHTML(`${focus.length} focus`)}</span>
      </span>
    </div>

    <div class="jc-itemText">
      ${reflection ? escapeHTML(reflection) : "No reflection logged for this day."}
    </div>

    <div class="jc-itemTags">${tags}</div>
  `;

  return card;
}

function renderRecent() {
  const entries = readEntries();
  const streak = computeStreak(entries);
  const todayIso = getISODate(new Date());
  const todayEntry = entries.find((e) => e?.date === todayIso);

  const todayStatus = document.getElementById("todayStatus");
  const journalStreak = document.getElementById("journalStreak");
  const lastEntry = document.getElementById("lastEntry");

  if (todayStatus)
    todayStatus.textContent = todayEntry ? "Completed" : "Not started";
  if (journalStreak) journalStreak.textContent = `${streak} days`;
  if (lastEntry)
    lastEntry.textContent = entries[0]?.date
      ? formatShortDate(entries[0].date)
      : "—";

  setCheckInButtonState(!!todayEntry);
  setTodayContext(todayEntry);
  setSnapshot(todayEntry);

  const list = document.getElementById("recentList");
  if (!list) return;

  list.innerHTML = "";

  const slice = entries.slice(0, 7);
  list.appendChild(buildRecentPreview(slice, streak, todayEntry));

  const detailWrap = document.createElement("div");
  detailWrap.className = "jc-historyGrid";

  if (!slice.length) {
    const empty = document.createElement("div");
    empty.className = "jc-item jc-emptyCard";
    empty.innerHTML = `
      <div class="jc-emptyIcon"><i class="fa-regular fa-bookmark"></i></div>
      <div class="jc-emptyTitle">No entries yet</div>
      <div class="jc-emptyText">Start a check-in to begin building your recent history.</div>
    `;
    detailWrap.appendChild(empty);
  } else {
    slice.forEach((entry) => {
      detailWrap.appendChild(buildRecentCard(entry));
    });
  }

  list.appendChild(detailWrap);

  renderWeekStrip(entries);
  renderTrend(entries);
}

function buildDots() {
  const dots = document.getElementById("jpDots");
  if (!dots) return;
  dots.innerHTML = "";
  for (let i = 0; i < stepsCount; i++) {
    const d = document.createElement("div");
    d.className = "jc-dot";
    dots.appendChild(d);
  }
}

function setDot(idx) {
  const dots = Array.from(document.querySelectorAll(".jc-dot"));
  dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
}

function stepEls() {
  return Array.from(document.querySelectorAll(".jc-step"));
}

function setActiveStep(idx) {
  stepEls().forEach((el) => {
    const n = Number(el.getAttribute("data-step"));
    el.classList.toggle("is-active", n === idx);
  });
}

function measureStepHeight(idx) {
  const target = stepEls().find(
    (el) => Number(el.getAttribute("data-step")) === idx,
  );
  if (!target) return null;

  const prevDisplay = target.style.display;
  const prevOpacity = target.style.opacity;
  const prevTransform = target.style.transform;

  target.style.display = "block";
  target.style.opacity = "1";
  target.style.transform = "none";

  const h = target.getBoundingClientRect().height;

  target.style.display = prevDisplay;
  target.style.opacity = prevOpacity;
  target.style.transform = prevTransform;

  return h;
}

function syncNav(idx) {
  const back = document.getElementById("jBack");
  const next = document.getElementById("jNext");

  const isLast = idx === stepsCount - 1;
  if (back) back.style.visibility = idx <= 0 || isLast ? "hidden" : "visible";
  if (next) next.style.visibility = isLast ? "hidden" : "visible";
}

function morphToStep(idx, immediate = false) {
  const sheet = document.getElementById("journalSheet");
  if (!sheet) return;

  const contentPadding = 14 + 92;
  const targetH = (measureStepHeight(idx) || 360) + contentPadding;

  if (immediate) {
    sheet.style.height = `${targetH}px`;
    setActiveStep(idx);
    setDot(idx);
    sheet.dataset.step = String(idx);
    syncNav(idx);
    return;
  }

  const currentH = sheet.getBoundingClientRect().height || targetH;
  sheet.style.height = `${currentH}px`;

  requestAnimationFrame(() => {
    setActiveStep(idx);
    setDot(idx);
    sheet.dataset.step = String(idx);
    syncNav(idx);
    requestAnimationFrame(() => {
      sheet.style.height = `${targetH}px`;
    });
  });
}

function openOverlay() {
  const overlay = document.getElementById("journalOverlay");
  const sheet = document.getElementById("journalSheet");
  if (!overlay || !sheet) return;

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  buildDots();
  stateReset();
  morphToStep(0, true);
}

function closeOverlay() {
  const overlay = document.getElementById("journalOverlay");
  if (!overlay) return;

  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function stateReset() {
  state.mood = null;
  state.rest = 55;
  state.focus = new Set();
  state.reflection = "";
  state.helpful = null;

  document
    .querySelectorAll(".jc-mood")
    .forEach((b) => b.classList.remove("is-selected"));
  document
    .querySelectorAll(".jc-chip")
    .forEach((b) => b.classList.remove("is-selected"));
  document
    .querySelectorAll(".jc-help")
    .forEach((b) => b.classList.remove("is-selected"));

  const restRange = document.getElementById("restRange");
  const restText = document.getElementById("restText");
  const restNum = document.getElementById("restNum");
  const restIcon = document.getElementById("restIcon");
  const bar = document.getElementById("energyBar");

  if (restRange) restRange.value = String(state.rest);
  if (restText) restText.textContent = restLabel(state.rest);
  if (restNum) restNum.textContent = String(state.rest);
  if (restIcon)
    restIcon.innerHTML = `<i class="${restIconClass(state.rest)}"></i>`;

  if (bar) {
    bar.classList.remove("is-1", "is-2", "is-3", "is-4", "is-5");
    bar.classList.add("is-3");
  }

  const reflection = document.getElementById("reflection");
  if (reflection) reflection.value = "";

  const counter = document.getElementById("focusCounter");
  if (counter) counter.textContent = "0 / 3 selected";

  syncNav(0);
}

function nextStep() {
  const sheet = document.getElementById("journalSheet");
  const idx = Number(sheet?.dataset?.step || "0");
  if (idx === 0 && !state.mood) return;

  const nextIdx = clamp(idx + 1, 0, stepsCount - 1);
  morphToStep(nextIdx);
}

function backStep() {
  const sheet = document.getElementById("journalSheet");
  const idx = Number(sheet?.dataset?.step || "0");
  morphToStep(clamp(idx - 1, 0, stepsCount - 1));
}

function updateFocusSelection(btn) {
  const k = String(btn.getAttribute("data-focus") || "").trim();
  if (!k) return;

  if (state.focus.has(k)) state.focus.delete(k);
  else {
    if (state.focus.size >= 3) return;
    state.focus.add(k);
  }

  btn.classList.toggle("is-selected", state.focus.has(k));
  const counter = document.getElementById("focusCounter");
  if (counter) counter.textContent = `${state.focus.size} / 3 selected`;
}

function writeDashboardReflection(entry) {
  const key = getStorageKey(DASH_REFLECTION_KEY_BASE);
  const payload = {
    date: entry.date,
    reflection: String(entry.reflection || "").trim(),
    mood: entry.mood,
    rest: entry.rest,
    focus: entry.focus,
    updatedAt: Date.now(),
  };
  writeJSON(key, payload);
  const user = getCurrentUser();
  if (user?.uid) {
    void mergeUserState(user.uid, { dashboardReflection: payload }).catch(
      (error) => {
        console.warn("Dashboard reflection sync failed:", error);
      },
    );
  }
}

function setRecentCollapsed(collapsed) {
  const panel = document.querySelector(".jc-recent");
  const toggle = document.getElementById("recentToggle");
  if (!panel || !toggle) return;

  panel.classList.toggle("is-collapsed", !!collapsed);
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute(
    "aria-label",
    collapsed ? "Expand recent entries" : "Collapse recent entries",
  );
}

function initRecentToggle() {
  const toggle = document.getElementById("recentToggle");
  if (!toggle) return;

  const prefKey = getStorageKey(RECENT_COLLAPSE_KEY_BASE);
  const stored = readJSON(prefKey, true);
  setRecentCollapsed(!!stored);

  toggle.addEventListener("click", () => {
    const panel = document.querySelector(".jc-recent");
    if (!panel) return;
    const nextCollapsed = !panel.classList.contains("is-collapsed");
    setRecentCollapsed(nextCollapsed);
    writeJSON(prefKey, nextCollapsed);
  });
}

function bindCheckIn() {
  const thanksContinue = document.getElementById("thanksContinue");
  if (thanksContinue) {
    thanksContinue.addEventListener("click", () => {
      closeOverlay();
    });
  }

  const start = document.getElementById("startCheckIn");
  const close = document.getElementById("closeCheckIn");
  const overlay = document.getElementById("journalOverlay");
  const next = document.getElementById("jNext");
  const back = document.getElementById("jBack");

  if (start) start.addEventListener("click", openOverlay);
  if (close) close.addEventListener("click", closeOverlay);

  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeOverlay();
    });
  }

  document.addEventListener("keydown", (e) => {
    const overlayEl = document.getElementById("journalOverlay");
    const isOpen = overlayEl?.classList.contains("is-open");
    if (!isOpen) return;

    const sheet = document.getElementById("journalSheet");
    const idx = Number(sheet?.dataset?.step || "0");

    if (e.key === "Escape") closeOverlay();

    if (idx === stepsCount - 1) {
      if (e.key === "Enter") closeOverlay();
      return;
    }

    if (e.key === "ArrowLeft") backStep();
    if (e.key === "ArrowRight") nextStep();
    if (e.key === "Enter") {
      const active = document.activeElement;
      const isTextarea = active && active.tagName === "TEXTAREA";
      if (!isTextarea) nextStep();
    }
  });

  if (next) next.addEventListener("click", nextStep);
  if (back) back.addEventListener("click", backStep);

  document.querySelectorAll(".jc-mood").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = Number(btn.getAttribute("data-mood"));
      state.mood = clamp(v, 1, 5);
      document
        .querySelectorAll(".jc-mood")
        .forEach((b) => b.classList.toggle("is-selected", b === btn));
      setTimeout(() => {
        const sheet = document.getElementById("journalSheet");
        const idx = Number(sheet?.dataset?.step || "0");
        if (idx === 0) morphToStep(1);
      }, 120);
    });
  });

  const restRange = document.getElementById("restRange");
  const restText = document.getElementById("restText");
  const restNum = document.getElementById("restNum");
  const restIcon = document.getElementById("restIcon");
  const bar = document.getElementById("energyBar");

  if (restRange) {
    restRange.addEventListener("input", () => {
      const v = clamp(Number(restRange.value), 0, 100);
      state.rest = v;
      if (restText) restText.textContent = restLabel(v);
      if (restNum) restNum.textContent = String(v);
      if (restIcon) restIcon.innerHTML = `<i class="${restIconClass(v)}"></i>`;
      if (bar) {
        bar.classList.remove("is-1", "is-2", "is-3", "is-4", "is-5");
        const lvl = v <= 15 ? 1 : v <= 35 ? 2 : v <= 60 ? 3 : v <= 82 ? 4 : 5;
        bar.classList.add(`is-${lvl}`);
      }
    });
  }

  document.querySelectorAll(".jc-chip").forEach((btn) => {
    btn.addEventListener("click", () => updateFocusSelection(btn));
  });

  const reflection = document.getElementById("reflection");
  if (reflection) {
    reflection.addEventListener("input", () => {
      state.reflection = reflection.value;
    });
  }

  document.querySelectorAll(".jc-pill").forEach((p) => {
    p.addEventListener("click", () => {
      const t = String(p.getAttribute("data-prompt") || "").trim();
      if (!t) return;
      const current = reflection ? reflection.value : "";
      const nextText = current ? `${current.trim()}\n${t}` : t;
      if (reflection) {
        reflection.value = nextText;
        reflection.dispatchEvent(new Event("input"));
        reflection.focus();
      }
    });
  });

  document.querySelectorAll(".jc-help").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = String(btn.getAttribute("data-help") || "");
      state.helpful = v || null;
      document
        .querySelectorAll(".jc-help")
        .forEach((b) => b.classList.toggle("is-selected", b === btn));
    });
  });

  const saveFinish = document.getElementById("saveFinish");
  if (saveFinish) {
    saveFinish.addEventListener("click", () => {
      const today = getISODate(new Date());
      const entry = {
        date: today,
        mood: state.mood || 3,
        rest: state.rest,
        focus: Array.from(state.focus),
        reflection: (state.reflection || "").trim(),
        helpful: state.helpful,
      };

      upsertTodayEntry(entry);
      writeDashboardReflection(entry);
      renderRecent();

      morphToStep(stepsCount - 1, true);
    });
  }

  const viewEntries = document.getElementById("viewEntries");
  if (viewEntries) {
    viewEntries.addEventListener("click", () => {
      const list = document.getElementById("recentList");
      if (list) list.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function renderWeekStrip(entries) {
  const strip = document.getElementById("weekStrip");
  if (!strip) return;

  const byDate = new Map(entries.map((e) => [e?.date, e]));
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(getISODate(d));
  }

  strip.innerHTML = "";
  const todayIso = getISODate(today);

  days.forEach((iso) => {
    const has = byDate.has(iso);
    const btn = document.createElement("button");
    btn.className = "jc-dayBtn";
    btn.type = "button";
    btn.setAttribute("role", "listitem");
    btn.setAttribute("data-iso", iso);
    if (iso === todayIso) btn.classList.add("is-active");

    const name = formatWeekdayShort(iso);
    const num = (() => {
      try {
        const [, , d] = iso.split("-").map(Number);
        return String(d);
      } catch {
        return "—";
      }
    })();

    btn.innerHTML = `
      <div class="jc-dayName">${escapeHTML(name)}</div>
      <div class="jc-dayNum">${escapeHTML(num)}</div>
      <div class="jc-dayDot ${has ? "is-filled" : ""}"></div>
    `;

    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".jc-dayBtn")
        .forEach((b) => b.classList.toggle("is-active", b === btn));
      renderDayPreview(byDate.get(iso), iso);
    });

    strip.appendChild(btn);
  });

  renderDayPreview(byDate.get(todayIso), todayIso);
}

function renderDayPreview(entry, iso) {
  const previewDate = document.getElementById("previewDate");
  const previewMeta = document.getElementById("previewMeta");
  const previewText = document.getElementById("previewText");

  if (!previewDate || !previewMeta || !previewText) return;

  previewDate.textContent = iso ? formatShortDate(iso) : "—";

  if (!entry) {
    previewMeta.textContent = "No entry";
    previewText.textContent = "No reflection logged for this day.";
    return;
  }

  const m = Number(entry.mood);
  const r = Number(entry.rest);
  const f = Array.isArray(entry.focus) ? entry.focus : [];
  const ref = String(entry.reflection || "").trim();

  previewMeta.textContent = `${moodWord(m)} · ${restLabel(r)} · ${f.length ? `${f.length} focus` : "no focus"}`;
  previewText.textContent = ref || "—";
}

function buildGridPath() {
  const w = 300;
  const h = 110;
  const lines = [0.2, 0.5, 0.8].map((p) => Math.round(h * p));
  return lines.map((y) => `M0 ${y} H${w}`).join(" ");
}

function renderTrend(entries) {
  const last7 = entries
    .slice()
    .filter((e) => e?.mood && e?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-7);

  const meta = document.getElementById("trendMeta");
  const foot = document.getElementById("trendFoot");
  const empty = document.getElementById("trendEmpty");
  const grid = document.getElementById("trendGrid");
  const path = document.getElementById("trendPath");
  const fill = document.getElementById("trendFill");
  const dots = document.getElementById("trendDots");

  if (grid) grid.setAttribute("d", buildGridPath());

  if (!last7.length) {
    if (meta) meta.innerHTML = `<i class="fa-regular fa-face-grin-beam"></i> —`;
    if (foot) foot.textContent = "Log a check-in to begin.";
    if (empty) empty.style.display = "grid";
    if (path) path.setAttribute("d", "");
    if (fill) fill.setAttribute("d", "");
    if (dots) dots.innerHTML = "";
    return;
  }

  if (empty) empty.style.display = "none";

  const vals = last7.map((e) => clamp(Number(e.mood), 1, 5));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  if (last7.length === 1) {
    if (meta)
      meta.innerHTML = `<i class="fa-regular fa-face-grin-beam"></i> avg ${avg.toFixed(1)}`;
    if (foot) foot.textContent = "Log 2+ check-ins to reveal your pattern.";

    const w = 300;
    const h = 110;
    const padX = 14;
    const padY = 14;

    const v = vals[0];
    const t = (v - 1) / 4;
    const x = w / 2;
    const y = padY + (1 - t) * (h - padY * 2);

    if (path) path.setAttribute("d", "");
    if (fill) fill.setAttribute("d", "");

    if (dots) {
      dots.innerHTML = "";
      const c = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      c.setAttribute("class", "jc-dotPt");
      c.setAttribute("cx", String(x));
      c.setAttribute("cy", String(y));
      c.setAttribute("r", "4.2");
      dots.appendChild(c);
    }
    return;
  }

  const first = vals.slice(0, Math.floor(vals.length / 2));
  const second = vals.slice(Math.floor(vals.length / 2));
  const a1 = first.reduce((a, b) => a + b, 0) / Math.max(1, first.length);
  const a2 = second.reduce((a, b) => a + b, 0) / Math.max(1, second.length);
  const delta = a2 - a1;

  const dir = delta > 0.15 ? "Up" : delta < -0.15 ? "Down" : "Steady";
  if (meta)
    meta.innerHTML = `<i class="fa-regular fa-face-grin-beam"></i> ${dir} · avg ${avg.toFixed(1)}`;
  if (foot) foot.textContent = "A small glance. Not a judgement.";

  const w = 300;
  const h = 110;
  const padX = 14;
  const padY = 14;

  const xs = vals.map((_, i) => {
    const tt = i / (vals.length - 1);
    return padX + tt * (w - padX * 2);
  });

  const ys = vals.map((v) => {
    const tt = (v - 1) / 4;
    return padY + (1 - tt) * (h - padY * 2);
  });

  const d = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`)
    .join(" ");
  const dFill = `${d} L ${xs[xs.length - 1].toFixed(2)} ${(h - padY).toFixed(2)} L ${xs[0].toFixed(2)} ${(h - padY).toFixed(2)} Z`;

  if (path) {
    path.style.animation = "none";
    void path.getBoundingClientRect();
    path.style.animation = "";
    path.setAttribute("d", d);
  }
  if (fill) fill.setAttribute("d", dFill);

  if (dots) {
    dots.innerHTML = "";
    const lastIdx = vals.length - 1;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("class", "jc-dotPt");
    c.setAttribute("cx", String(xs[lastIdx]));
    c.setAttribute("cy", String(ys[lastIdx]));
    c.setAttribute("r", "4.2");
    dots.appendChild(c);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = getCurrentUser();
  if (user?.uid) {
    try {
      await syncUserState(user.uid);
    } catch (error) {
      console.warn("Journal cloud sync failed:", error);
    }

    const profile = readUserProfile(user.uid);
    if (!user.stats && profile?.stats) {
      writeCurrentUser({
        ...user,
        stats: profile.stats,
        ...(profile.survey ? { survey: profile.survey } : {}),
      });
    }
  }

  setActiveSidebar();
  hydrateIdentity();
  initRecentToggle();
  renderRecent();
  bindCheckIn();
});
