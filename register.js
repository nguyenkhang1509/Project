import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  mergeUserState,
  writeCachedUserDoc,
  writeCurrentUser,
} from "./userStore.js";

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

// Nút hiện / ẩn mật khẩu khi đăng ký
const toggleRegPassBtn = document.getElementById("toggle-reg-pass");

function clearRegisterErrors() {
  nameError.textContent = "";
  regEmailError.textContent = "";
  regPassError.textContent = "";
  regPassConfirmError.textContent = "";
  termsError.textContent = "";
  registerFormError.textContent = "";
}

// Kiểm tra requirement cho email
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// Bắt buộc mật khẩu mạnh
function isStrongPassword(password) {
  const longEnough = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return longEnough && hasLower && hasUpper && hasNumber && hasSpecial;
}

// Cho phép người dùng xem mật khẩu khi nhập để tránh gõ sai
if (toggleRegPassBtn && regPassInput) {
  toggleRegPassBtn.addEventListener("click", () => {
    const hidden = regPassInput.type === "password";

    regPassInput.type = hidden ? "text" : "password";
    toggleRegPassBtn.textContent = hidden ? "Hide" : "Show";
  });
}

// Khi người dùng bấm Create Account, toàn bộ quá trình đăng ký bắt đầu
if (regForm) {
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearRegisterErrors();

    const nameValue = nameInput.value.trim();
    const emailValue = regEmailInput.value.trim();
    const passValue = regPassInput.value;
    const passConfirmValue = regPassConfirmInput.value;

    let valid = true;

    if (!nameValue) {
      nameError.textContent = "Display name is required.";
      valid = false;
    } else if (nameValue.length > 24) {
      nameError.textContent = "Display name must be 24 characters or fewer.";
      valid = false;
    }

    if (!emailValue) {
      regEmailError.textContent = "Email is required.";
      valid = false;
    } else if (!isValidEmail(emailValue)) {
      regEmailError.textContent = "Enter a valid email address.";
      valid = false;
    }

    // Kiểm tra mật khẩu
    if (!passValue) {
      regPassError.textContent = "Password is required.";
      valid = false;
    } else if (!isStrongPassword(passValue)) {
      regPassError.textContent =
        "Password must include at least 8 characters, uppercase, lowercase, number and special character.";
      valid = false;
    }

    // Kiểm tra xác nhận mật khẩu
    if (!passConfirmValue) {
      regPassConfirmError.textContent = "Please confirm your password.";
      valid = false;
    } else if (passConfirmValue !== passValue) {
      regPassConfirmError.textContent = "Passwords do not match.";
      valid = false;
    }

    // Kiểm tra người dùng đã đồng ý điều khoản chưa
    if (!termsCheckbox.checked) {
      termsError.textContent = "You must agree to the AuraK system protocol.";
      valid = false;
    }

    // Nếu còn lỗi → kh đc đăng ký
    if (!valid) {
      registerFormError.textContent =
        "Review the highlighted fields and correct them before creating your profile.";
      return;
    }

    // Đăng ký bằng Firebase (Firebase sẽ tự kiểm tra email có tồn tại chưa)
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        emailValue,
        passValue,
      );

      await updateProfile(cred.user, { displayName: nameValue });

      const newUser = {
        uid: cred.user.uid,
        email: emailValue,
        name: nameValue,
        displayName: nameValue,
        createdAt: new Date().toISOString(),
      };

      const initialState = {
        profile: {
          displayName: nameValue,
          updatedAt: new Date().toISOString(),
        },
        displayName: nameValue,
        totalXP: 0,
        quests: { completed: {} },
        weeklyQuestData: [0, 0, 0, 0, 0, 0, 0],
        dailyTaskHistory: {},
        completedQuests: [],
        journal: { entries: [] },
      };

      writeCurrentUser(newUser);
      writeCachedUserDoc(cred.user.uid, initialState);
      void mergeUserState(cred.user.uid, initialState).catch((error) => {
        console.warn("Initial Firestore signup sync failed:", error);
      });

      // Đăng ký thành công → chuyển sang trang đăng nhập
      window.location.href = "sequence.html";
    } catch (err) {
      const code = err?.code || "";

      if (code === "auth/email-already-in-use") {
        registerFormError.textContent =
          "An account with this email already exists. Try logging in instead.";
        return;
      }

      if (code === "auth/invalid-email") {
        registerFormError.textContent = "That email address is not valid.";
        return;
      }

      if (code === "auth/weak-password") {
        registerFormError.textContent =
          "Password is too weak. Use 8+ characters with uppercase, lowercase, number, and a special character.";
        return;
      }

      if (code === "auth/network-request-failed") {
        registerFormError.textContent =
          "Network error. Check your connection and try again.";
        return;
      }

      if (code === "auth/too-many-requests") {
        registerFormError.textContent = "Too many attempts. Try again later.";
        return;
      }

      registerFormError.textContent = "Registration failed. Try again.";
      console.error(err);
    }
  });
}
