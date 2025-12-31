import { mergeUserDoc } from "./userStore.js";

function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function stat10to20_toPercent(v) {
  const num = Number(v);
  const n = Number.isFinite(num) ? num : 10;
  const t = (n - 10) / 10;
  return clamp(Math.round(t * 100), 0, 100);
}

function computeXPFromStats(stats) {
  const avg =
    (stats.Physical +
      stats.Intellectual +
      stats.Mental +
      stats.Confidence +
      stats.Discipline) / 5;

  return clamp(Math.round(avg * 50), 0, 5000);
}

function computeLevel(xpNow) {
  return Math.floor(clamp(xpNow, 0, 1000000) / 250) + 1;
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = safeParse("aurakCurrentUser");

  const statsWrap = document.getElementById("stats");
  const summaryText = document.getElementById("summaryText");
  const topStats = document.getElementById("topStats");
  const enterBtn = document.getElementById("enterDashboardBtn");

  if (!user?.uid || !user.stats || Object.keys(user.stats).length === 0) {
    if (statsWrap) {
      statsWrap.innerHTML =
        "<p style='color:rgba(229,242,255,0.72)'>No data found. Please take the survey.</p>";
    }
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

  const xpTotal = computeXPFromStats(user.stats);
  const levelNow = computeLevel(xpTotal);
  const xpInto = xpTotal % 250;

  const dashboardPayload = {
    accountName: user.displayName || user.name || user.email || "User",
    level: levelNow,
    xpTotal,
    xpIntoLevel: xpInto,
    xpToNextLevel: 250,
    pillars: pillarsPct,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem("aurakDashboard", JSON.stringify(dashboardPayload));
  const updatedUser = { ...user, dashboard: dashboardPayload };
  localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));

  mergeUserDoc(user.uid, { dashboard: dashboardPayload }).catch((e) => {
    console.warn("Dashboard Firestore write failed (non-blocking):", e);
  });

  const coreKeys = [
    "Physical",
    "Intellectual",
    "Mental",
    "Confidence",
    "Discipline",
  ];

  const coreEntries = coreKeys.map((k) => {
    const num = Number(user.stats[k]);
    const v = Number.isFinite(num) ? num : 10;
    return [k, clamp(v, 10, 20)];
  });

  if (statsWrap) {
    statsWrap.innerHTML = "";

    coreEntries.forEach(([name, value], idx) => {
      const pct = clamp(Math.round(((value - 10) / 10) * 100), 0, 100);

      const row = document.createElement("div");
      row.className = "stat";
      row.innerHTML = `
        <div class="stat-label">
          <span class="stat-name">${name}</span>
          <span class="stat-value">${value} / 20</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="width:0%"></div>
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

  if (summaryText) summaryText.textContent = summaryMessage;

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


  if (enterBtn) {
    enterBtn.addEventListener("click", () => {
      localStorage.setItem("aurakDashboard", JSON.stringify(dashboardPayload));
      localStorage.setItem("aurakCurrentUser", JSON.stringify(updatedUser));
    });
  }
});
