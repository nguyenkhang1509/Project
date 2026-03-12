import {
  getCurrentUser,
  getStorageKey,
  logout,
  mergeUserState,
  readCachedUserProfile,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const JOURNAL_KEY_BASE = "aurak_journal_v1";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;
const TITLE_SURVEY_LOCK_MS = 7 * 24 * 60 * 60 * 1000;
const TITLE_SURVEY_VERSION = "aurak-title-profile-v2";
const TITLE_SURVEY_STORAGE_KEY = "aurak_title_survey_v1";

const TITLE_SURVEY_TEMPLATE = {
  version: TITLE_SURVEY_VERSION,
  questions: [
    {
      id: "drive",
      title: "What pulls you forward the hardest right now?",
      subtitle:
        "Placeholder copy. Your co-founder can replace the question, option text, and weighting later.",
      options: [
        {
          key: "build",
          label: "Build something real",
          sublabel: "Execution, output, and visible progress matter most.",
          icon: "fa-solid fa-hammer",
          weights: { Vanguard: 3, Architect: 2, Ascendant: 1 },
        },
        {
          key: "mastery",
          label: "Become elite",
          sublabel: "You care about skill, sharpness, and level-ups.",
          icon: "fa-solid fa-crosshairs",
          weights: { Ascendant: 3, Strategist: 2, Sentinel: 1 },
        },
        {
          key: "influence",
          label: "Lead and move people",
          sublabel: "Direction, presence, and responsibility drive you.",
          icon: "fa-solid fa-crown",
          weights: { Vanguard: 2, Catalyst: 3, Strategist: 1 },
        },
        {
          key: "meaning",
          label: "Create something meaningful",
          sublabel: "Purpose and impact are bigger than speed.",
          icon: "fa-solid fa-star",
          weights: { Architect: 2, Sentinel: 2, Catalyst: 2 },
        },
      ],
    },
    {
      id: "mode",
      title: "Which operating mode feels the most natural to you?",
      subtitle:
        "Pick the one that feels like your default state under normal pressure.",
      options: [
        {
          key: "calm",
          label: "Calm and deliberate",
          sublabel: "You think first, then move with control.",
          icon: "fa-solid fa-mountain",
          weights: { Strategist: 3, Architect: 2, Sentinel: 1 },
        },
        {
          key: "aggressive",
          label: "Fast and relentless",
          sublabel: "Momentum solves more than hesitation.",
          icon: "fa-solid fa-bolt",
          weights: { Vanguard: 3, Ascendant: 2, Catalyst: 1 },
        },
        {
          key: "adaptive",
          label: "Adaptive and flexible",
          sublabel: "You shift gears quickly based on what the moment needs.",
          icon: "fa-solid fa-compass",
          weights: { Architect: 2, Catalyst: 2, Strategist: 1 },
        },
        {
          key: "steady",
          label: "Steady and durable",
          sublabel: "You outlast people more than you outpace them.",
          icon: "fa-solid fa-shield-halved",
          weights: { Sentinel: 3, Ascendant: 1, Strategist: 1 },
        },
      ],
    },
    {
      id: "edge",
      title: "Where do you want your edge to show the most?",
      subtitle: "This helps the title lean toward your strongest lane.",
      options: [
        {
          key: "systems",
          label: "Systems and structure",
          sublabel: "Frameworks, planning, optimization, and clean thinking.",
          icon: "fa-solid fa-diagram-project",
          weights: { Architect: 3, Strategist: 2 },
        },
        {
          key: "presence",
          label: "Presence and confidence",
          sublabel: "You want people to feel your energy and force.",
          icon: "fa-solid fa-fire",
          weights: { Vanguard: 2, Catalyst: 3, Ascendant: 1 },
        },
        {
          key: "consistency",
          label: "Consistency and discipline",
          sublabel: "Daily reps matter more than hype.",
          icon: "fa-solid fa-repeat",
          weights: { Ascendant: 3, Sentinel: 2 },
        },
        {
          key: "judgment",
          label: "Judgment and decision-making",
          sublabel: "You want to choose well under uncertainty.",
          icon: "fa-solid fa-chess-knight",
          weights: { Strategist: 3, Architect: 1, Sentinel: 1 },
        },
      ],
    },
    {
      id: "pressure",
      title: "When pressure rises, what usually happens to you?",
      subtitle:
        "Choose the answer that feels true most often, not the one that sounds coolest.",
      options: [
        {
          key: "attack",
          label: "I attack it directly",
          sublabel: "I would rather engage than circle around it.",
          icon: "fa-solid fa-sword",
          weights: { Vanguard: 3, Catalyst: 1, Ascendant: 1 },
        },
        {
          key: "analyze",
          label: "I slow down and analyze",
          sublabel: "I need the pattern before I move hard.",
          icon: "fa-solid fa-brain",
          weights: { Strategist: 3, Architect: 1, Sentinel: 1 },
        },
        {
          key: "endure",
          label: "I absorb it and keep going",
          sublabel: "I can carry load for a long time.",
          icon: "fa-solid fa-anchor",
          weights: { Sentinel: 3, Ascendant: 2 },
        },
        {
          key: "adapt",
          label: "I pivot until something works",
          sublabel: "I stay mobile instead of rigid.",
          icon: "fa-solid fa-shuffle",
          weights: { Architect: 2, Catalyst: 2, Vanguard: 1 },
        },
      ],
    },
    {
      id: "standard",
      title: "What standard do you quietly hold yourself to?",
      subtitle: "This is the rule you return to even when nobody is watching.",
      options: [
        {
          key: "greatness",
          label: "I should be exceptional",
          sublabel: "Average feels like leaving potential on the table.",
          icon: "fa-solid fa-arrow-trend-up",
          weights: { Ascendant: 3, Vanguard: 1, Catalyst: 1 },
        },
        {
          key: "precision",
          label: "I should be precise",
          sublabel: "Sloppy work bothers me more than slow work.",
          icon: "fa-solid fa-ruler-combined",
          weights: { Architect: 3, Strategist: 2 },
        },
        {
          key: "reliable",
          label: "I should be dependable",
          sublabel: "My word and consistency need to be strong.",
          icon: "fa-solid fa-lock",
          weights: { Sentinel: 3, Ascendant: 1, Strategist: 1 },
        },
        {
          key: "impactful",
          label: "I should matter",
          sublabel: "What I do should move something bigger than myself.",
          icon: "fa-solid fa-wave-square",
          weights: { Catalyst: 3, Vanguard: 1, Architect: 1 },
        },
      ],
    },
    {
      id: "legacy",
      title: "What do you want people to feel from your name?",
      subtitle: "Final placeholder question for the title result logic.",
      options: [
        {
          key: "respect",
          label: "Respect",
          sublabel: "Steady authority, trust, and capability.",
          icon: "fa-solid fa-medal",
          weights: { Sentinel: 2, Strategist: 2, Vanguard: 1 },
        },
        {
          key: "energy",
          label: "Energy",
          sublabel: "Momentum, intensity, and charge.",
          icon: "fa-solid fa-burst",
          weights: { Vanguard: 3, Catalyst: 2, Ascendant: 1 },
        },
        {
          key: "vision",
          label: "Vision",
          sublabel: "Original thinking and intelligent design.",
          icon: "fa-solid fa-eye",
          weights: { Architect: 3, Strategist: 1, Catalyst: 1 },
        },
        {
          key: "rise",
          label: "Growth",
          sublabel: "Relentless evolution and upward pressure.",
          icon: "fa-solid fa-mountain-sun",
          weights: { Ascendant: 3, Vanguard: 1, Sentinel: 1 },
        },
      ],
    },
  ],
  results: {
    Vanguard:
      "Direct, forceful, and momentum-driven. You move first, take responsibility, and pull action out of pressure.",
    Architect:
      "Structured, inventive, and precise. You turn raw ambition into systems that actually hold shape.",
    Strategist:
      "Measured, sharp, and composed. You win by reading patterns early and choosing the cleanest line.",
    Ascendant:
      "Disciplined, hungry, and growth-obsessed. You keep climbing because you refuse to stay the same.",
    Sentinel:
      "Reliable, grounded, and resilient. You project steadiness and earn respect through consistency under weight.",
    Catalyst:
      "Magnetic, activating, and high-impact. You energize rooms, spark motion, and make things happen around you.",
  },
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

  return {
    version: value.version || TITLE_SURVEY_VERSION,
    title: value.title,
    titleKey: value.titleKey || value.title,
    description: value.description || "",
    answers: Array.isArray(value.answers) ? value.answers : [],
    completedAt: Number(value.completedAt || 0) || Date.now(),
    lockedUntil: Number(value.lockedUntil || 0) || 0,
  };
}

function writeTitleState(uid, titleState) {
  const safe = normalizeTitleState(titleState);
  if (!uid || !safe) return null;
  localStorage.setItem(getTitleSurveyKey(uid), JSON.stringify(safe));
  return safe;
}

function readTitleState(profile, uid) {
  if (!uid) return normalizeTitleState(profile?.titleSurvey);

  const localState = normalizeTitleState(
    safeParseJSON(localStorage.getItem(getTitleSurveyKey(uid)), null),
  );
  if (localState) return localState;

  const profileState = normalizeTitleState(profile?.titleSurvey);
  if (profileState) {
    writeTitleState(uid, profileState);
    return profileState;
  }

  return null;
}

function persistTitleState(uid, profileState, titleState) {
  const safe = writeTitleState(uid, titleState);
  if (!uid || !safe) return safe;

  profileState.current = saveUserProfile(uid, {
    ...profileState.current,
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
  if (avg >= 80) return "A";
  if (avg >= 60) return "B";
  if (avg >= 40) return "C";
  if (avg >= 20) return "D";
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
  const scoreMap = new Map();
  TITLE_SURVEY_TEMPLATE.questions.forEach((question, index) => {
    const selectedKey = answers[index];
    const option = question.options.find((item) => item.key === selectedKey);
    if (!option) return;
    Object.entries(option.weights || {}).forEach(([resultKey, points]) => {
      scoreMap.set(
        resultKey,
        (scoreMap.get(resultKey) || 0) + Number(points || 0),
      );
    });
  });

  let bestKey = Object.keys(TITLE_SURVEY_TEMPLATE.results)[0] || "Vanguard";
  let bestScore = -Infinity;
  Object.keys(TITLE_SURVEY_TEMPLATE.results).forEach((key) => {
    const score = scoreMap.get(key) || 0;
    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  });

  return {
    key: bestKey,
    title: bestKey,
    description: TITLE_SURVEY_TEMPLATE.results[bestKey] || "",
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

  setText(
    "tsStepLabel",
    `Question ${surveyState.step + 1} of ${TITLE_SURVEY_TEMPLATE.questions.length}`,
  );
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
        >
          <span class="ts-chipIcon"><i class="${escapeHtml(option.icon)}"></i></span>
          <span class="ts-chipText">
            <span class="ts-chipLabel">${escapeHtml(option.label)}</span>
            <span class="ts-chipSub">${escapeHtml(option.sublabel)}</span>
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
        answers: surveyState.answers.map((answerKey, index) => {
          const question = TITLE_SURVEY_TEMPLATE.questions[index];
          const option = question.options.find(
            (item) => item.key === answerKey,
          );
          return {
            questionId: question.id,
            answerKey,
            answerLabel: option?.label || "",
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
    const profile = profileState.current;
    const stats = user.stats || profile.stats || null;
    const avg = averageStat(stats);
    const rank = rankFromAverage(avg);
    const totalXP = readTotalXP(user.uid);
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
  