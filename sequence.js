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

  const textEl = document.getElementById("sequence-text");
  const nextBtn = document.getElementById("sequence-next");
  const startLink = document.getElementById("sequence-start");

  if (!textEl || !nextBtn || !startLink) return;

  const playerName = user.displayName || "Player";

  const slides = [
    `Welcome, Player ${playerName}...`,
    "This world does not reward the weak...",
    "Only those who act will grow stronger...",
    "Are you ready to enter the system?",
  ];

  let index = 0;
  const TRANSITION_TIME = 260;

  function renderNav(i) {
    const isLast = i === slides.length - 1;
    nextBtn.classList.toggle("is-hidden", isLast);
    startLink.classList.toggle("is-visible", isLast);
  }

  function showSlide(i, animate) {
    if (!animate) {
      textEl.textContent = slides[i];
      textEl.classList.add("is-visible");
      renderNav(i);
      return;
    }

    textEl.classList.remove("is-visible");
    textEl.classList.add("is-exiting");

    setTimeout(() => {
      textEl.classList.remove("is-exiting");
      textEl.textContent = slides[i];
      void textEl.offsetWidth;
      textEl.classList.add("is-visible");
      renderNav(i);
    }, TRANSITION_TIME);
  }

  const hasBaseline = !!user.stats;
  startLink.href = hasBaseline ? "stats.html" : "survey.html";
  startLink.textContent = hasBaseline ? "Continue →" : "Start →";

  showSlide(index, false);

  nextBtn.addEventListener("click", () => {
    if (index < slides.length - 1) {
      index++;
      showSlide(index, true);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" && index < slides.length - 1) {
      index++;
      showSlide(index, true);
    }
  });
});
