import {
  getCurrentUser,
  readCachedUserProfile,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

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
    console.warn("Sequence cloud sync failed:", error);
  }

  const profile = readCachedUserProfile(user.uid);
  if (!user.stats && profile?.stats) {
    user = {
      ...user,
      stats: profile.stats,
      ...(profile.survey ? { survey: profile.survey } : {}),
    };
    writeCurrentUser(user);
  }

  const textWrap = document.getElementById("sequence-text");
  const typedEl = document.getElementById("sequence-typed");
  const nextBtn = document.getElementById("sequence-next");
  const startLink = document.getElementById("sequence-start");

  if (!textWrap || !typedEl || !nextBtn || !startLink) return;

  const playerName = user.displayName || "Player";

  const slides = [
    `Welcome, Player ${playerName}...`,
    "This world does not reward the weak...",
    "Only those who act will grow stronger...",
    "Are you ready to enter the system?",
  ];

  let index = 0;

  const transitionTime = 260;
  const baseSpeed = 58;
  const jitter = 16;
  const endPause = 1100;
  const punctPause = 420;
  const startDelay = 260;

  let typingJob = 0;

  function renderNav(i) {
    const isLast = i === slides.length - 1;
    nextBtn.classList.toggle("is-hidden", isLast);
    startLink.classList.toggle("is-visible", isLast);
  }

  function getDelayForChar(ch) {
    const randomJitter = Math.floor(Math.random() * jitter);
    const isPunct =
      ch === "." || ch === "," || ch === "!" || ch === "?" || ch === ":";
    const isSpace = ch === " ";

    return (
      baseSpeed + randomJitter + (isSpace ? 25 : 0) + (isPunct ? punctPause : 0)
    );
  }

  function typeSentence(sentence, jobId) {
    typedEl.textContent = "";
    let i = 0;

    const step = () => {
      if (jobId !== typingJob) return;

      if (i <= sentence.length) {
        typedEl.textContent = sentence.slice(0, i);
        const ch = sentence[i - 1] || "";
        i += 1;
        setTimeout(step, getDelayForChar(ch));
      } else {
        setTimeout(() => {
          if (jobId !== typingJob) return;
          renderNav(index);
        }, endPause);
      }
    };

    setTimeout(() => {
      if (jobId !== typingJob) return;
      step();
    }, startDelay);
  }

  function showSlide(i, animate) {
    typingJob += 1;
    const jobId = typingJob;
    const sentence = slides[i];

    nextBtn.classList.remove("is-hidden");
    startLink.classList.remove("is-visible");

    if (!animate) {
      textWrap.classList.add("is-visible");
      textWrap.classList.remove("is-exiting");
      typeSentence(sentence, jobId);
      return;
    }

    textWrap.classList.remove("is-visible");
    textWrap.classList.add("is-exiting");

    setTimeout(() => {
      if (jobId !== typingJob) return;

      textWrap.classList.remove("is-exiting");
      void textWrap.offsetWidth;
      textWrap.classList.add("is-visible");
      typeSentence(sentence, jobId);
    }, transitionTime);
  }

  const hasBaseline = !!(user.stats || profile?.stats);
  startLink.href = hasBaseline ? "stats.html" : "survey.html";
  startLink.textContent = hasBaseline ? "Continue ->" : "Start ->";

  showSlide(index, false);

  function goNext() {
    if (index < slides.length - 1) {
      index += 1;
      showSlide(index, true);
    }
  }

  nextBtn.addEventListener("click", goNext);

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goNext();
  });
});
