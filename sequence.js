function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse aurakCurrentUser", err);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const playerName = user.name || user.displayName || "Player";

  const textEl = document.getElementById("sequence-text");
  const nextBtn = document.getElementById("sequence-next");
  const startLink = document.getElementById("sequence-start");

  if (!textEl || !nextBtn || !startLink) return;

  // ---- Returning user check: skip survey if already completed ----
  function safeParse(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function hasSurveyDone(u) {
    if (u?.stats || u?.survey || u?.dashboard?.pillars) return true;

    const users = safeParse("aurakUsers") || [];
    const match = users.find(
      (x) =>
        x?.email &&
        u?.email &&
        x.email.toLowerCase() === u.email.toLowerCase()
    );

    return !!(match?.stats || match?.survey || match?.dashboard?.pillars);
  }

  const done = hasSurveyDone(user);
  startLink.href = done ? "dashboard.html" : "survey.html";
  startLink.textContent = done ? "Continue →" : "Start →";

  const slides = [
    `Welcome, Player ${playerName}...`,
    "This world does not reward the weak...",
    "Only those who act will grow stronger...",
    "Are you ready to enter the system?",
  ];

  let index = 0;
  const TRANSITION_TIME = 260;

  function showSlide(i, animate) {
    const phrase = slides[i];

    if (!animate) {
      textEl.textContent = phrase;
      textEl.classList.add("is-visible");
    } else {
      textEl.classList.remove("is-visible");
      textEl.classList.add("is-exiting");

      setTimeout(() => {
        textEl.classList.remove("is-exiting");
        textEl.textContent = phrase;

        void textEl.offsetWidth;

        textEl.classList.add("is-visible");
      }, TRANSITION_TIME);
    }

    if (i === slides.length - 1) {
      nextBtn.classList.add("is-hidden");
      startLink.classList.add("is-visible");
    } else {
      nextBtn.classList.remove("is-hidden");
      startLink.classList.remove("is-visible");
    }
  }

  nextBtn.addEventListener("click", () => {
    if (index >= slides.length - 1) return;
    index += 1;
    showSlide(index, true);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" && index < slides.length - 1) {
      index += 1;
      showSlide(index, true);
    }
  });

  showSlide(index, false);
});
