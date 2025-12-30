
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("aurakCurrentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getRadioAnswer(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  if (!checked) return null;
  return { code: checked.value, label: checked.dataset.label || "" };
}

function abcToStat(ans, invert = false) {
  if (!ans?.code) return 10;
  const map = { A: 10, B: 15, C: 20 };
  const v = map[ans.code] ?? 10;
  return invert ? 30 - v : v;
}

function calculateStats(surveyData) {
  const v1 = abcToStat(surveyData.exerciseLevel);              
  const v2 = abcToStat(surveyData.sleepPerNight);             
  const v3 = abcToStat(surveyData.workHoursPerWeek, true);    

  const v4 = abcToStat(surveyData.studyTrainingPerWeek);       
  const v5 = abcToStat(surveyData.habitConsistency);           
  const v6 = abcToStat(surveyData.happiness);                  
  const v7 = abcToStat(surveyData.socialLife);                 
  const v8 = abcToStat(surveyData.stressLevel);               

  const Physical = clamp(Math.round(v1 * 0.7 + v2 * 0.3), 10, 20);
  const Intellectual = clamp(Math.round(v4), 10, 20);
  const Discipline = clamp(Math.round(v5 * 0.7 + v3 * 0.3), 10, 20);
  const Confidence = clamp(Math.round(v7 * 0.6 + v6 * 0.4), 10, 20);
  const Mental = clamp(
    Math.round(v6 * 0.4 + v2 * 0.2 + v3 * 0.2 + v8 * 0.2),
    10,
    20
  );

  return { Physical, Intellectual, Mental, Confidence, Discipline };
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();
  if (!user?.uid) {
    window.location.href = "login.html";
    return;
  }

  const steps = Array.from(document.querySelectorAll(".step"));
  const startBtn = document.getElementById("startBtn");
  const form = document.getElementById("survey-form");
  const errorEl = document.getElementById("error");
  const nextBtns = document.querySelectorAll(".next-btn");
  const backBtns = document.querySelectorAll(".back-btn");

  let currentStep = 0;

  function showStep(step) {
    steps.forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle("active", s === step);
    });
    currentStep = step;
    if (errorEl) errorEl.textContent = "";
  }

  function showError(msg) {
    if (errorEl) errorEl.textContent = msg;
  }

  function validateStep(step) {
    if (step === 0) return true;
    const ans = getRadioAnswer(`q${step}`);
    if (!ans) {
      showError("Please choose an option to continue.");
      return false;
    }
    return true;
  }

  // Begin
  if (startBtn) {
    startBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showStep(1);
    });
  }

  // Next
  nextBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!validateStep(currentStep)) return;
      if (currentStep < 8) showStep(currentStep + 1);
    });
  });

  // Back
  backBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (currentStep > 0) showStep(currentStep - 1);
    });
  });

  // Finish
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    try {
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

      localStorage.setItem(
        "aurakCurrentUser",
        JSON.stringify({ ...user, survey: surveyData, stats })
      );

      window.location.href = "loading.html";

    } catch (err) {
      console.error("Survey finish failed:", err);
      showError("Something went wrong. Open Console to see the error.");
    }
  });
});
