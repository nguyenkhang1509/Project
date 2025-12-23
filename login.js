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

// Đọc dữ liệu user đã lưu trong localStorage
// Nếu chưa có hoặc bị lỗi thì return
function getStoredUsers() {
  try {
    const raw = localStorage.getItem("aurakUsers");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
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
  form.addEventListener("submit", (e) => {
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
    if (!valid) {
      e.preventDefault();
      return;
    }

    // Lấy danh sách user đã đăng ký
    const users = getStoredUsers();

    // Tìm user có email trùng với email nhập vô
    const matchedUser = users.find(
      (u) => u.email && u.email.toLowerCase() === emailValue.toLowerCase()
    );

    // Nếu không có user hoặc mật khẩu sai
    if (!matchedUser || matchedUser.password !== passValue) {
      e.preventDefault();
      formError.textContent = "Incorrect email or password.";
      return;
    }

    // Đăng nhập thành công → lưu user hiện tại
    localStorage.setItem("aurakCurrentUser", JSON.stringify(matchedUser));

    // Chuyển sang trang chính
    e.preventDefault();
    window.location.href = "sequence.html";
  });
}
