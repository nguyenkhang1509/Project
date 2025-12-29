import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function scoreFromAnswer(ans) {
  if (!ans) return 0;
  if (ans.code === "A") return 0;
  if (ans.code === "B") return 0.5;
  if (ans.code === "C") return 1;
  return 0;
}

function calculateStats(survey) {
  const exercise = scoreFromAnswer(survey.exerciseLevel);
  const sleep = scoreFromAnswer(survey.sleepPerNight);
  const work = scoreFromAnswer(survey.workHoursPerWeek);
  const study = scoreFromAnswer(survey.studyTrainingPerWeek);
  const discipline = scoreFromAnswer(survey.habitConsistency);
  const happiness = scoreFromAnswer(survey.happiness);
  const social = scoreFromAnswer(survey.socialLife);
  const stress = scoreFromAnswer(survey.stressLevel);

  const physical = 0.5 * exercise + 0.3 * work + 0.2 * sleep;
  const intellectual = study;
  const disciplineStat = discipline;
  const confidence = 0.5 * happiness + 0.5 * social;
  const mental = 0.5 * stress + 0.5 * sleep;

  function scale(v) {
    return Math.round(10 + v * 10);
  }

  return {
    Physical: scale(physical),
    Intellectual: scale(intellectual),
    Discipline: scale(disciplineStat),
    Confidence: scale(confidence),
    Mental: scale(mental),
  };
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getRadioAnswer(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  if (!checked) return null;
  return {
    code: checked.value,
    label: checked.dataset.label || "",
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Skip survey (lưu data trong local) - check 1
  if (user.stats) {
    window.location.href = "dashboard.html";
    return;
  }

  // Skip survey (firestore) - check 2
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.stats) {
        const updatedUser = {
          ...user,
          stats: data.stats,
          survey: data.survey || null,
        };
        localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));
        window.location.href = "dashboard.html";
        return;
      }
    }
  } catch (err) {
    console.error("Firestore check failed", err);
  }

  const steps = Array.from(document.querySelectorAll(".step"));
  const startBtn = document.getElementById("startBtn");
  const errorEl = document.getElementById("error");
  const form = document.getElementById("survey-form");
  const nextBtns = document.querySelectorAll(".next-btn");
  const backBtns = document.querySelectorAll(".back-btn");

  let currentStep = 0;

  function showStep(stepNumber) {
    steps.forEach((step) => {
      const s = Number(step.dataset.step || 0);
      step.classList.toggle("active", s === stepNumber);
    });
    currentStep = stepNumber;
    if (errorEl) errorEl.textContent = "";
  }

  function showError(msg) {
    if (errorEl) errorEl.textContent = msg;
  }

  function validateStep(stepNumber) {
    if (stepNumber === 0) return true;
    const ans = getRadioAnswer(`q${stepNumber}`);
    if (!ans) {
      showError("Please choose an option to continue.");
      return false;
    }
    return true;
  }

  if (startBtn) {
    startBtn.addEventListener("click", () => showStep(1));
  }

  nextBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!validateStep(currentStep)) return;
      if (currentStep < 8) showStep(currentStep + 1);
    });
  });

  backBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentStep > 0) showStep(currentStep - 1);
    });
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validateStep(8)) return;

      const surveyData = {
        exerciseLevel: getRadioAnswer("q1"),
        sleepPerNight: getRadioAnswer("q2"),
        workHoursPerWeek: getRadioAnswer("q3"),
        studyTrainingPerWeek: getRadioAnswer("q4"),
        habitConsistency: getRadioAnswer("q5"),
        happiness: getRadioAnswer("q6"),
        socialLife: getRadioAnswer("q7"),
        stressLevel: getRadioAnswer("q8"),
        updatedAt: new Date().toISOString(),
      };

      const stats = calculateStats(surveyData);

      // Save permanently to Firestore
      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            survey: surveyData,
            stats: stats,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error("Save failed", err);
        showError("Failed to save. Please try again.");
        return;
      }

      // Update local user cache
      const updatedUser = {
        ...user,
        survey: surveyData,
        stats: stats,
      };
      localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));

      window.location.href = "loading.html";
    });
  }

  showStep(0);
});
