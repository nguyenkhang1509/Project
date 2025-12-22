function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("aurakCurrentUser parse failed", e);
    return null;
  }
}

function getStoredUsers() {
  try {
    const raw = localStorage.getItem("aurakUsers");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("aurakUsers parse failed", e);
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem("aurakUsers", JSON.stringify(users));
}

function getRadioAnswer(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  if (!checked) return null;
  return {
    code: checked.value,
    label: checked.dataset.label || ""
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const steps = Array.from(document.querySelectorAll(".step"));
  const startBtn = document.getElementById("startBtn");
  const errorEl = document.getElementById("error");
  const form = document.getElementById("survey-form");
  const nextBtns = document.querySelectorAll(".next-btn");
  const backBtns = document.querySelectorAll(".back-btn");

  let currentStep = 0; // matches data-step

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

    const qName = `q${stepNumber}`;
    const ans = getRadioAnswer(qName);
    if (!ans) {
      showError("Please choose an option to continue.");
      return false;
    }
    return true;
  }

  // Intro → first question
  if (startBtn) {
    startBtn.addEventListener("click", () => showStep(1));
  }

  // Next buttons
  nextBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!validateStep(currentStep)) return;
      if (currentStep < 8) {
        showStep(currentStep + 1);
      }
    });
  });

  // Back buttons
  backBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentStep > 0) {
        showStep(currentStep - 1);
      }
    });
  });

  // Submit final
  if (form) {
    form.addEventListener("submit", (e) => {
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
        updatedAt: new Date().toISOString()
      };

      const users = getStoredUsers();
      const idx = users.findIndex(
        (u) => u.email && u.email.toLowerCase() === user.email.toLowerCase()
      );

      if (idx !== -1) {
        users[idx].survey = surveyData;
        saveUsers(users);
      }

      const updatedUser = { ...user, survey: surveyData };
      localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));

      window.location.href = "loading.html";
    });
  }

  showStep(0);
});
