(() => {
  const KEY = "aurak_theme";

  const LIGHT_VARS = {
    "--bg": "#f6f8ff",
    "--bg2": "#eef2ff",

    "--card": "rgba(2, 6, 23, 0.05)",
    "--card2": "rgba(2, 6, 23, 0.08)",

    "--stroke": "rgba(2, 6, 23, 0.12)",
    "--stroke2": "rgba(2, 6, 23, 0.18)",

    "--text": "#081022",
    "--muted": "rgba(8, 16, 34, 0.62)",

    "--aquaSoft": "rgba(34, 211, 238, 0.1)",
    "--violetSoft": "rgba(168, 85, 247, 0.1)",

    "--shadow": "0 18px 50px rgba(2, 6, 23, 0.1)",
    "--shadow2": "0 24px 70px rgba(2, 6, 23, 0.14)",
  };

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light") {
      for (const [k, v] of Object.entries(LIGHT_VARS)) root.style.setProperty(k, v);
      root.dataset.theme = "light";
    } else {
      for (const k of Object.keys(LIGHT_VARS)) root.style.removeProperty(k);
      delete root.dataset.theme;
    }
  }

  function getTheme() {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  }

  function setTheme(theme) {
    localStorage.setItem(KEY, theme);
    applyTheme(theme);
  }

  function initToggle() {
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    const current = getTheme();
    toggle.checked = current === "light";
    toggle.addEventListener("change", () => {
      setTheme(toggle.checked ? "light" : "dark");
    });
  }

  function init() {
    applyTheme(getTheme());
    initToggle();

    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      applyTheme(getTheme());
      const toggle = document.getElementById("themeToggle");
      if (toggle) toggle.checked = getTheme() === "light";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
