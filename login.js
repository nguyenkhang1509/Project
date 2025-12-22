// ---------- DOM ELEMENTS ----------
const form = document.getElementById("signin-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("pass");
const togglePassBtn = document.getElementById("toggle-pass");

const emailError = document.getElementById("email-error");
const passwordError = document.getElementById("password-error");
const formError = document.getElementById("form-error");

// ---------- HELPERS ----------

// Basic email format
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// Strong password: 8+ chars, upper, lower, number, special
function isStrongPassword(password) {
  const longEnough = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return longEnough && hasLower && hasUpper && hasNumber && hasSpecial;
}

function clearErrors() {
  emailError.textContent = "";
  passwordError.textContent = "";
  formError.textContent = "";
}

// Read users saved by register.js
function getStoredUsers() {
  try {
    const raw = localStorage.getItem("aurakUsers");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read aurakUsers from localStorage", err);
    return [];
  }
}

// ---------- TOGGLE PASSWORD ----------
if (togglePassBtn && passwordInput) {
  togglePassBtn.addEventListener("click", () => {
    const hidden = passwordInput.type === "password";
    passwordInput.type = hidden ? "text" : "password";
    togglePassBtn.textContent = hidden ? "Hide" : "Show";
  });
}

// ---------- FORM SUBMIT ----------
if (form) {
  form.addEventListener("submit", (e) => {
    clearErrors();

    const emailValue = emailInput.value.trim();
    const passValue = passwordInput.value;

    let valid = true;

    // 1) Front-end validation
    if (!isValidEmail(emailValue)) {
      emailError.textContent = "Enter a valid email address.";
      valid = false;
    }

    if (!passValue) {
      passwordError.textContent = "Password is required.";
      valid = false;
    } else if (!isStrongPassword(passValue)) {
      passwordError.textContent =
        "Password must include at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.";
      valid = false;
    }

    // If format/strength invalid, stop here
    if (!valid) {
      e.preventDefault();
      return;
    }

    // 2) Check against registered users in localStorage
    const users = getStoredUsers();

    const matchedUser = users.find(
      (u) => u.email && u.email.toLowerCase() === emailValue.toLowerCase()
    );

    if (!matchedUser || matchedUser.password !== passValue) {
      // Email not found OR password mismatch
      e.preventDefault();
      formError.textContent = "Incorrect email or password.";
      return;
    }

    // 3) Successful login: optionally store current user + redirect
    // Save current user (optional)
    localStorage.setItem("aurakCurrentUser", JSON.stringify(matchedUser));

    // Redirect to your main interface
    e.preventDefault();      // prevent form default
    window.location.href = "sequence.html";
  });
}
