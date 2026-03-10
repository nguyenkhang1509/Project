import {
  getCurrentUser,
  readCachedUserProfile,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResolvedUser() {
  const user = getCurrentUser();
  const profile = readCachedUserProfile(user?.uid);

  if (user && !user.stats && profile?.stats) {
    const nextUser = {
      ...user,
      stats: profile.stats,
      ...(profile.survey ? { survey: profile.survey } : {}),
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
    };
    writeCurrentUser(nextUser);
    return { user: nextUser, profile };
  }

  return { user, profile };
}

document.addEventListener("DOMContentLoaded", async () => {
  const subtitle = document.getElementById("subtitle");
  const welcomeText = document.getElementById("welcomeText");
  const statusPill = document.getElementById("statusPill");
  const statusText = document.getElementById("statusText");

  const startedAt = Date.now();
  const minScreenTime = 800;
  const lines = [
    "Authenticating session...",
    "Checking cached profile...",
    "Syncing cloud state...",
    "Applying account data...",
    "Preparing next screen...",
  ];

  let tickerIndex = 0;
  const ticker = setInterval(() => {
    if (subtitle) {
      subtitle.textContent = lines[tickerIndex] || lines[lines.length - 1];
    }
    tickerIndex += 1;
    if (tickerIndex >= lines.length) tickerIndex = lines.length - 1;
  }, 320);

  let { user, profile } = getResolvedUser();

  const displayName =
    user?.displayName ||
    user?.name ||
    user?.username ||
    (user?.email ? user.email.split("@")[0] : "Player");
  if (welcomeText) welcomeText.textContent = `Welcome, ${displayName}.`;

  try {
    if (user?.uid) {
      await syncUserState(user.uid);
      ({ user, profile } = getResolvedUser());
    }
  } catch (error) {
    console.error("Loading screen cloud sync failed:", error);
  }

  const hasStats = !!(user?.stats || profile?.stats);
  const target = !user ? "login.html" : hasStats ? "stats.html" : "sequence.html";

  if (statusText) statusText.textContent = user ? "ONLINE" : "OFFLINE";
  if (statusPill) statusPill.classList.toggle("offline", !user);

  if (!user) {
    if (subtitle) subtitle.textContent = "No active session found. Returning...";
  } else if (!hasStats) {
    if (subtitle) subtitle.textContent = "No baseline found. Opening setup...";
  } else if (subtitle) {
    subtitle.textContent = "Sync complete. Entering profile...";
  }

  const remaining = minScreenTime - (Date.now() - startedAt);
  if (remaining > 0) await sleep(remaining);

  clearInterval(ticker);
  window.location.href = target;
});
