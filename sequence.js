import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem("aurakCurrentUser", JSON.stringify(user));
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

  const playerName = user.name || user.displayName || "Player";

  startLink.href = "survey.html";
  startLink.textContent = "Start →";

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
    if (isLast) {
      nextBtn.classList.add("is-hidden");
      startLink.classList.add("is-visible");
    } else {
      nextBtn.classList.remove("is-hidden");
      startLink.classList.remove("is-visible");
    }
  }

  function showSlide(i, animate) {
    const phrase = slides[i];

    if (!animate) {
      textEl.textContent = phrase;
      textEl.classList.add("is-visible");
      renderNav(i);
      return;
    }

    textEl.classList.remove("is-visible");
    textEl.classList.add("is-exiting");

    window.setTimeout(() => {
      textEl.classList.remove("is-exiting");
      textEl.textContent = phrase;
      void textEl.offsetWidth;
      textEl.classList.add("is-visible");
      renderNav(i);
    }, TRANSITION_TIME);
  }

  showSlide(index, false);

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

  (async () => {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.exists() ? snap.data() : null;

      if (data?.stats) {
        setCurrentUser({
          ...user,
          stats: data.stats,
          survey: data.survey || null,
        });

        startLink.href = "stats.html";
        startLink.textContent = "Continue →";
      } else {
        startLink.href = "survey.html";
        startLink.textContent = "Start →";
      }
    } catch (e) {
      console.warn("Sequence Firestore check failed:", e);
      startLink.href = "survey.html";
      startLink.textContent = "Start →";
    }
  })();

});
