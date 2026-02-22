import { startAccountCloudSync, readUserDoc } from "./userStore.js";

function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readUserProfile(uid) {
  if (!uid) return null;
  const key = `aurak_user_profile_${uid}`;
  return safeParse(key);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function awaitCloudWindow(ms = 900) {
  try {
    await Promise.race([startAccountCloudSync(), wait(ms)]);
  } catch {}
}

function resolveUserWithProfile() {
  const user = safeParse("aurakCurrentUser");
  const profile = readUserProfile(user?.uid);
  if (user && !user.stats && profile?.stats) {
    user.stats = profile.stats;
    localStorage.setItem("aurakCurrentUser", JSON.stringify(user));
  }
  return user;
}

function getInitialStatsPendingKey(uid) {
  return uid ? `aurak_initial_stats_pending_${uid}` : "aurak_initial_stats_pending";
}

document.addEventListener("DOMContentLoaded", () => {
  const subtitle = document.getElementById("subtitle");
  const welcomeText = document.getElementById("welcomeText");
  const statusPill = document.getElementById("statusPill");
  const statusText = document.getElementById("statusText");

  const run = async () => {
    let user = resolveUserWithProfile();
    if (!user?.stats) {
      await awaitCloudWindow(2500);
      user = resolveUserWithProfile();
    }

    if (!user || !user.stats) {
      if (user?.uid) {
        let cloud = null;
        try {
          cloud = await readUserDoc(user.uid);
        } catch {}

        const baselineStats = cloud?.baseline?.stats;
        if (baselineStats && typeof baselineStats === "object") {
          const profileKey = `aurak_user_profile_${user.uid}`;
          localStorage.setItem(
            profileKey,
            JSON.stringify({
              stats: baselineStats,
              ...(cloud?.baseline?.survey
                ? { survey: cloud.baseline.survey }
                : {}),
              updatedAt: new Date().toISOString(),
            }),
          );
          const merged = {
            ...user,
            stats: baselineStats,
            ...(cloud?.baseline?.survey ? { survey: cloud.baseline.survey } : {}),
          };
          localStorage.setItem("aurakCurrentUser", JSON.stringify(merged));
          user = merged;
        }
      }
    }

    if (!user || !user.stats) {
      if (subtitle) subtitle.textContent = "No survey data found. Returning...";
      if (statusText) statusText.textContent = "OFFLINE";
      if (statusPill) statusPill.classList.add("offline");
      await wait(150);
      window.location.href = "survey.html";
      return;
    }

    const displayName =
      user.name ||
      user.username ||
      (user.email ? user.email.split("@")[0] : "Player");

    if (welcomeText) welcomeText.textContent = `Welcome, ${displayName}.`;
    if (statusText) statusText.textContent = "ONLINE";
    if (subtitle) subtitle.textContent = "Preparing your dashboard...";

    const pendingKey = getInitialStatsPendingKey(user.uid);
    const shouldShowInitialStats = localStorage.getItem(pendingKey) === "1";

    await wait(900);
    window.location.href = shouldShowInitialStats ? "stats.html" : "dashboard.html";
  };

  run().catch(() => {
    if (subtitle) subtitle.textContent = "No survey data found. Returning...";
    if (statusText) statusText.textContent = "OFFLINE";
    if (statusPill) statusPill.classList.add("offline");
    window.setTimeout(() => {
      window.location.href = "survey.html";
    }, 150);
  });
});
