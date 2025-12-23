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

document.addEventListener("DOMContentLoaded", () => {
  const user = safeParse("aurakCurrentUser");

  const statsWrap = document.getElementById("stats");
  const summaryText = document.getElementById("summaryText");
  const topStats = document.getElementById("topStats");

  if (!user || !user.stats) {
    if (statsWrap)
      statsWrap.innerHTML =
        "<p style='color:rgba(229,242,255,0.72)'>No data found. Please take the survey.</p>";
    if (summaryText) summaryText.textContent = "No baseline found.";
    return;
  }

  const ordered = [
    "Physical",
    "Intellectual",
    "Mental",
    "Confidence",
    "Discipline",
  ];
  const entries = ordered
    .filter((k) => user.stats[k] !== undefined)
    .map((k) => [k, user.stats[k]]);

  Object.entries(user.stats).forEach(([k, v]) => {
    if (!ordered.includes(k)) entries.push([k, v]);
  });

  // Render bars
  statsWrap.innerHTML = "";
  entries.forEach(([name, value], idx) => {
    const pct = clamp(Number(value) || 0, 0, 100);

    const row = document.createElement("div");
    row.className = "stat";
    row.innerHTML = `
      <div class="stat-label">
        <span class="stat-name">${name}</span>
        <span class="stat-value">${pct} / 100</span>
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

  // Determine top strengths (top 2)
  const sorted = entries
    .map(([k, v]) => [k, clamp(Number(v) || 0, 0, 100)])
    .sort((a, b) => b[1] - a[1]);

  const best = sorted.slice(0, 2);
  const lowest = sorted.slice(-1)[0];

  if (summaryText) {
    summaryText.textContent = `Top strengths: ${best
      .map((x) => `${x[0]} (${x[1]})`)
      .join(", ")}. Focus area: ${lowest[0]} (${lowest[1]}).`;
  }

  if (topStats) {
    topStats.innerHTML = "";
    best.forEach(([k, v]) => {
      const pill = document.createElement("div");
      pill.className = "mini-pill";
      pill.innerHTML = `<span>${k}</span><span>${v}</span>`;
      topStats.appendChild(pill);
    });
  }
});
