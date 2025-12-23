const regForm = document.getElementById("register-form");
const nameInput = document.getElementById("display-name");
const regEmailInput = document.getElementById("reg-email");
const regPassInput = document.getElementById("reg-pass");
const regPassConfirmInput = document.getElementById("reg-pass-confirm");
const termsCheckbox = document.getElementById("terms-checkbox");

const nameError = document.getElementById("name-error");
const regEmailError = document.getElementById("reg-email-error");
const regPassError = document.getElementById("reg-pass-error");
const regPassConfirmError = document.getElementById("reg-pass-confirm-error");
const termsError = document.getElementById("terms-error");
const registerFormError = document.getElementById("register-form-error");

const toggleRegPassBtn = document.getElementById("toggle-reg-pass");

function clearRegisterErrors() {
  nameError.textContent = "";
  regEmailError.textContent = "";
  regPassError.textContent = "";
  regPassConfirmError.textContent = "";
  termsError.textContent = "";
  registerFormError.textContent = "";
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function isStrongPassword(password) {
  const longEnough = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return longEnough && hasLower && hasUpper && hasNumber && hasSpecial;
}

// Get current users from localStorage
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

function saveUsers(users) {
  localStorage.setItem("aurakUsers", JSON.stringify(users));
}

if (toggleRegPassBtn && regPassInput) {
  toggleRegPassBtn.addEventListener("click", () => {
    const hidden = regPassInput.type === "password";
    regPassInput.type = hidden ? "text" : "password";
    toggleRegPassBtn.textContent = hidden ? "Hide" : "Show";
  });
}

if (regForm) {
  regForm.addEventListener("submit", (e) => {
    clearRegisterErrors();

    const nameValue = nameInput.value.trim();
    const emailValue = regEmailInput.value.trim();
    const passValue = regPassInput.value;
    const passConfirmValue = regPassConfirmInput.value;

    let valid = true;

    if (!nameValue) {
      nameError.textContent = "Display name is required.";
      valid = false;
    }

    if (!isValidEmail(emailValue)) {
      regEmailError.textContent = "Enter a valid email address.";
      valid = false;
    }

    if (!passValue) {
      regPassError.textContent = "Password is required.";
      valid = false;
    } else if (!isStrongPassword(passValue)) {
      regPassError.textContent =
        "Password must include at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.";
      valid = false;
    }

    if (!passConfirmValue) {
      regPassConfirmError.textContent = "Please confirm your password.";
      valid = false;
    } else if (passConfirmValue !== passValue) {
      regPassConfirmError.textContent = "Passwords do not match.";
      valid = false;
    }

    // Terms checkbox
    if (!termsCheckbox.checked) {
      termsError.textContent = "You must agree to the AuraK system protocol.";
      valid = false;
    }

    if (!valid) {
      e.preventDefault();
      registerFormError.textContent =
        "Review the highlighted fields and correct them before creating your profile.";
      return;
    }

    const users = getStoredUsers();
    const existingUser = users.find(
      (u) => u.email && u.email.toLowerCase() === emailValue.toLowerCase()
    );

    if (existingUser) {
      e.preventDefault();
      registerFormError.textContent =
        "An account with this email already exists. Try logging in instead.";
      return;
    }

    const newUser = {
      name: nameValue,
      email: emailValue,
      password: passValue,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveUsers(users);

    // SUCCESS → redirect to login page
    e.preventDefault();
    window.location.href = "login.html";
  });
}
