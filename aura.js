import {
  getCurrentUser,
  getStorageKey,
  readCachedAccountState,
  readCachedUserProfile,
  subscribeToUserState,
  syncUserState,
  writeCurrentUser,
} from "./userStore.js";

const XP_KEY_BASE = "totalXP";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

function getLevelInfo(totalXp) {
  let level = 1;
  let req = BASE_XP_PER_LEVEL;
  let remaining = Number.isFinite(totalXp) ? totalXp : 0;

  for (let guard = 0; guard < 200; guard++) {
    if (remaining < req) break;
    remaining -= req;
    level += 1;
    req = Math.max(1, Math.round(req * LEVEL_GROWTH));
  }

  const progress = req > 0 ? remaining / req : 0;
  return { level, req, progress, remaining };
}

function averageStat(stats) {
  if (!stats) return null;
  const keys = [
    "Physical",
    "Intellectual",
    "Mental",
    "Confidence",
    "Discipline",
  ];
  const vals = keys
    .map((key) => Number(stats[key]))
    .filter((value) => Number.isFinite(value));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function rankFromAverage(avg) {
  if (!Number.isFinite(avg)) return "-";
  if (avg >= 90) return "S";
  if (avg >= 75) return "A";
  if (avg >= 60) return "B";
  if (avg >= 45) return "C";
  if (avg >= 25) return "D";
  return "E";
}

function renderIdentity() {
  let user = getCurrentUser();
  if (!user?.uid) return;
  const accountState = readCachedAccountState(user.uid);
  const profile =
    (accountState?.profile && typeof accountState.profile === "object"
      ? accountState.profile
      : null) || readCachedUserProfile(user.uid);
  const resolvedStats = accountState?.stats || profile?.stats || null;
  if (!user.stats && resolvedStats) {
    user = { ...user, stats: resolvedStats };
    writeCurrentUser(user);
  }

  const displayName =
    accountState?.displayName ||
    user.displayName ||
    user.name ||
    user.username ||
    "User";

  const sideUser = document.getElementById("sideUser");
  const sideSub = document.getElementById("sideSub");
  const dashName = document.getElementById("dashName");
  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");

  if (sideUser) sideUser.textContent = displayName;
  if (dashName) dashName.textContent = displayName;

  const xpKey = getStorageKey(XP_KEY_BASE);
  const totalXp = Number.isFinite(Number(accountState?.totalXP))
    ? Math.max(0, Number(accountState.totalXP) || 0)
    : Number(localStorage.getItem(xpKey) || "0") || 0;
  const info = getLevelInfo(totalXp);
  const stats = accountState?.stats || user.stats || profile?.stats || null;
  const avg = averageStat(stats);
  const rank =
    typeof accountState?.rank === "string" && accountState.rank.trim()
      ? accountState.rank.trim()
      : rankFromAverage(avg);

  if (dashLevel) dashLevel.textContent = `LVL ${info.level}`;
  if (dashXpText) dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
  if (dashXpFill) {
    dashXpFill.style.width = `${Math.min(info.progress * 100, 100)}%`;
  }
  if (sideSub) sideSub.textContent = `Rank ${rank}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  let user = getCurrentUser();
  if (!user?.uid) return;

  try {
    await syncUserState(user.uid);
    user = getCurrentUser() || user;
  } catch (error) {
    console.warn("Aura cloud sync failed:", error);
  }

  renderIdentity();

  subscribeToUserState(
    user.uid,
    () => {
      renderIdentity();
    },
    (error) => {
      console.warn("Aura realtime sync failed:", error);
    },
  );
});
