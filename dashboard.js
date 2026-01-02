const now = new Date();



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

  let completedQuests = JSON.parse(localStorage.getItem('completedQuests')) || [false, false, false];
  const questRows = document.querySelectorAll('.quest-row');
  questRows.forEach((row, i) => {
    if (completedQuests[i]) {
      row.classList.add('is-complete');
      const check = row.querySelector('.quest-check');
      if (check) {
        check.setAttribute("aria-pressed", "true");
        check.setAttribute("aria-label", "Mark quest as incomplete");
      }
    }
  });

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
    if (dashXpText) dashXpText.textContent = `0 / 1000 XP`;
    if (dashXpFill) dashXpFill.style.width = `0%`;
  }

  
  updateGraph();
  updateXP();
});

function updateXP() {
  const completedCount = document.querySelectorAll('.quest-row.is-complete').length;
  const totalXP = completedCount * 100;
  localStorage.setItem('totalXP', totalXP.toString());

  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");
  const tileXpGained = document.getElementById("tileXpGained");

  if (dashXpText) dashXpText.textContent = `${totalXP} / 1000 XP`;
  if (dashXpFill) dashXpFill.style.width = `${Math.min(totalXP / 1000 * 100, 100)}%`;
  if (tileXpGained) tileXpGained.textContent = totalXP;
}

function updateGraph() {
  const dayOfWeek = new Date().getDay(); 
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; 

  let weeklyData = JSON.parse(localStorage.getItem('weeklyQuestData')) || [0, 0, 0, 0, 0, 0, 0];

  const completedCount = document.querySelectorAll('.quest-row.is-complete').length;
  weeklyData[dayIndex] = completedCount;

  localStorage.setItem('weeklyQuestData', JSON.stringify(weeklyData));


  const svg = document.querySelector('.line-graph-svg');
  if (!svg) return;

  let path = svg.querySelector('.data-line');
  if (!path) {
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('data-line');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--aqua)');
    path.setAttribute('stroke-width', '3');
    svg.appendChild(path);
  }

  const points = weeklyData.map((val, i) => {
    const x = 60 + i * 100;
    const y = 220 - Math.min(val, 20) / 20 * 200; 
    return `${x},${y}`;
  });

  const d = points.length > 0 ? 'M' + points.join(' L') : '';
  path.setAttribute('d', d);
}


window.completeQuest = function(checkEl) {
  const row = checkEl.closest(".quest-row");
  if (!row) return;
  const nowComplete = row.classList.toggle("is-complete");
  if (nowComplete) {
    checkEl.setAttribute("aria-pressed", "true");
    checkEl.setAttribute("aria-label", "Mark quest as incomplete");
  } else {
    checkEl.setAttribute("aria-pressed", "false");
    checkEl.setAttribute("aria-label", "Mark quest as complete");
  }

  const questRows = document.querySelectorAll('.quest-row');
  const index = Array.from(questRows).indexOf(row);
  if (index !== -1) {
    let completedQuests = JSON.parse(localStorage.getItem('completedQuests')) || [false, false, false];
    completedQuests[index] = nowComplete;
    localStorage.setItem('completedQuests', JSON.stringify(completedQuests));
  }

  updateGraph();
  updateXP();
};
