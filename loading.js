function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const subtitle = document.getElementById("subtitle");
  const welcomeText = document.getElementById("welcomeText");
  const statusPill = document.getElementById("statusPill");
  const statusText = document.getElementById("statusText");

  const user = safeParse("aurakCurrentUser");

  if (!user || !user.stats) {
    if (subtitle) subtitle.textContent = "No survey data found. Returning…";
    if (statusText) statusText.textContent = "OFFLINE";
    if (statusPill) statusPill.classList.add("offline");

    setTimeout(() => {
      window.location.href = "survey.html";
    }, 1200);
    return;
  }

  const displayName =
    user.name ||
    user.username ||
    (user.email ? user.email.split("@")[0] : "Player");
  if (welcomeText) welcomeText.textContent = `Welcome, ${displayName}.`;

  if (statusText) statusText.textContent = "ONLINE";

  const lines = [
    "Analyzing Player Data…",
    "Calibrating Baselines…",
    "Syncing Core Attributes…",
    "Stabilizing Metrics…",
    "Finalizing Output…",
  ];

  let i = 0;
  const ticker = setInterval(() => {
    if (subtitle) {
      subtitle.textContent = lines[i] || lines[lines.length - 1];
    }
    i++;
    if (i >= lines.length) clearInterval(ticker);
  }, 700);

  setTimeout(() => {
    window.location.href = "stats.html";
  }, 2800);
});
