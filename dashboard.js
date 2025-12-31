
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
});
