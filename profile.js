import {
  getCurrentUser,
  getStorageKey,
  logout,
  mergeUserState,
  readCachedAccountState,
  readCachedUserProfile,
  subscribeToUserState,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const JOURNAL_KEY_BASE = "aurak_journal_v1";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;
const TITLE_SURVEY_LOCK_MS = 7 * 24 * 60 * 60 * 1000;
const TITLE_SURVEY_VERSION = "aurak-title-profile-v4";
const TITLE_SURVEY_STORAGE_KEY = "aurak_title_survey_v1";

const TITLE_SURVEY_STATS = [
  "Physical",
  "Intellectual",
  "Confidence",
  "Discipline",
  "Mental",
];

const TITLE_SURVEY_TITLE_BY_STAT = {
  Physical: "Savage Vanguard",
  Intellectual: "Insight Phantom",
  Confidence: "Blade Saint",
  Discipline: "Zenith Executioner",
  Mental: "Mind Reaper",
};

const TITLE_SURVEY_TEMPLATE = {
  version: TITLE_SURVEY_VERSION,
  questions: [
    {
      id: "guild-plan",
      icon: "fa-solid fa-map",
      title:
        "You have the opportunity to lead a guild entering a dangerous dungeon next week. What is your first plan?",
      subtitle: "Choose the option that fits you best.",
      options: [
        {
          key: "a",
          label: "Charge inside and defeat enemies head on.",
          sublabel: "Physical",
          icon: "fa-solid fa-hand-fist",
          stat: "Physical",
        },
        {
          key: "b",
          label: "Observe the dungeon entrance and plan your route.",
          sublabel: "Intellectual",
          icon: "fa-solid fa-brain",
          stat: "Intellectual",
        },
        {
          key: "c",
          label: "Stay in the frontline of the team while in the dungeon.",
          sublabel: "Confidence",
          icon: "fa-solid fa-crown",
          stat: "Confidence",
        },
        {
          key: "d",
          label: "Prepare gear and review the plan carefully.",
          sublabel: "Discipline",
          icon: "fa-solid fa-shield-halved",
          stat: "Discipline",
        },
        {
          key: "e",
          label: "Scan the area carefully to detect hidden threats.",
          sublabel: "Mental",
          icon: "fa-solid fa-eye",
          stat: "Mental",
        },
      ],
    },
    {
      id: "boss-fight",
      icon: "fa-solid fa-skull",
      title:
        "At the end of the dungeon, you and the team face a powerful boss. What is the first thing you do?",
      subtitle: "Choose the option that fits you best.",
      options: [
        {
          key: "a",
          label: "Attack nonstop until it falls.",
          sublabel: "Physical",
          icon: "fa-solid fa-hand-fist",
          stat: "Physical",
        },
        {
          key: "b",
          label: "Analyze its attack pattern and weakness.",
          sublabel: "Intellectual",
          icon: "fa-solid fa-brain",
          stat: "Intellectual",
        },
        {
          key: "c",
          label:
            "Break formation and push forward first to force openings for the team.",
          sublabel: "Confidence",
          icon: "fa-solid fa-crown",
          stat: "Confidence",
        },
        {
          key: "d",
          label:
            "Hold your position and execute your role until the battle ends.",
          sublabel: "Discipline",
          icon: "fa-solid fa-shield-halved",
          stat: "Discipline",
        },
        {
          key: "e",
          label:
            "Stay calm under pressure and read every movement the boss makes.",
          sublabel: "Mental",
          icon: "fa-solid fa-eye",
          stat: "Mental",
        },
      ],
    },
    {
      id: "injured-ally",
      icon: "fa-solid fa-user-injured",
      title: "A teammate got injured during the battle. What will you do?",
      subtitle: "Choose the option that fits you best.",
      options: [
        {
          key: "a",
          label: "Take control and finish the fight yourself.",
          sublabel: "Physical",
          icon: "fa-solid fa-hand-fist",
          stat: "Physical",
        },
        {
          key: "b",
          label: "Adjust the plan quickly.",
          sublabel: "Intellectual",
          icon: "fa-solid fa-brain",
          stat: "Intellectual",
        },
        {
          key: "c",
          label:
            "Move to the front line to protect teammates and create space for recovery.",
          sublabel: "Confidence",
          icon: "fa-solid fa-crown",
          stat: "Confidence",
        },
        {
          key: "d",
          label: "Stay focused and keep the formation stable.",
          sublabel: "Discipline",
          icon: "fa-solid fa-shield-halved",
          stat: "Discipline",
        },
        {
          key: "e",
          label:
            "Endure the chaos and push through despite injuries around you.",
          sublabel: "Mental",
          icon: "fa-solid fa-anchor",
          stat: "Mental",
        },
      ],
    },
    {
      id: "rare-ability",
      icon: "fa-solid fa-wand-sparkles",
      title:
        "You receive a rare ability reward after clearing a dungeon. Which one do you choose?",
      subtitle: "Choose the option that fits you best.",
      options: [
        {
          key: "a",
          label: "Colossus Surge",
          sublabel:
            "Temporarily boosts your speed and strength to superhuman levels for a short time. After use, you lose 1 level of your current stat.",
          icon: "fa-solid fa-dumbbell",
          stat: "Physical",
        },
        {
          key: "b",
          label: "Eidolon Mind",
          sublabel:
            "Instantly analyze enemies, uncover hidden secrets, and gain profound tactical knowledge. After use, you faint briefly from mental overload, leaving you vulnerable for a short time.",
          icon: "fa-solid fa-brain",
          stat: "Intellectual",
        },
        {
          key: "c",
          label: "Vanguard Breaker",
          sublabel:
            "Push to the front instantly, forcing enemy attention and creating openings for allies through direct engagement. After use, your Confidence stat drops by 1 point temporarily due to strain.",
          icon: "fa-solid fa-crown",
          stat: "Confidence",
        },
        {
          key: "d",
          label: "Iron Discipline",
          sublabel:
            "Execute every move flawlessly, no matter the duration or pressure. Using this skill costs 1 Discipline point temporarily.",
          icon: "fa-solid fa-shield-halved",
          stat: "Discipline",
        },
        {
          key: "e",
          label: "Soul Fortress",
          sublabel:
            "Enter a fully locked-in flow state, resisting all distractions while projecting an aura of fear that unnerves the boss. After use, your Mental stat drops by 2 points temporarily, and your next action is delayed slightly due to mental fatigue.",
          icon: "fa-solid fa-skull",
          stat: "Mental",
        },
      ],
    },
    {
      id: "main-goal",
      icon: "fa-solid fa-bullseye",
      title: "What is your main goal as a hunter?",
      subtitle: "Choose the option that fits you best.",
      options: [
        {
          key: "a",
          label: "Become the strongest fighter alive.",
          sublabel: "Physical",
          icon: "fa-solid fa-hand-fist",
          stat: "Physical",
        },
        {
          key: "b",
          label: "Outsmart all challenges and uncover hidden knowledge.",
          sublabel: "Intellectual",
          icon: "fa-solid fa-brain",
          stat: "Intellectual",
        },
        {
          key: "c",
          label: "Lead and inspire your team to victory.",
          sublabel: "Confidence",
          icon: "fa-solid fa-crown",
          stat: "Confidence",
        },
        {
          key: "d",
          label: "Perfect every skill and strategy through constant practice.",
          sublabel: "Discipline",
          icon: "fa-solid fa-shield-halved",
          stat: "Discipline",
        },
        {
          key: "e",
          label: "Know your limits and endure trials to strengthen your mind.",
          sublabel: "Mental",
          icon: "fa-solid fa-eye",
          stat: "Mental",
        },
      ],
    },
  ],
};

const surveyState = {
  step: 0,
  answers: Array(TITLE_SURVEY_TEMPLATE.questions.length).fill(null),
};

function safeParseJSON(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readUserProfile(uid) {
  return uid ? readCachedUserProfile(uid) || {} : {};
}

function saveUserProfile(uid, patch) {
  if (!uid) return {};
  const key = getStorageKey("aurak_user_profile", uid);
  const current = safeParseJSON(localStorage.getItem(key), {});
  const profile = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(profile));
  return profile;
}

function getTitleSurveyKey(uid) {
  return getStorageKey(TITLE_SURVEY_STORAGE_KEY, uid);
}

function normalizeTitleState(value) {
  if (!value || typeof value !== "object") return null;
  if (!value.title) return null;
  if (value.version && value.version !== TITLE_SURVEY_VERSION) return null;

  const scores = {};
  TITLE_SURVEY_STATS.forEach((key) => {
    scores[key] = Math.max(0, Number(value.scores?.[key]) || 0);
  });

  return {
    version: value.version || TITLE_SURVEY_VERSION,
    title: value.title,
    titleKey: value.titleKey || value.title,
    description: value.description || "",
    answers: Array.isArray(value.answers) ? value.answers : [],
    scores,
    completedAt: Number(value.completedAt || 0) || Date.now(),
    lockedUntil: Number(value.lockedUntil || 0) || 0,
  };
}

function inferTitleKeyFromTitle(title) {
  const value = sanitizeText(title, "").toLowerCase();
  if (value.includes("vanguard")) return "Physical";
  if (value.includes("phantom")) return "Intellectual";
  if (value.includes("executioner")) return "Discipline";
  if (value.includes("saint") || value.includes("emperor")) return "Confidence";
  if (value.includes("reaper")) return "Mental";
  return "";
}

function buildEmptyTitleScores() {
  const scores = {};
  TITLE_SURVEY_STATS.forEach((key) => {
    scores[key] = 0;
  });
  return scores;
}

function titleStateFromProfile(profile) {
  const explicitTitle = sanitizeText(profile?.title, "");
  const base = normalizeTitleState(profile?.titleSurvey);

  if (!explicitTitle) return base;
  if (!base) {
    const titleKey = inferTitleKeyFromTitle(explicitTitle) || explicitTitle;
    return {
      version: TITLE_SURVEY_VERSION,
      title: explicitTitle,
      titleKey,
      description: "",
      answers: [],
      scores: buildEmptyTitleScores(),
      completedAt: Date.now(),
      lockedUntil: 0,
    };
  }

  if (base.title === explicitTitle) return base;
  return {
    ...base,
    title: explicitTitle,
    titleKey: inferTitleKeyFromTitle(explicitTitle) || base.titleKey || explicitTitle,
  };
}

function isSameTitleState(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (
    a.title !== b.title ||
    a.titleKey !== b.titleKey ||
    a.description !== b.description ||
    a.lockedUntil !== b.lockedUntil
  ) {
    return false;
  }

  const aAnswers = Array.isArray(a.answers) ? a.answers : [];
  const bAnswers = Array.isArray(b.answers) ? b.answers : [];
  if (JSON.stringify(aAnswers) !== JSON.stringify(bAnswers)) return false;

  return TITLE_SURVEY_STATS.every(
    (key) => Number(a.scores?.[key] || 0) === Number(b.scores?.[key] || 0),
  );
}

function writeTitleState(uid, titleState) {
  const safe = normalizeTitleState(titleState);
  if (!uid || !safe) return null;
  localStorage.setItem(getTitleSurveyKey(uid), JSON.stringify(safe));
  return safe;
}

function readTitleState(profile, uid) {
  const profileState = titleStateFromProfile(profile);
  if (!uid) return profileState;

  const localState = normalizeTitleState(
    safeParseJSON(localStorage.getItem(getTitleSurveyKey(uid)), null),
  );
  if (profileState) {
    if (!isSameTitleState(localState, profileState)) {
      writeTitleState(uid, profileState);
    }
    return profileState;
  }

  if (localState) return localState;

  return null;
}

function persistTitleState(uid, profileState, titleState) {
  const safe = writeTitleState(uid, titleState);
  if (!uid || !safe) return safe;

  profileState.current = saveUserProfile(uid, {
    ...profileState.current,
    title: safe.title,
    titleSurvey: safe,
  });

  return safe;
}

function getLevelInfo(totalXp) {
  let level = 1;
  let req = BASE_XP_PER_LEVEL;
  let remaining = Number.isFinite(totalXp) ? totalXp : 0;

  for (let guard = 0; guard < 200; guard += 1) {
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
  const values = keys
    .map((key) => Number(stats[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function readTotalXP(uid) {
  try {
    const stored = localStorage.getItem(getStorageKey(XP_STORAGE_KEY, uid));
    return stored ? Math.max(0, Number(stored) || 0) : 0;
  } catch {
    return 0;
  }
}

function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

function readMembership(uid) {
  if (!uid) return null;
  const key = getStorageKey("aurak_membership", uid);
  const direct = safeParseJSON(localStorage.getItem(key), null);
  if (direct) return direct;
  const profile = readUserProfile(uid);
  return profile?.membership || null;
}

function readJournalEntries(uid) {
  const key = getStorageKey(JOURNAL_KEY_BASE, uid);
  const store = safeParseJSON(localStorage.getItem(key), { entries: [] });
  const entries = Array.isArray(store?.entries) ? store.entries : [];
  entries.sort((a, b) =>
    String(b?.date || "").localeCompare(String(a?.date || "")),
  );
  return entries;
}

function getISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeStreak(entries) {
  const dates = new Set(entries.map((entry) => entry?.date).filter(Boolean));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 366; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if (dates.has(getISODate(date))) streak += 1;
    else break;
  }
  return streak;
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function buildHandle(profile, displayName, user) {
  const existing = normalizeHandle(profile?.handle);
  if (existing) return existing;
  const fromName = normalizeHandle(
    displayName || user?.displayName || user?.name || "player",
  );
  return fromName || "player";
}

function sanitizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function toast(message) {
  const element = document.getElementById("pfToast");
  if (!element) return;
  element.textContent = message || "";
  element.classList.toggle("is-visible", Boolean(message));
  clearTimeout(toast.timer);
  if (!message) return;
  toast.timer = setTimeout(() => {
    element.classList.remove("is-visible");
  }, 2200);
}

function setDirty(on) {
  const badge = document.getElementById("pfDirty");
  if (!badge) return;
  badge.classList.toggle("is-on", Boolean(on));
}

function setCount(input, counterId, max) {
  const counter = document.getElementById(counterId);
  if (!counter) return;
  const length = String(input?.value || "").length;
  counter.textContent = `${length}/${max}`;
}

function renderMembership(membership) {
  const safe = membership || {
    plan: "Free",
    status: "ACTIVE",
    renewDate: null,
    desc: "Basic access to AuraK core features.",
    perks: ["Daily quests", "XP tracking", "Pillar stats"],
  };

  setText("pfPlanBadge", `${safe.plan} • ${safe.status || "—"}`);
  setText("pfPlanName", safe.plan || "—");
  setText("pfPlanDesc", safe.desc || "—");
  setText("pfRenewDate", safe.renewDate ? formatDate(safe.renewDate) : "—");

  const perksWrap = document.getElementById("pfPerks");
  if (!perksWrap) return;
  const perks = Array.isArray(safe.perks) ? safe.perks.slice(0, 4) : [];
  perksWrap.innerHTML = perks
    .map(
      (perk) => `
        <div class="pr-perk">
          <i class="fa-solid fa-check"></i>
          <span>${escapeHtml(perk)}</span>
        </div>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isTitleLocked(titleState) {
  return Number(titleState?.lockedUntil || 0) > Date.now();
}

function getTitleMeta(titleState) {
  if (!titleState?.title) return "Tap to determine";
  if (isTitleLocked(titleState)) {
    return `Locked until ${formatDate(titleState.lockedUntil)}`;
  }
  return "Tap to retake";
}

function renderTitleState(titleState) {
  const title = titleState?.title || "Unassigned";
  const meta = getTitleMeta(titleState);
  setText("prTitle", title);
  setText("prTitleHero", title);
  setText("prTitleMeta", meta);
  setText("prTitleHeroMeta", meta);
  setText("pfDetailTitle", title);

  ["prTitleTriggerHero", "prTitleTriggerCard"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.toggle("is-locked", isTitleLocked(titleState));
  });
}

function computeTitleResult(answers) {
  const scores = {};
  TITLE_SURVEY_STATS.forEach((key) => {
    scores[key] = 0;
  });

  TITLE_SURVEY_TEMPLATE.questions.forEach((question, index) => {
    const selectedKey = answers[index];
    const option = question.options.find((item) => item.key === selectedKey);
    const stat = option?.stat;
    if (!stat) return;
    scores[stat] = (scores[stat] || 0) + 1;
  });

  let bestStat = TITLE_SURVEY_STATS[0] || "Physical";
  let bestScore = -Infinity;
  TITLE_SURVEY_STATS.forEach((key) => {
    const score = Number(scores[key] || 0);
    if (score > bestScore) {
      bestStat = key;
      bestScore = score;
    }
  });

  const title = TITLE_SURVEY_TITLE_BY_STAT[bestStat] || "Unassigned";
  const breakdown = TITLE_SURVEY_STATS.map(
    (key) => `${key}: ${scores[key] || 0}`,
  ).join(" • ");

  return {
    key: bestStat,
    title,
    scores,
    description: breakdown,
  };
}

function buildSurveyDots() {
  const dotsWrap = document.getElementById("titleSurveyDots");
  if (!dotsWrap) return;
  dotsWrap.innerHTML = "";
  const count = TITLE_SURVEY_TEMPLATE.questions.length + 1;
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement("span");
    dot.className = "jc-dot";
    if (i === 0) dot.classList.add("is-active");
    dotsWrap.appendChild(dot);
  }
}

function setActiveSurveyDot(step) {
  const dots = Array.from(
    document.querySelectorAll("#titleSurveyDots .jc-dot"),
  );
  const activeIndex = Math.min(step, dots.length - 1);
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === activeIndex);
  });
}

function renderSurveyQuestion() {
  const question = TITLE_SURVEY_TEMPLATE.questions[surveyState.step];
  if (!question) return;
  const showOptionDetail = question.id === "rare-ability";

  setText(
    "tsStepLabel",
    `Question ${surveyState.step + 1} of ${TITLE_SURVEY_TEMPLATE.questions.length}`,
  );
  const questionOrb = document.getElementById("tsQuestionOrb");
  if (questionOrb) {
    questionOrb.innerHTML = `<i class="${escapeHtml(
      question.icon || "fa-solid fa-scroll",
    )}"></i>`;
  }
  setText("tsQuestionTitle", question.title);
  setText("tsQuestionSub", question.subtitle);

  const wrap = document.getElementById("tsQuestionOptions");
  if (!wrap) return;

  wrap.innerHTML = question.options
    .map(
      (option) => `
        <button
          class="jc-chip title-chip ${
            surveyState.answers[surveyState.step] === option.key
              ? "is-selected"
              : ""
          }"
          type="button"
          data-option-key="${escapeHtml(option.key)}"
          data-stat-key="${escapeHtml(String(option.stat || "").toLowerCase())}"
        >
          <span class="ts-chipIcon"><i class="${escapeHtml(option.icon)}"></i></span>
          <span class="ts-chipText">
            <span class="ts-chipLabel">${escapeHtml(option.label)}</span>
            ${
              showOptionDetail && option.sublabel
                ? `<span class="ts-chipSub">${escapeHtml(option.sublabel)}</span>`
                : ""
            }
          </span>
        </button>
      `,
    )
    .join("");

  wrap.querySelectorAll(".title-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const optionKey = button.getAttribute("data-option-key");
      surveyState.answers[surveyState.step] = optionKey;
      renderSurveyQuestion();
      window.setTimeout(() => {
        if (surveyState.step < TITLE_SURVEY_TEMPLATE.questions.length - 1) {
          goToSurveyStep(surveyState.step + 1);
        } else {
          goToSurveyStep(TITLE_SURVEY_TEMPLATE.questions.length);
        }
      }, 120);
    });
  });
}

function refreshSurveyReview() {
  const result = computeTitleResult(surveyState.answers);
  setText("tsResultTitle", result.title);
  setText("tsResultDesc", result.description);

  const answerSummary = document.getElementById("tsAnswerSummary");
  if (answerSummary) {
    answerSummary.innerHTML = TITLE_SURVEY_TEMPLATE.questions
      .map((question, index) => {
        const answerKey = surveyState.answers[index];
        const option = question.options.find((item) => item.key === answerKey);
        return `
          <div class="ts-answerLine">
            <span>${escapeHtml(question.title)}</span>
            <span>${escapeHtml(option?.label || "—")}</span>
          </div>
        `;
      })
      .join("");
  }
}

function syncSurveyNav() {
  const back = document.getElementById("titleSurveyBack");
  const next = document.getElementById("titleSurveyNext");
  const nav = document.getElementById("titleSurveyNav");
  const questionCount = TITLE_SURVEY_TEMPLATE.questions.length;
  const isSavedStep = surveyState.step === questionCount + 1;
  const isReviewStep = surveyState.step === questionCount;

  if (back) {
    back.classList.toggle("is-hidden", surveyState.step === 0 || isSavedStep);
  }
  if (next) next.classList.toggle("is-hidden", isReviewStep || isSavedStep);
  if (nav) nav.classList.toggle("is-hidden", isSavedStep);
}

function goToSurveyStep(step) {
  const questionCount = TITLE_SURVEY_TEMPLATE.questions.length;
  const maxStep = questionCount + 1;
  surveyState.step = Math.max(0, Math.min(step, maxStep));

  const questionStep = document.getElementById("titleSurveyQuestionStep");
  const reviewStep = document.getElementById("titleSurveyReviewStep");
  const savedStep = document.getElementById("titleSurveySavedStep");

  if (questionStep) {
    questionStep.classList.toggle(
      "is-active",
      surveyState.step < questionCount,
    );
  }
  if (reviewStep) {
    reviewStep.classList.toggle(
      "is-active",
      surveyState.step === questionCount,
    );
  }
  if (savedStep) {
    savedStep.classList.toggle(
      "is-active",
      surveyState.step === questionCount + 1,
    );
  }

  const sheet = document.getElementById("titleSurveySheet");
  if (sheet) sheet.dataset.step = String(surveyState.step);

  if (surveyState.step < questionCount) renderSurveyQuestion();
  if (surveyState.step === questionCount) refreshSurveyReview();

  setActiveSurveyDot(surveyState.step);
  syncSurveyNav();
}

function openTitleSurvey() {
  const overlay = document.getElementById("titleSurveyOverlay");
  if (!overlay) return;
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  goToSurveyStep(0);
}

function closeTitleSurvey() {
  const overlay = document.getElementById("titleSurveyOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function resetSurveyAnswers() {
  surveyState.answers = Array(TITLE_SURVEY_TEMPLATE.questions.length).fill(
    null,
  );
  surveyState.step = 0;
}

function setModalOpen(isOpen) {
  const modal = document.getElementById("prModal");
  if (!modal) return;
  modal.classList.toggle("is-open", isOpen);
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  document.body.style.overflow = isOpen ? "hidden" : "";
}

function bindEditModal(profileState, currentUser, onSaved) {
  const nameInput = document.getElementById("pfInputName");
  const taglineInput = document.getElementById("pfInputTagline");
  const bioInput = document.getElementById("pfInputBio");

  const editButton = document.getElementById("prEditBtn");
  const closeButton = document.getElementById("prModalClose");
  const modal = document.getElementById("prModal");
  const saveButton = document.getElementById("pfSaveBtn");

  const fillForm = () => {
    const profile = profileState.current;
    const displayName = sanitizeText(
      profile.displayName || currentUser.displayName || currentUser.name,
      "User",
    );
    if (nameInput) nameInput.value = displayName;
    if (taglineInput) taglineInput.value = sanitizeText(profile.tagline, "");
    if (bioInput) bioInput.value = sanitizeText(profile.bio, "");
    setCount(nameInput, "pfNameCount", 28);
    setCount(taglineInput, "pfTagCount", 44);
    setCount(bioInput, "pfBioCount", 240);
    setDirty(false);
  };

  editButton?.addEventListener("click", () => {
    fillForm();
    setModalOpen(true);
  });

  closeButton?.addEventListener("click", () => setModalOpen(false));
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) setModalOpen(false);
  });

  [nameInput, taglineInput, bioInput].forEach((input) => {
    input?.addEventListener("input", () => {
      setCount(nameInput, "pfNameCount", 28);
      setCount(taglineInput, "pfTagCount", 44);
      setCount(bioInput, "pfBioCount", 240);
      setDirty(true);
    });
  });

  saveButton?.addEventListener("click", async () => {
    const displayName = sanitizeText(
      nameInput?.value,
      sanitizeText(currentUser.displayName || currentUser.name, "User"),
    );

    const nextProfilePatch = {
      ...profileState.current,
      displayName,
      handle: buildHandle(profileState.current, displayName, currentUser),
      tagline: sanitizeText(taglineInput?.value, "Student • Builder • Athlete"),
      bio: sanitizeText(bioInput?.value, ""),
    };

    profileState.current = saveUserProfile(currentUser.uid, nextProfilePatch);
    const updatedUser = { ...currentUser, displayName };
    writeCurrentUser(updatedUser);

    try {
      await mergeUserState(currentUser.uid, {
        profile: profileState.current,
        displayName,
      });
    } catch (error) {
      console.warn("Profile save sync failed:", error);
    }

    onSaved(updatedUser);
    setModalOpen(false);
    setDirty(false);
    toast("Profile saved");
  });

  return { fillForm };
}

function renderProfileUI({
  user,
  profile,
  levelInfo,
  avg,
  rank,
  streak,
  lastJournal,
}) {
  const displayName = sanitizeText(
    user.displayName || profile.displayName || user.name,
    "User",
  );
  const tagline = sanitizeText(profile.tagline, "Student • Builder • Athlete");
  const bio = sanitizeText(
    profile.bio,
    "Add a short bio to sharpen your profile.",
  );
  const handle = buildHandle(profile, displayName, user);
  const titleState = readTitleState(profile, user.uid);

  setText("dashName", displayName);
  setText("sideUser", displayName);
  setText("sideSub", titleState?.title ? titleState.title : `Rank ${rank}`);

  setText("pfName", displayName);
  setText("pfTagline", tagline);
  setText("pfHandle", `@${handle}`);

  setText("pfDetailName", displayName);
  setText("pfDetailHandle", `@${handle}`);
  setText("pfDetailRank", rank);
  setText("pfBio", bio);

  setText("pfLevel", String(levelInfo.level));
  setText("pfXpText", `${levelInfo.remaining} / ${levelInfo.req} XP`);
  setText("pfRank", rank);
  setText("pfAvgText", `Avg ${Number.isFinite(avg) ? Math.round(avg) : "—"}`);
  setText("prStreak", `${streak} day${streak === 1 ? "" : "s"}`);
  setText(
    "prLastJournal",
    lastJournal ? `Last journal ${formatDate(lastJournal)}` : "Last journal —",
  );

  setText("dashLevel", `LVL ${levelInfo.level}`);
  setText("dashXpText", `${levelInfo.remaining} / ${levelInfo.req} XP`);
  const fill = document.getElementById("dashXpFill");
  if (fill) fill.style.width = `${Math.min(levelInfo.progress * 100, 100)}%`;

  renderTitleState(titleState);
  renderMembership(readMembership(user.uid));
}

function bindTitleSurvey(profileState, getUser) {
  buildSurveyDots();
  goToSurveyStep(0);

  const launch = () => {
    const currentUser = getUser();
    const titleState = readTitleState(profileState.current, currentUser?.uid);
    if (isTitleLocked(titleState)) {
      toast(`Title locked until ${formatDate(titleState.lockedUntil)}`);
      return;
    }
    resetSurveyAnswers();
    openTitleSurvey();
  };

  document
    .getElementById("prTitleTriggerHero")
    ?.addEventListener("click", launch);
  document
    .getElementById("prTitleTriggerCard")
    ?.addEventListener("click", launch);
  document
    .getElementById("titleSurveyClose")
    ?.addEventListener("click", closeTitleSurvey);
  document
    .getElementById("titleSurveyDone")
    ?.addEventListener("click", closeTitleSurvey);

  document
    .getElementById("titleSurveyOverlay")
    ?.addEventListener("click", (event) => {
      if (event.target?.id === "titleSurveyOverlay") closeTitleSurvey();
    });

  document.getElementById("titleSurveyBack")?.addEventListener("click", () => {
    goToSurveyStep(surveyState.step - 1);
  });

  document.getElementById("titleSurveyNext")?.addEventListener("click", () => {
    if (surveyState.step < TITLE_SURVEY_TEMPLATE.questions.length) {
      const currentAnswer = surveyState.answers[surveyState.step];
      if (!currentAnswer) {
        toast("Choose one option to continue");
        return;
      }
    }
    goToSurveyStep(surveyState.step + 1);
  });

  document
    .getElementById("titleSurveySave")
    ?.addEventListener("click", async () => {
      if (surveyState.answers.some((answer) => !answer)) {
        toast("Complete every step first");
        return;
      }

      const result = computeTitleResult(surveyState.answers);
      const now = Date.now();
      const payload = {
        version: TITLE_SURVEY_TEMPLATE.version,
        title: result.title,
        titleKey: result.key,
        description: result.description,
        scores: result.scores,
        answers: surveyState.answers.map((answerKey, index) => {
          const question = TITLE_SURVEY_TEMPLATE.questions[index];
          const option = question.options.find(
            (item) => item.key === answerKey,
          );
          return {
            questionId: question.id,
            answerKey,
            answerLabel: option?.label || "",
            stat: option?.stat || "",
          };
        }),
        completedAt: now,
        lockedUntil: now + TITLE_SURVEY_LOCK_MS,
      };

      const user = getUser();
      const savedTitleState = persistTitleState(
        user.uid,
        profileState,
        payload,
      );

      try {
        await mergeUserState(user.uid, {
          profile: {
            ...profileState.current,
            title: savedTitleState?.title || "",
            titleSurvey: savedTitleState,
          },
        });
      } catch (error) {
        console.warn("Title survey sync failed:", error);
      }

      renderTitleState(savedTitleState);
      setText(
        "tsLockedText",
        `You can take it again on ${formatDate(savedTitleState.lockedUntil)}.`,
      );
      goToSurveyStep(TITLE_SURVEY_TEMPLATE.questions.length + 1);
      toast("Title saved");
    });
}

document.addEventListener("DOMContentLoaded", async () => {
  let user = getCurrentUser();
  if (!user?.uid) {
    window.location.href = "login.html";
    return;
  }

  try {
    await syncUserState(user.uid);
    user = getCurrentUser() || user;
  } catch (error) {
    console.warn("Profile cloud sync failed:", error);
  }

  const profileState = {
    current: readUserProfile(user.uid),
  };

  if (
    (!profileState.current.displayName && (user.displayName || user.name)) ||
    !profileState.current.createdAt ||
    !profileState.current.handle
  ) {
    profileState.current = saveUserProfile(user.uid, {
      ...profileState.current,
      displayName:
        profileState.current.displayName || user.displayName || user.name,
      createdAt: profileState.current.createdAt || user.createdAt || Date.now(),
      handle:
        profileState.current.handle ||
        buildHandle(profileState.current, user.displayName || user.name, user),
    });
  }

  const bootTitleState = readTitleState(profileState.current, user.uid);
  if (bootTitleState) {
    profileState.current = saveUserProfile(user.uid, {
      ...profileState.current,
      titleSurvey: bootTitleState,
    });
  }

  const renderAll = (nextUser = user) => {
    user = nextUser || user;
    const accountState = readCachedAccountState(user.uid);
    const profile = profileState.current;
    const stats = accountState?.stats || user.stats || profile.stats || null;
    const avg = averageStat(stats);
    const rank =
      typeof accountState?.rank === "string" && accountState.rank.trim()
        ? accountState.rank.trim()
        : rankFromAverage(avg);
    const totalXP = Number.isFinite(Number(accountState?.totalXP))
      ? Math.max(0, Number(accountState.totalXP) || 0)
      : readTotalXP(user.uid);
    const levelInfo = getLevelInfo(totalXP);
    const journalEntries = readJournalEntries(user.uid);
    const streak = computeStreak(journalEntries);
    const lastJournal = journalEntries[0]?.date || null;

    renderProfileUI({
      user,
      profile,
      levelInfo,
      avg,
      rank,
      streak,
      lastJournal,
    });
  };

  bindEditModal(profileState, user, (updatedUser) => {
    user = updatedUser;
    renderAll(user);
  });

  bindTitleSurvey(profileState, () => user);

  if (user.uid) {
    subscribeToUserState(
      user.uid,
      () => {
        user = getCurrentUser() || user;
        profileState.current = readUserProfile(user.uid);
        renderAll(user);
      },
      (error) => {
        console.warn("Profile realtime sync failed:", error);
      },
    );
  }

  document.getElementById("pfUpgradeBtn")?.addEventListener("click", () => {
    window.location.href = "subscription.html";
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const titleState = readTitleState(profileState.current, user.uid);

    if (titleState) {
      persistTitleState(user.uid, profileState, titleState);

      try {
        await mergeUserState(user.uid, {
          profile: {
            ...profileState.current,
            titleSurvey: titleState,
          },
        });
      } catch (error) {
        console.warn("Title sync before logout failed:", error);
      }
    }

    logout();
  });

  document.addEventListener("keydown", (event) => {
    const surveyOpen = document
      .getElementById("titleSurveyOverlay")
      ?.classList.contains("is-open");
    const modalOpen = document
      .getElementById("prModal")
      ?.classList.contains("is-open");

    if (event.key === "Escape") {
      if (surveyOpen) closeTitleSurvey();
      if (modalOpen) setModalOpen(false);
    }
  });

  window.addEventListener("storage", (event) => {
    const profileKey = getStorageKey("aurak_user_profile", user.uid);
    const titleKey = getTitleSurveyKey(user.uid);
    const journalKey = getStorageKey(JOURNAL_KEY_BASE, user.uid);
    const xpKey = getStorageKey(XP_STORAGE_KEY, user.uid);
    const membershipKey = getStorageKey("aurak_membership", user.uid);
    const questKey = getStorageKey(QUEST_STORAGE_KEY, user.uid);

    if (
      [
        profileKey,
        titleKey,
        journalKey,
        xpKey,
        membershipKey,
        questKey,
      ].includes(event.key || "")
    ) {
      profileState.current = readUserProfile(user.uid);
      const liveTitleState = readTitleState(profileState.current, user.uid);
      if (liveTitleState) {
        profileState.current = {
          ...profileState.current,
          titleSurvey: liveTitleState,
        };
      }
      renderAll(user);
    }
  });

  renderAll(user);
});
