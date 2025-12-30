import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Lấy thông tin user bằng ID
const form = document.getElementById("signin-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("pass");
const togglePassBtn = document.getElementById("toggle-pass");

// Các chỗ hiển thị lỗi cho user
const emailError = document.getElementById("email-error");
const passwordError = document.getElementById("password-error");
const formError = document.getElementById("form-error");

// Hàm regex vs trim dùng để kiểm tra email có đúng định dạng cơ bản hay không
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// Các requirements cho mật khẩu
function isStrongPassword(password) {
  const longEnough = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return longEnough && hasLower && hasUpper && hasNumber && hasSpecial;
}

// Mỗi lần user bấm đăng nhập thì xóa hết lỗi cũ đi trước
function clearErrors() {
  emailError.textContent = "";
  passwordError.textContent = "";
  formError.textContent = "";
}

// Khi bấm nút này thì mật khẩu sẽ hiện ra hoặc ẩn đi
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

    // Xóa lỗi cũ trước khi kiểm tra mới
    clearErrors();

    // Lấy email và mật khẩu người dùng nhập
    const emailValue = emailInput.value.trim();
    const passValue = passwordInput.value;

    let valid = true;

    // Kiểm tra email có hợp lệ không
    if (!isValidEmail(emailValue)) {
      emailError.textContent = "Enter a valid email address.";
      valid = false;
    }

    // Kiểm tra mật khẩu
    if (!passValue) {
      passwordError.textContent = "Password is required.";
      valid = false;
    } else if (!isStrongPassword(passValue)) {
      passwordError.textContent =
        "Password must include at least 8 characters, uppercase, lowercase, number and special character.";
      valid = false;
    }

    // Nếu nhập sai thì dừng luôn
    if (!valid) return;

    // Đăng nhập bằng Firebase (Firebase sẽ tự kiểm tra email + password)
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        emailValue,
        passValue
      );

      // Đăng nhập thành công → lưu user hiện tại (không lưu password)
      const currentUser = {
        uid: cred.user.uid,
        email: cred.user.email,
        name: cred.user.displayName || "Player",
        displayName: cred.user.displayName || "Player",
        lastLoginAt: new Date().toISOString(),
      };

      localStorage.setItem("aurakCurrentUser", JSON.stringify(currentUser));

      // Chuyển sang trang chính
window.location.href = "sequence.html";

    } catch (err) {
      if (
        err?.code === "auth/invalid-credential" ||
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/user-not-found"
      ) {
        formError.textContent = "Incorrect email or password.";
        return;
      }

      formError.textContent = "Login failed. Try again.";
      console.error(err);
    }
  });
}
