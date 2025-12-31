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

  if (!user?.uid) {
    window.location.href = "login.html";
    return;
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

  const TRANSITION_TIME = 260;

  const BASE_SPEED = 58;
  const JITTER = 16;
  const END_PAUSE = 1100;
  const PUNCT_PAUSE = 420;
  const START_DELAY = 260; 

  let typingJob = 0;

  function renderNav(i) {
    const isLast = i === slides.length - 1;
    nextBtn.classList.toggle("is-hidden", isLast);
    startLink.classList.toggle("is-visible", isLast);
  }

  function getDelayForChar(ch) {
    const jitter = Math.floor(Math.random() * JITTER);
    const isPunct =
      ch === "." || ch === "," || ch === "!" || ch === "?" || ch === ":";

    const isSpace = ch === " ";

    return (
      BASE_SPEED + jitter + (isSpace ? 25 : 0) + (isPunct ? PUNCT_PAUSE : 0)
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
        i++;
        setTimeout(step, getDelayForChar(ch));
      } else {
        setTimeout(() => {
          if (jobId !== typingJob) return;
          renderNav(index);
        }, END_PAUSE);
      }
    };

    setTimeout(() => {
      if (jobId !== typingJob) return;
      step();
    }, START_DELAY);
  }

  function showSlide(i, animate) {
    typingJob++;
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
    }, TRANSITION_TIME);
  }

  const hasBaseline = !!user.stats;
  startLink.href = hasBaseline ? "stats.html" : "survey.html";
  startLink.textContent = hasBaseline ? "Continue →" : "Start →";

  showSlide(index, false);

  function goNext() {
    if (index < slides.length - 1) {
      index++;
      showSlide(index, true);
    }
  }

  nextBtn.addEventListener("click", goNext);

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goNext();
  });
});
