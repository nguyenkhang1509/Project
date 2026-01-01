
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

  if (!user) return;

  const displayName = user.displayName || user.name || user.username || "User";

  const dashName = document.getElementById("dashName");
  const sideUser = document.getElementById("sideUser");

  if (dashName) dashName.textContent = displayName;
  if (sideUser) sideUser.textContent = displayName;

  if (user.stats) {
    const statKeys = ['Physical', 'Intellectual', 'Mental', 'Confidence', 'Discipline'];
    const pillarRows = document.querySelectorAll('.pillar-row');

    statKeys.forEach((key, i) => {
      const row = pillarRows[i];
      if (!row) return;

      const nameEl = row.querySelector('.pillar-name');
      const valEl = row.querySelector('.pillar-val');
      const barFill = row.querySelector('.bar-fill');

      if (nameEl) nameEl.textContent = key;
      if (valEl) valEl.textContent = `${user.stats[key]} / 100`;
      if (barFill) barFill.style.width = `${user.stats[key]}%`;
    });

    const radar = document.getElementById("dashRadar");
    if (radar) {
      const outerPoints = [
        {x: 100, y: 18}, 
        {x: 176, y: 72}, 
        {x: 148, y: 162}, 
        {x: 52, y: 162}, 
        {x: 24, y: 72}, 
      ];

      const points = statKeys.map((key, i) => {
        const pct = user.stats[key] / 100;
        const outer = outerPoints[i];
        const x = 100 + pct * (outer.x - 100);
        const y = 100 + pct * (outer.y - 100);
        return `${x},${y}`;
      }).join(' ');

      radar.setAttribute('points', points);
    }

    const dashLevel = document.getElementById("dashLevel");
    const dashXpText = document.getElementById("dashXpText");
    const dashXpFill = document.getElementById("dashXpFill");

    if (dashLevel) dashLevel.textContent = `Lv. 1`;
    if (dashXpText) dashXpText.textContent = `0 / 100 XP`;
    if (dashXpFill) dashXpFill.style.width = `0%`;
  }
});
