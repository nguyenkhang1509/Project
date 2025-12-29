function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function stat10to20_toPercent(v) {
  const n = Number(v) || 10;
  const t = (n - 10) / 10;
  return clamp(Math.round(t * 100), 0, 100);
}

function computeXPFromPillars(p) {
  const avg =
    (p.physical + p.intellectual + p.mental + p.confidence + p.discipline) / 5;
  return clamp(Math.round(avg * 50), 0, 5000);
}

function computeLevel(xpNow) {
  return Math.floor(clamp(xpNow, 0, 1000000) / 250) + 1;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

document.addEventListener("DOMContentLoaded", () => {
  const user = safeParse("aurakCurrentUser");

  const statsWrap = document.getElementById("stats");
  const summaryText = document.getElementById("summaryText");
  const topStats = document.getElementById("topStats");
  const enterBtn = document.getElementById("enterDashboardBtn");

  if (!user || !user.stats) {
    if (statsWrap)
      statsWrap.innerHTML =
        "<p style='color:rgba(229,242,255,0.72)'>No data found. Please take the survey.</p>";
    if (summaryText) summaryText.textContent = "No baseline found.";
    return;
  }

  const pillarsPct = {
    physical: stat10to20_toPercent(user.stats.Physical),
    intellectual: stat10to20_toPercent(user.stats.Intellectual),
    mental: stat10to20_toPercent(user.stats.Mental),
    confidence: stat10to20_toPercent(user.stats.Confidence),
    discipline: stat10to20_toPercent(user.stats.Discipline),
  };

  const dashboardPayload = {
    accountName: user.displayName || user.name || user.email || "User",
    level: 1,
    xpTotal: 0,
    xpIntoLevel: 0,
    xpToNextLevel: 250,
    pillars: pillarsPct,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem("aurakDashboard", JSON.stringify(dashboardPayload));

  const updatedUser = { ...user, dashboard: dashboardPayload };
  localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));

  if (enterBtn) {
    enterBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.setItem("aurakDashboard", JSON.stringify(dashboardPayload));
      localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));
      window.location.href = "dashboard.html";
    });
  }

  const coreKeys = ["Physical", "Intellectual", "Mental", "Confidence", "Discipline"];

  const coreEntries = coreKeys
    .filter((k) => user.stats[k] !== undefined)
    .map((k) => [k, clamp(Number(user.stats[k]) || 10, 10, 20)]);

  if (statsWrap) {
    statsWrap.innerHTML = "";
    coreEntries.forEach(([name, value], idx) => {
      const raw = clamp(Number(value) || 10, 10, 20);

      const pct = clamp(Math.round(((raw - 10) / 10) * 100), 0, 100);

      const row = document.createElement("div");
      row.className = "stat";
      row.innerHTML = `
        <div class="stat-label">
          <span class="stat-name">${name}</span>
          <span class="stat-value">${raw} / 20</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="width: 0%"></div>
        </div>
      `;

      statsWrap.appendChild(row);

      setTimeout(() => {
        const fill = row.querySelector(".bar-fill");
        if (fill) fill.style.width = pct + "%";
      }, 120 + idx * 120);
    });
  }

  const sorted = coreEntries.slice().sort((a, b) => b[1] - a[1]);

  const topStrength = sorted[0];
  const weakness = sorted[sorted.length - 1];

  const gap = topStrength[1] - weakness[1];

let summaryMessage = "";

if (gap >= 4) {
  summaryMessage =
    "Your build is unbalanced. Strengthening your weakest pillar will give the biggest overall improvement.";
} else if (gap >= 2) {
  summaryMessage =
    "Your build is moderately balanced. Targeted work on weaker areas will raise your overall level.";
} else {
  summaryMessage =
    "Your build is well balanced. Consistent actions across all pillars will maintain steady growth.";
}

if (summaryText) {
  summaryText.textContent = summaryMessage;
}

    if (topStats) {
    topStats.innerHTML = "";

    const strengthBox = document.createElement("div");
    strengthBox.className = "mini-pill";
    strengthBox.innerHTML = `<span>${topStrength[0]} : ${topStrength[1]}</span>`;
    topStats.appendChild(strengthBox);

    const weaknessBox = document.createElement("div");
    weaknessBox.className = "mini-pill";
    weaknessBox.innerHTML = `<span>${weakness[0]} : ${weakness[1]}</span>`;
    topStats.appendChild(weaknessBox);
  }

});
