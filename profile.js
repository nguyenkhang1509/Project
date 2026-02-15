import { getStorageKey, getCurrentUser } from "./userStore.js";

const QUEST_STORAGE_KEY = "aurak_quests_v4";
const XP_STORAGE_KEY = "totalXP";
const BASE_XP_PER_LEVEL = 500;
const LEVEL_GROWTH = 1.2;

function getAccountStorageKey(baseKey) {
  return getStorageKey(baseKey);
}

function readUserProfile(uid) {
  if (!uid) return null;
  const key = getStorageKey("aurak_user_profile", uid);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUserProfile(uid, patch) {
  if (!uid) return null;
  const key = getStorageKey("aurak_user_profile", uid);
  let profile = {};
  try {
    const raw = localStorage.getItem(key);
    profile = raw ? JSON.parse(raw) : {};
  } catch {
    profile = {};
  }
  profile = { ...profile, ...patch, updatedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(profile));
  return profile;
}

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
    .map((k) => Number(stats[k]))
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function rankFromAverage(avg) {
  if (!Number.isFinite(avg)) return "—";
  if (avg >= 90) return "S";
  if (avg >= 80) return "A";
  if (avg >= 60) return "B";
  if (avg >= 40) return "C";
  if (avg >= 20) return "D";
  return "E";
}

function readTotalXP() {
  try {
    const stored = localStorage.getItem(getAccountStorageKey(XP_STORAGE_KEY));
    return stored ? Math.max(0, Number(stored) || 0) : 0;
  } catch {
    return 0;
  }
}

function formatDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function formatISODate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function readMembership(uid) {
  if (!uid) return null;

  const key = getStorageKey("aurak_membership", uid);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}

  const profile = readUserProfile(uid);
  return profile?.membership || null;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMembership(m) {
  const badge = document.getElementById("pfPlanBadge");
  const plan = document.getElementById("pfPlanName");
  const desc = document.getElementById("pfPlanDesc");
  const renew = document.getElementById("pfRenewDate");
  const perksWrap = document.getElementById("pfPerks");
  const pillTop = document.getElementById("pfPlanPill");

  const safe = m || {
    plan: "Free",
    status: "ACTIVE",
    renewDate: null,
    desc: "Basic access to AuraK core features.",
    perks: ["Daily quests", "XP tracking", "Pillar stats"],
  };

  if (badge) badge.textContent = `${safe.plan} • ${safe.status || "—"}`;
  if (plan) plan.textContent = safe.plan || "—";
  if (desc) desc.textContent = safe.desc || "—";
  if (renew) renew.textContent = formatISODate(safe.renewDate);
  if (pillTop) pillTop.textContent = String(safe.plan || "FREE").toUpperCase();

  if (perksWrap) {
    const perks = Array.isArray(safe.perks) ? safe.perks : [];
    perksWrap.innerHTML = perks
      .slice(0, 3)
      .map(
        (p) => `
          <div class="pf-perk">
            <i class="fa-solid fa-check"></i>
            <span>${esc(p)}</span>
          </div>
        `,
      )
      .join("");
  }
}

function renderTopBarXP() {
  const totalXP = readTotalXP();
  const info = getLevelInfo(totalXP);

  const dashLevel = document.getElementById("dashLevel");
  const dashXpText = document.getElementById("dashXpText");
  const dashXpFill = document.getElementById("dashXpFill");

  if (dashLevel) dashLevel.textContent = `LVL ${info.level}`;
  if (dashXpText) dashXpText.textContent = `${info.remaining} / ${info.req} XP`;
  if (dashXpFill)
    dashXpFill.style.width = `${Math.min(info.progress * 100, 100)}%`;

  const pfTotalXP = document.getElementById("pfTotalXP");
  const pfLevel = document.getElementById("pfLevel");
  if (pfTotalXP) pfTotalXP.textContent = totalXP;
  if (pfLevel) pfLevel.textContent = info.level;

  return totalXP;
}

function setCount(el, outId, max) {
  const out = document.getElementById(outId);
  if (!el || !out) return;
  const v = (el.value || "").length;
  out.textContent = `${v}/${max}`;
}

function toast(msg) {
  const t = document.getElementById("pfToast");
  if (!t) return;
  t.textContent = msg || "";
  if (!msg) return;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.textContent = ""), 1800);
}

function setDirty(on) {
  const d = document.getElementById("pfDirty");
  if (!d) return;
  d.classList.toggle("is-on", !!on);
}

function setupJumps() {
  const jumps = Array.from(document.querySelectorAll(".pf-jump"));
  if (!jumps.length) return;

  const sections = jumps
    .map((a) => document.getElementById(a.getAttribute("data-jump")))
    .filter(Boolean);

  function onScroll() {
    let best = sections[0];
    let bestTop = Infinity;

    sections.forEach((sec) => {
      const r = sec.getBoundingClientRect();
      const dist = Math.abs(r.top - 120);
      if (dist < bestTop) {
        bestTop = dist;
        best = sec;
      }
    });

    jumps.forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("data-jump") === best.id);
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  jumps.forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("data-jump");
      const sec = document.getElementById(id);
      if (!sec) return;
      e.preventDefault();
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();
  if (!user) return;

  let profile = readUserProfile(user.uid);

  if (!user.stats && profile?.stats) {
    user.stats = profile.stats;
    localStorage.setItem("aurakCurrentUser", JSON.stringify(user));
  }

  const stats = (user && user.stats) || (profile && profile.stats) || null;
  const avg = averageStat(stats);
  const rank = rankFromAverage(avg);

  const displayName =
    user.displayName ||
    profile?.displayName ||
    user.name ||
    user.username ||
    "User";

  const tagline =
    profile?.tagline ||
    profile?.subtitle ||
    user.subtitle ||
    "Student • Builder • Athlete";

  const dashName = document.getElementById("dashName");
  const sideUser = document.getElementById("sideUser");
  const sideSub = document.getElementById("sideSub");
  if (dashName) dashName.textContent = displayName;
  if (sideUser) sideUser.textContent = displayName;
  if (sideSub) sideSub.textContent = `Rank ${rank}`;

  const pfName = document.getElementById("pfName");
  const pfTagline = document.getElementById("pfTagline");
  if (pfName) pfName.textContent = displayName;
  if (pfTagline) pfTagline.textContent = tagline;

  const totalXP = renderTopBarXP();

  const pfRank = document.getElementById("pfRank");
  const pfAvg = document.getElementById("pfAvg");
  if (pfRank) pfRank.textContent = rank;
  if (pfAvg) pfAvg.textContent = Number.isFinite(avg) ? Math.round(avg) : "—";

  const pfRankBadge = document.getElementById("pfRankBadge");
  const pfAvgBadge = document.getElementById("pfAvgBadge");
  const pfXpBadge = document.getElementById("pfXpBadge");
  if (pfRankBadge) pfRankBadge.textContent = `Rank ${rank}`;
  if (pfAvgBadge)
    pfAvgBadge.textContent = `Avg ${Number.isFinite(avg) ? Math.round(avg) : "—"}`;
  if (pfXpBadge) pfXpBadge.textContent = `XP ${totalXP}`;

  const nameIn = document.getElementById("pfInputName");
  const tagIn = document.getElementById("pfInputTagline");
  const bioIn = document.getElementById("pfInputBio");
  const ig = document.getElementById("pfIg");
  const gh = document.getElementById("pfGh");
  const lk = document.getElementById("pfLink");

  if (nameIn) nameIn.value = profile?.displayName || displayName;
  if (tagIn) tagIn.value = profile?.tagline || profile?.subtitle || "";
  if (bioIn) bioIn.value = profile?.bio || "";

  const socials = profile?.socials || {};
  if (ig) ig.value = socials.ig || "";
  if (gh) gh.value = socials.gh || "";
  if (lk) lk.value = socials.link || "";

  const handle = document.getElementById("pfHandle");
  if (handle) handle.textContent = profile?.handle ? `@${profile.handle}` : "—";

  const saved = document.getElementById("pfLastSaved");
  if (saved)
    saved.textContent = profile?.updatedAt
      ? `Saved: ${formatDate(profile.updatedAt)}`
      : "—";

  renderMembership(readMembership(user.uid));
  setupJumps();

  const pName = document.getElementById("pfNamePreview");
  const pTag = document.getElementById("pfTaglinePreview");
  const pBio = document.getElementById("pfBioPreview");
  const pIg = document.getElementById("pfIgPreview");
  const pGh = document.getElementById("pfGhPreview");
  const pLk = document.getElementById("pfLinkPreview");

  function setPreview() {
    const nm = (nameIn?.value || "").trim();
    const tg = (tagIn?.value || "").trim();
    const bi = (bioIn?.value || "").trim();

    const igv = (ig?.value || "").trim();
    const ghv = (gh?.value || "").trim();
    const lkv = (lk?.value || "").trim();

    if (pName) pName.textContent = nm || displayName;
    if (pTag) pTag.textContent = tg || tagline;
    if (pBio)
      pBio.textContent = bi || "Add a short bio to define your identity.";

    if (pIg)
      pIg.querySelector("span").textContent = igv
        ? `@${igv.replace(/^@+/, "")}`
        : "—";
    if (pGh) pGh.querySelector("span").textContent = ghv ? ghv : "—";
    if (pLk) pLk.querySelector("span").textContent = lkv ? lkv : "—";

    setCount(nameIn, "pfNameCount", 28);
    setCount(tagIn, "pfTagCount", 44);
    setCount(bioIn, "pfBioCount", 240);
  }

  setPreview();
  setDirty(false);

  function markDirty() {
    setDirty(true);
  }

  [nameIn, tagIn, bioIn, ig, gh, lk].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      setPreview();
      markDirty();
    });
  });

  const igClear = document.getElementById("pfIgClear");
  const ghClear = document.getElementById("pfGhClear");
  const lkClear = document.getElementById("pfLinkClear");

  if (igClear && ig)
    igClear.addEventListener("click", () => {
      ig.value = "";
      setPreview();
      markDirty();
      ig.focus();
    });

  if (ghClear && gh)
    ghClear.addEventListener("click", () => {
      gh.value = "";
      setPreview();
      markDirty();
      gh.focus();
    });

  if (lkClear && lk)
    lkClear.addEventListener("click", () => {
      lk.value = "";
      setPreview();
      markDirty();
      lk.focus();
    });

  const saveBtn = document.getElementById("pfSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const patch = {
        displayName: (nameIn?.value || "").trim() || displayName,
        tagline: (tagIn?.value || "").trim(),
        bio: (bioIn?.value || "").trim(),
        socials: {
          ig: (ig?.value || "").trim(),
          gh: (gh?.value || "").trim(),
          link: (lk?.value || "").trim(),
        },
      };

      profile = saveUserProfile(user.uid, patch);

      const nameNow = profile.displayName || displayName;
      if (pfName) pfName.textContent = nameNow;
      if (dashName) dashName.textContent = nameNow;
      if (sideUser) sideUser.textContent = nameNow;

      if (pfTagline) pfTagline.textContent = profile.tagline || "—";
      if (saved) saved.textContent = `Saved: ${formatDate(profile.updatedAt)}`;

      localStorage.setItem(
        "aurakCurrentUser",
        JSON.stringify({ ...user, displayName: nameNow }),
      );

      setPreview();
      setDirty(false);
      toast("Saved");
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem("aurakCurrentUser");
      } catch {}
      window.location.href = "signin.html";
    });
  }

  window.addEventListener("storage", (e) => {
    if (
      e.key === getAccountStorageKey(XP_STORAGE_KEY) ||
      e.key === getAccountStorageKey(QUEST_STORAGE_KEY)
    ) {
      const xpNow = renderTopBarXP();
      if (pfXpBadge) pfXpBadge.textContent = `XP ${xpNow}`;
    }
  });

  setCount(nameIn, "pfNameCount", 28);
  setCount(tagIn, "pfTagCount", 44);
  setCount(bioIn, "pfBioCount", 240);
});
