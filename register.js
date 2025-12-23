
// Kết nối JavaScript với các input và form trong trang đăng ký
const regForm = document.getElementById("register-form");
const nameInput = document.getElementById("display-name");
const regEmailInput = document.getElementById("reg-email");
const regPassInput = document.getElementById("reg-pass");
const regPassConfirmInput = document.getElementById("reg-pass-confirm");
const termsCheckbox = document.getElementById("terms-checkbox");

// Các vùng hiển thị lỗi tương ứng cho từng input
const nameError = document.getElementById("name-error");
const regEmailError = document.getElementById("reg-email-error");
const regPassError = document.getElementById("reg-pass-error");
const regPassConfirmError = document.getElementById("reg-pass-confirm-error");
const termsError = document.getElementById("terms-error");
const registerFormError = document.getElementById("register-form-error");

// Nút hiện / ẩn mật khẩu khi đăng ký
const toggleRegPassBtn = document.getElementById("toggle-reg-pass");

// Mỗi lần người dùng bấm đăng ký thì xóa toàn bộ lỗi cũ
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

// Đọc danh sách người dùng đã tồn tại trong localStorage
function getStoredUsers() {
  try {
    const raw = localStorage.getItem("aurakUsers");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

// Lưu user vô localStorage
function saveUsers(users) {
  localStorage.setItem("aurakUsers", JSON.stringify(users));
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
  regForm.addEventListener("submit", (e) => {

    // Xóa lỗi cũ trước khi kiểm tra dữ liệu mới
    clearRegisterErrors();

    // Lấy dữ liệu người dùng nhập
    const nameValue = nameInput.value.trim();
    const emailValue = regEmailInput.value.trim();
    const passValue = regPassInput.value;
    const passConfirmValue = regPassConfirmInput.value;

    let valid = true;

    // Kiểm tra tên hiển thị
    if (!nameValue) {
      nameError.textContent = "Display name is required.";
      valid = false;
    }

    // Kiểm tra email
    if (!isValidEmail(emailValue)) {
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
      e.preventDefault();
      registerFormError.textContent =
        "Review the highlighted fields and correct them before creating your profile.";
      return;
    }

    // Lấy danh sách user hiện tại
    const users = getStoredUsers();

    // Kiểm tra email đã tồn tại chưa
    const existingUser = users.find(
      (u) => u.email && u.email.toLowerCase() === emailValue.toLowerCase()
    );

    if (existingUser) {
      e.preventDefault();
      registerFormError.textContent =
        "An account with this email already exists. Try logging in instead.";
      return;
    }

    // Tạo user mới
    const newUser = {
      name: nameValue,
      email: emailValue,
      password: passValue,
      createdAt: new Date().toISOString(),
    };

    // Thêm user mới vào danh sách và lưu lại
    users.push(newUser);
    saveUsers(users);

    // Đăng ký thành công → chuyển sang trang đăng nhập
    e.preventDefault();
    window.location.href = "login.html";
  });
}
ÍÍ