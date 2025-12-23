const user = JSON.parse(localStorage.getItem("aurakCurrentUser"));

if (!user || !user.stats) {
  document.querySelector(".subtitle").innerText = "No data found.";
} else {
  const statsDiv = document.getElementById("stats");

  Object.entries(user.stats).forEach(([stat, value], index) => {
    const percentage = value;

    const statDiv = document.createElement("div");
    statDiv.className = "stat";

    statDiv.innerHTML = `
            <div class="stat-label">
                <span>${stat}</span>
                <span>${value} / 100</span>
            </div>
            <div class="bar-bg">
                <div class="bar-fill"></div>
            </div>
        `;

    statsDiv.appendChild(statDiv);

    setTimeout(() => {
      statDiv.querySelector(".bar-fill").style.width = percentage + "%";
    }, 300 + index * 200);
  });
}
