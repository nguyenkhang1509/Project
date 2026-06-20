import {
  enqueueHunterCelebration,
  getCurrentUser,
  readCachedAccountState,
  readCachedUserProfile,
  readHunterCelebrationQueue,
  shiftHunterCelebration,
} from "./userStore.js";

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
const HUNTER_RANK_ORDER = ["E", "D", "C", "B", "A", "S"];
const HERO_FULL_RANK_SET = ["E", "D", "C", "B", "A", "S"];
const HERO_RANK_ART_SUPPORT = {
  executioner: HERO_FULL_RANK_SET,
  insightphantom: HERO_FULL_RANK_SET,
  reaper: HERO_FULL_RANK_SET,
  saint: HERO_FULL_RANK_SET,
  vanguard: HERO_FULL_RANK_SET,
};

let hunterOpeningToken = 0;

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function averageStat(stats) {
  if (!stats || typeof stats !== "object") return null;
  const values = ["Physical", "Intellectual", "Mental", "Confidence", "Discipline"]
    .map((key) => Number(stats[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rankFromAverage(avg) {
  if (!Number.isFinite(avg)) return "-";
  if (avg >= 90) return "S";
  if (avg >= 75) return "A";
  if (avg >= 60) return "B";
  if (avg >= 45) return "C";
  if (avg >= 25) return "D";
  return "E";
}

export function normalizeRank(rank) {
  const value = safeString(rank).toUpperCase();
  if (value === "S") return "S";
  if (value === "A") return "A";
  if (value === "B") return "B";
  if (value === "C") return "C";
  if (value === "D") return "D";
  if (value === "E") return "E";
  return "E";
}

export function hasKnownRank(rank) {
  const value = safeString(rank).toUpperCase();
  return HUNTER_RANK_ORDER.includes(value);
}

export function rankProgressIndex(rank) {
  return HUNTER_RANK_ORDER.indexOf(normalizeRank(rank));
}

function normalizeHeroMoodKey(moodKey) {
  const key = safeString(moodKey).toLowerCase();
  if (key === "warming-up" || key === "warmingup" || key === "warmup") {
    return "warming-up";
  }
  if (key === "locked-in" || key === "lockedin") return "locked-in";
  if (key === "focused") return "focused";
  if (key === "exhausted") return "exhausted";
  return "";
}

export function heroMoodKeyFromTaskCount(taskCount) {
  const count = Math.max(0, Number(taskCount) || 0);
  if (count <= 2) return "exhausted";
  if (count <= 5) return "warming-up";
  if (count <= 10) return "focused";
  return "locked-in";
}

function heroMoodFileKey(moodKey) {
  const key = normalizeHeroMoodKey(moodKey);
  if (key === "warming-up") return "warmingup";
  if (key === "locked-in") return "lockedin";
  return key || "exhausted";
}

export function isLockedInMoodKey(moodKey) {
  return heroMoodFileKey(moodKey) === "lockedin";
}

export function heroCharacterKeyFromProfile(profile) {
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

function hasHeroRankArt(characterKey, rank) {
  if (!hasKnownRank(rank)) return false;
  const key = safeString(characterKey).toLowerCase();
  if (!key) return false;
  return (HERO_RANK_ART_SUPPORT[key] || ["E"]).includes(normalizeRank(rank));
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

export function hunterFigureSrcCandidatesFromCharacterRankAndMoodKey(
  characterKey,
  rank,
  moodKey,
) {
  const key = safeString(characterKey).toLowerCase();
  const safeRank = normalizeRank(rank);
  if (!key || !hasHeroRankArt(key, safeRank)) return [];
  const moodFile = heroMoodFileKey(moodKey);
  return heroCharacterAssetFileKeys(key, safeRank, moodKey).map(
    (assetKey) => `./${safeRank}_${assetKey}_${moodFile}.png`,
  );
}

function getHunterLockedInOpeningConfig(characterKey, rank) {
  const key = safeString(characterKey).toLowerCase();
  if (normalizeRank(rank) !== "S" || !key) return null;
  return HUNTER_LOCKED_IN_OPENINGS[key] || null;
}

export function getHunterDisplayName(profile, characterKey) {
  const title =
    safeString(profile?.title) || safeString(profile?.titleSurvey?.title);
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

export function queueHunterLockedInCelebration(options = {}) {
  const uid = safeString(options.uid);
  if (!uid) return false;

  const previousTaskCount = Math.max(
    0,
    Math.floor(Number(options.previousTaskCount) || 0),
  );
  const nextTaskCount = Math.max(
    0,
    Math.floor(
      Number.isFinite(Number(options.nextTaskCount))
        ? Number(options.nextTaskCount)
        : Number(options.taskCount) || 0,
    ),
  );
  const profile =
    options.profile && typeof options.profile === "object"
      ? options.profile
      : null;
  const characterKey =
    safeString(options.characterKey).toLowerCase() ||
    heroCharacterKeyFromProfile(profile);
  const previousMoodKey =
    normalizeHeroMoodKey(options.previousMoodKey) ||
    heroMoodKeyFromTaskCount(previousTaskCount);
  const nextMoodKey =
    normalizeHeroMoodKey(options.nextMoodKey) ||
    heroMoodKeyFromTaskCount(nextTaskCount);
  const rank = normalizeRank(options.rank);

  if (rank !== "S" || !characterKey) return false;
  if (isLockedInMoodKey(previousMoodKey) || !isLockedInMoodKey(nextMoodKey)) {
    return false;
  }
  if (!getHunterLockedInOpeningConfig(characterKey, rank)) return false;

  enqueueHunterCelebration(uid, {
    type: "locked-in",
    rank,
    taskCount: nextTaskCount,
    moodKey: nextMoodKey,
    characterKey,
    displayName:
      safeString(options.displayName) ||
      getHunterDisplayName(profile, characterKey),
  });
  return true;
}

export function queueHunterRankUpCelebration(options = {}) {
  const uid = safeString(options.uid);
  if (!uid) return false;

  if (!hasKnownRank(options.previousRank) || !hasKnownRank(options.nextRank)) {
    return false;
  }

  const previousRank = normalizeRank(options.previousRank);
  const nextRank = normalizeRank(options.nextRank);
  if (rankProgressIndex(nextRank) <= rankProgressIndex(previousRank)) {
    return false;
  }

  const profile =
    options.profile && typeof options.profile === "object"
      ? options.profile
      : null;
  const characterKey =
    safeString(options.characterKey).toLowerCase() ||
    heroCharacterKeyFromProfile(profile);
  if (
    !characterKey ||
    !hasHeroRankArt(characterKey, previousRank) ||
    !hasHeroRankArt(characterKey, nextRank)
  ) {
    return false;
  }

  const taskCount = Math.max(0, Math.floor(Number(options.taskCount) || 0));
  const moodKey =
    normalizeHeroMoodKey(options.moodKey) || heroMoodKeyFromTaskCount(taskCount);

  enqueueHunterCelebration(uid, {
    type: "rank-up",
    rank: nextRank,
    previousRank,
    nextRank,
    taskCount,
    moodKey,
    characterKey,
    displayName:
      safeString(options.displayName) ||
      getHunterDisplayName(profile, characterKey),
  });
  return true;
}

function ensureHunterCinematicRoot() {
  let overlay = document.getElementById("hunterCinematic");
  if (overlay) return overlay;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="hunter-cinematic" id="hunterCinematic" aria-hidden="true">
      <div class="hunter-cinematic-stage" id="hunterCinematicStage">
        <video
          class="hunter-cinematic-video"
          id="hunterCinematicVideo"
          muted
          playsinline
          preload="auto"
          aria-hidden="true"
        ></video>
        <div class="hunter-cinematic-aura" aria-hidden="true"></div>
        <img class="hunter-cinematic-figure" id="hunterCinematicFigure" alt="" />
        <img class="hunter-cinematic-figure-next" id="hunterCinematicFigureNext" alt="" />
        <div
          class="hunter-lock-popup"
          id="hunterLockPopup"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div class="hunter-lock-popup-spark" aria-hidden="true"></div>
          <p class="hunter-lock-popup-kicker" id="hunterLockPopupKicker">Congratulations</p>
          <h2 class="hunter-lock-popup-title" id="hunterLockPopupTitle">Locked In State Reached</h2>
          <p class="hunter-lock-popup-subtitle" id="hunterLockPopupSubtitle">
            Your hunter has entered peak focus.
          </p>
          <div class="hunter-lock-popup-tags">
            <span class="hunter-lock-popup-tag" id="hunterLockPopupRank">Rank S</span>
            <span class="hunter-lock-popup-tag" id="hunterLockPopupCharacter">Hunter</span>
            <span class="hunter-lock-popup-tag" id="hunterLockPopupTasks">11 Quests</span>
          </div>
          <div class="hunter-lock-popup-actions">
            <button
              type="button"
              class="hunter-lock-popup-button"
              id="hunterLockPopupButton"
            >
              Continue
            </button>
          </div>
        </div>
        <div class="hunter-cinematic-flare" aria-hidden="true"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);
  return document.getElementById("hunterCinematic");
}

function getHunterCinematicEls() {
  ensureHunterCinematicRoot();
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
  };
}

function setImageWithFallback(imgEl, candidates) {
  if (!imgEl) return;
  const list = Array.isArray(candidates)
    ? candidates.map((item) => safeString(item)).filter(Boolean)
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

function clearHunterCinematicState(overlay, stage) {
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
}

function setHunterCinematicReturnTarget(stage, targetEl) {
  if (!stage || !targetEl) return;

  const stageRect = stage.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const stageCenterX = stageRect.left + stageRect.width / 2;
  const stageCenterY = stageRect.top + stageRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const scale = Math.max(
    0.18,
    Math.min(
      targetRect.width / Math.max(stageRect.width, 1),
      targetRect.height / Math.max(stageRect.height, 1),
      0.52,
    ),
  );

  stage.style.setProperty(
    "--cinematic-return-x",
    `${Math.round(targetCenterX - stageCenterX)}px`,
  );
  stage.style.setProperty(
    "--cinematic-return-y",
    `${Math.round(targetCenterY - stageCenterY)}px`,
  );
  stage.style.setProperty("--cinematic-return-scale", String(scale));
}

function populateLockedInPopup(elements, options) {
  const {
    overlay,
    popupKicker,
    popupTitle,
    popupSubtitle,
    popupRank,
    popupCharacter,
    popupTasks,
    popupButton,
  } = elements;
  if (!overlay) return;

  overlay.dataset.character = safeString(options.characterKey).toLowerCase();
  if (popupKicker) popupKicker.textContent = "Congratulations";
  if (popupTitle) popupTitle.textContent = "Locked In State Reached";
  if (popupSubtitle) {
    popupSubtitle.textContent = `${options.displayName} has awakened at peak focus. ${options.taskCount} quests cleared today.`;
  }
  if (popupRank) popupRank.textContent = `Rank ${options.rank}`;
  if (popupCharacter) popupCharacter.textContent = options.displayName;
  if (popupTasks) {
    popupTasks.textContent = `${options.taskCount} Quest${options.taskCount === 1 ? "" : "s"}`;
  }
  if (popupButton) popupButton.textContent = options.returnLabel || "Continue";
}

function populateRankUpPopup(elements, options) {
  const {
    overlay,
    popupKicker,
    popupTitle,
    popupSubtitle,
    popupRank,
    popupCharacter,
    popupTasks,
    popupButton,
  } = elements;
  if (!overlay) return;

  overlay.dataset.character = safeString(options.characterKey).toLowerCase();
  if (popupKicker) popupKicker.textContent = "Rank Up";
  if (popupTitle) popupTitle.textContent = `Rank ${options.nextRank} Unlocked`;
  if (popupSubtitle) {
    popupSubtitle.textContent = `${options.displayName} advanced from Rank ${options.previousRank} to Rank ${options.nextRank}.`;
  }
  if (popupRank) popupRank.textContent = `New Rank ${options.nextRank}`;
  if (popupCharacter) popupCharacter.textContent = options.displayName;
  if (popupTasks) popupTasks.textContent = `${options.previousRank} -> ${options.nextRank}`;
  if (popupButton) popupButton.textContent = options.returnLabel || "Continue";
}

export function isHunterCinematicActive() {
  const overlay = document.getElementById("hunterCinematic");
  return !!overlay?.classList.contains("is-active");
}

export function playHunterLockedInOpeningSequence(options = {}) {
  const elements = getHunterCinematicEls();
  const {
    overlay,
    stage,
    video,
    figure,
    figureNext,
    popup,
    popupButton,
  } = elements;
  if (!overlay || !stage || !video || !figure) return false;

  const openingConfig = getHunterLockedInOpeningConfig(
    options.characterKey,
    options.rank,
  );
  if (!openingConfig) return false;

  const taskCount = Math.max(0, Number(options.taskCount) || 0);
  const displayName = safeString(options.displayName) || openingConfig.label;
  const targetEl =
    options.returnTargetEl || document.querySelector(".hunter-figure-shell");

  const token = hunterOpeningToken + 1;
  hunterOpeningToken = token;

  clearTimeout(overlay._hunterOpeningFallbackTimer);
  clearTimeout(overlay._hunterOpeningReturnTimer);
  if (overlay._hunterReturnHandler && popupButton) {
    popupButton.removeEventListener("click", overlay._hunterReturnHandler);
    delete overlay._hunterReturnHandler;
  }
  if (overlay._hunterKeydownHandler) {
    overlay.removeEventListener("keydown", overlay._hunterKeydownHandler);
    delete overlay._hunterKeydownHandler;
  }

  clearHunterCinematicState(overlay, stage);
  populateLockedInPopup(elements, {
    characterKey: options.characterKey,
    displayName,
    rank: normalizeRank(options.rank),
    taskCount,
    returnLabel: options.returnLabel,
  });

  const figureCandidates = [
    safeString(options.activeFigureSrc),
    ...(Array.isArray(options.figureCandidates) ? options.figureCandidates : []),
    openingConfig.figureFallback,
  ].filter(Boolean);
  setImageWithFallback(figure, figureCandidates);
  if (figureNext) {
    figureNext.onerror = null;
    figureNext.removeAttribute("src");
    figureNext.style.visibility = "hidden";
  }

  void overlay.offsetWidth;
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-active");

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const finish = () => {
    if (hunterOpeningToken !== token) return;
    if (overlay._hunterReturnHandler && popupButton) {
      popupButton.removeEventListener("click", overlay._hunterReturnHandler);
      delete overlay._hunterReturnHandler;
    }
    if (overlay._hunterKeydownHandler) {
      overlay.removeEventListener("keydown", overlay._hunterKeydownHandler);
      delete overlay._hunterKeydownHandler;
    }
    clearTimeout(overlay._hunterOpeningFallbackTimer);
    clearTimeout(overlay._hunterOpeningReturnTimer);
    video.pause();
    try {
      video.currentTime = 0;
    } catch {}
    clearHunterCinematicState(overlay, stage);
    if (figureNext) {
      figureNext.onerror = null;
      figureNext.removeAttribute("src");
      figureNext.style.visibility = "hidden";
    }
    if (typeof options.onFinish === "function") options.onFinish();
  };

  const returnToTarget = () => {
    if (hunterOpeningToken !== token) return;
    overlay.classList.remove("is-popup-live");
    setHunterCinematicReturnTarget(stage, targetEl);
    void stage.offsetWidth;
    overlay.classList.add("is-returning");
    overlay._hunterOpeningReturnTimer = setTimeout(finish, HUNTER_OPENING_RETURN_MS);
  };

  const showFloatingFigure = () => {
    if (hunterOpeningToken !== token) return;
    clearTimeout(overlay._hunterOpeningFallbackTimer);
    overlay.classList.add("is-prime", "is-floating");
    if (popup) {
      overlay.classList.add("is-popup-live");
      popupButton?.focus({ preventScroll: true });
    }
  };

  const onOverlayKeyDown = (event) => {
    if (hunterOpeningToken !== token) return;
    if (event.key === "Escape" && overlay.classList.contains("is-popup-live")) {
      event.preventDefault();
      returnToTarget();
    }
  };

  overlay._hunterReturnHandler = returnToTarget;
  overlay._hunterKeydownHandler = onOverlayKeyDown;
  popupButton?.addEventListener("click", returnToTarget);
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
      popupButton?.focus({ preventScroll: true });
    }
    return true;
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

  return true;
}

export function playHunterRankUpSequence(options = {}) {
  const elements = getHunterCinematicEls();
  const {
    overlay,
    stage,
    video,
    figure,
    figureNext,
    popupButton,
  } = elements;
  if (!overlay || !stage || !video || !figure || !figureNext) return false;

  const displayName = safeString(options.displayName) || "Hunter";
  const previousRank = normalizeRank(options.previousRank);
  const nextRank = normalizeRank(options.nextRank);
  const targetEl =
    options.returnTargetEl || document.querySelector(".hunter-figure-shell");

  const token = hunterOpeningToken + 1;
  hunterOpeningToken = token;

  clearTimeout(overlay._hunterOpeningFallbackTimer);
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

  clearHunterCinematicState(overlay, stage);
  populateRankUpPopup(elements, {
    characterKey: options.characterKey,
    displayName,
    previousRank,
    nextRank,
    returnLabel: options.returnLabel,
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
  overlay.classList.add(
    "is-active",
    "is-rank-up-mode",
    "is-rank-up-live",
    "is-popup-live",
  );

  const finish = () => {
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
    clearHunterCinematicState(overlay, stage);
    figure.onerror = null;
    figureNext.onerror = null;
    figureNext.removeAttribute("src");
    figureNext.style.visibility = "hidden";
    if (typeof options.onFinish === "function") options.onFinish();
  };

  const returnToTarget = () => {
    if (hunterOpeningToken !== token) return;
    overlay.classList.remove("is-popup-live");
    setHunterCinematicReturnTarget(stage, targetEl);
    void stage.offsetWidth;
    overlay.classList.add("is-returning");
    overlay._hunterOpeningReturnTimer = setTimeout(finish, HUNTER_OPENING_RETURN_MS);
  };

  const onOverlayKeyDown = (event) => {
    if (hunterOpeningToken !== token) return;
    if (event.key === "Escape" && overlay.classList.contains("is-popup-live")) {
      event.preventDefault();
      returnToTarget();
    }
  };

  overlay._hunterReturnHandler = returnToTarget;
  overlay._hunterKeydownHandler = onOverlayKeyDown;
  popupButton?.addEventListener("click", returnToTarget);
  overlay.addEventListener("keydown", onOverlayKeyDown);

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    overlay.classList.add("is-rank-up-evolving");
    popupButton?.focus({ preventScroll: true });
    return true;
  }

  overlay._hunterRankUpSwapTimer = setTimeout(() => {
    if (hunterOpeningToken !== token) return;
    overlay.classList.add("is-rank-up-evolving");
  }, 260);

  popupButton?.focus({ preventScroll: true });
  return true;
}

function readCurrentTaskCount(accountState) {
  const completed =
    accountState?.quests?.completed && typeof accountState.quests.completed === "object"
      ? accountState.quests.completed
      : {};
  return Object.values(completed).filter(Boolean).length;
}

function playQueuedCelebrationEvent(uid, event, options) {
  const accountState = options.accountState || readCachedAccountState(uid);
  const profile =
    options.profile ||
    (accountState?.profile && typeof accountState.profile === "object"
      ? accountState.profile
      : null) ||
    readCachedUserProfile(uid);
  const taskCount = Math.max(
    0,
    Number(event.taskCount) || readCurrentTaskCount(accountState),
  );
  const moodKey =
    normalizeHeroMoodKey(event.moodKey) || heroMoodKeyFromTaskCount(taskCount);
  const characterKey =
    safeString(event.characterKey).toLowerCase() || heroCharacterKeyFromProfile(profile);
  const displayName = safeString(event.displayName) || getHunterDisplayName(profile, characterKey);
  const activeFigureSrc =
    safeString(options.activeFigureSrc) ||
    safeString(accountState?.heroStatus?.figureSrc) ||
    safeString(document.getElementById("hunterFigure")?.currentSrc) ||
    safeString(document.getElementById("hunterFigure")?.src);
  const finish = () => {
    if (typeof options.onFinish === "function") options.onFinish();
    pumpHunterCelebrationQueue({ ...options, uid, accountState: null, profile: null, onFinish: null });
  };

  if (event.type === "locked-in") {
    const rank = normalizeRank(event.rank || accountState?.rank || "S");
    const openingConfig = getHunterLockedInOpeningConfig(characterKey, rank);
    const figureCandidates = hunterFigureSrcCandidatesFromCharacterRankAndMoodKey(
      characterKey,
      rank,
      "locked-in",
    );
    if (!openingConfig || !figureCandidates.length) return false;

    shiftHunterCelebration(uid, event.id);
    return playHunterLockedInOpeningSequence({
      characterKey,
      rank,
      taskCount: Math.max(11, taskCount),
      displayName,
      activeFigureSrc,
      figureCandidates,
      returnTargetEl: options.returnTargetEl,
      returnLabel: options.returnLabel,
      onFinish: finish,
    });
  }

  if (event.type === "rank-up") {
    const previousRank = normalizeRank(event.previousRank);
    const nextRank = normalizeRank(event.nextRank);
    const previousFigureCandidates =
      hunterFigureSrcCandidatesFromCharacterRankAndMoodKey(
        characterKey,
        previousRank,
        moodKey,
      );
    const nextFigureCandidates = hunterFigureSrcCandidatesFromCharacterRankAndMoodKey(
      characterKey,
      nextRank,
      moodKey,
    );
    if (!previousFigureCandidates.length || !nextFigureCandidates.length) {
      return false;
    }

    shiftHunterCelebration(uid, event.id);
    return playHunterRankUpSequence({
      characterKey,
      displayName,
      previousRank,
      nextRank,
      previousFigureCandidates,
      nextFigureCandidates,
      returnTargetEl: options.returnTargetEl,
      returnLabel: options.returnLabel,
      onFinish: finish,
    });
  }

  return false;
}

export function pumpHunterCelebrationQueue(options = {}) {
  if (isHunterCinematicActive()) return false;

  const uid = options.uid || getCurrentUser()?.uid;
  if (!uid) return false;

  let queue = readHunterCelebrationQueue(uid);
  while (queue.length) {
    const event = queue[0];
    if (playQueuedCelebrationEvent(uid, event, options)) {
      return true;
    }
    shiftHunterCelebration(uid, event.id);
    queue = readHunterCelebrationQueue(uid);
  }

  return false;
}
