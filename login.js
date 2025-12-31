import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const form = document.getElementById("signin-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("pass");
const togglePassBtn = document.getElementById("toggle-pass");

const emailError = document.getElementById("email-error");
const passwordError = document.getElementById("password-error");
const formError = document.getElementById("form-error");

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearErrors() {
  emailError.textContent = "";
  passwordError.textContent = "";
  formError.textContent = "";
}

if (togglePassBtn && passwordInput) {
  togglePassBtn.addEventListener("click", () => {
    const hidden = passwordInput.type === "password";
    passwordInput.type = hidden ? "text" : "password";
    togglePassBtn.textContent = hidden ? "Hide" : "Show";
  });
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const emailValue = emailInput.value.trim();
    const passValue = passwordInput.value;

    let valid = true;

    if (!emailValue) {
      emailError.textContent = "Email is required.";
      valid = false;
    } else if (!isValidEmail(emailValue)) {
      emailError.textContent = "Enter a valid email address.";
      valid = false;
    }

    if (!passValue) {
      passwordError.textContent = "Password is required.";
      valid = false;
    }

    if (!valid) return;

    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        emailValue,
        passValue
      );

      const fbUser = cred.user;

      // 🔥 CRITICAL FIX
      await fbUser.reload();

      const existingUser = safeParse("aurakCurrentUser");

      const displayName = fbUser.displayName || "Player";

      const currentUser = {
        uid: fbUser.uid,
        email: fbUser.email,
        name: displayName,
        displayName: displayName,
        lastLoginAt: new Date().toISOString(),
        ...(existingUser && existingUser.stats ? { stats: existingUser.stats } : {}),
      };

      localStorage.setItem("aurakCurrentUser", JSON.stringify(currentUser));

      if (currentUser.stats) {
        window.location.href = "dashboard.html";
      } else {
        window.location.href = "sequence.html";
      }
    } catch (err) {
      const code = err?.code || "";

      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        formError.textContent = "Incorrect email or password.";
        return;
      }

      if (code === "auth/too-many-requests") {
        formError.textContent = "Too many attempts. Try again later.";
        return;
      }

      if (code === "auth/network-request-failed") {
        formError.textContent =
          "Network error. Check your connection and try again.";
        return;
      }

      formError.textContent = "Login failed. Try again.";
      console.error(err);
    }
  });
}
