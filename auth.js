import { ROUTES, AUTH_CONFIG, getCurrentPageName, isProtectedPage, saveAuthReturnPath, consumeAuthReturnPath, getOAuthRedirectURL, getPasswordResetRedirectURL } from "./config.js";
import { getSupabaseClient, getCurrentSession, ensureProfile, ensureUserSettings } from "./supabase.js";

const client = getSupabaseClient();
const page = getCurrentPageName();
let busy = false;

const $ = id => document.getElementById(id);
const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const passwordValid = value => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && value.length >= 8;

function status(prefix, title, message, type = "info") {
  const box = $(`${prefix}Status`);
  if (!box) return;
  box.hidden = false;
  box.className = `auth-status auth-status-${type}`;
  const titleNode = $(`${prefix}StatusTitle`);
  const messageNode = $(`${prefix}StatusMessage`);
  if (titleNode) titleNode.textContent = title;
  if (messageNode) messageNode.textContent = message;
}

function setLoading(button, loading, text) {
  if (!button) return;
  const label = button.querySelector(".auth-submit-text");
  const loader = button.querySelector(".auth-submit-loader");
  if (!button.dataset.label && label) button.dataset.label = label.textContent.trim();
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  if (loader) loader.hidden = !loading;
  if (label) label.textContent = loading ? text : button.dataset.label;
}

function readable(error) {
  const message = String(error?.message || "Authentication failed.");
  if (/invalid login credentials/i.test(message)) return "The email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirm your email before logging in.";
  if (/already registered/i.test(message)) return "An account already exists with this email.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait briefly and try again.";
  if (/fetch|network/i.test(message)) return "Could not reach the authentication server.";
  return message;
}

function dispatch(event, session) {
  const detail = { event, session: session || null, user: session?.user || null };
  document.dispatchEvent(new CustomEvent("nexxorra:auth-session", { detail }));
  document.dispatchEvent(new CustomEvent("nexxorra:authentication-change", { detail }));
}

async function finishLogin(session) {
  dispatch("SIGNED_IN", session);
  await Promise.allSettled([ensureProfile(), ensureUserSettings()]);
  const target = consumeAuthReturnPath() || AUTH_CONFIG.redirectAfterLogin || ROUTES.home;
  window.location.replace(target);
}

async function login(event) {
  event.preventDefault();
  if (busy) return;
  const email = $("loginEmail")?.value.trim().toLowerCase();
  const password = $("loginPassword")?.value || "";
  if (!emailValid(email) || !password) {
    status("login", "Check your details", "Enter a valid email and password.", "error");
    return;
  }
  busy = true;
  const button = $("loginSubmitButton");
  setLoading(button, true, "Logging in");
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await finishLogin(data.session);
  } catch (error) {
    status("login", "Login failed", readable(error), "error");
  } finally {
    busy = false;
    setLoading(button, false);
  }
}

async function signup(event) {
  event.preventDefault();
  if (busy) return;
  const fullName = $("signupFullName")?.value.trim();
  const email = $("signupEmail")?.value.trim().toLowerCase();
  const password = $("signupPassword")?.value || "";
  const confirmation = $("signupConfirmPassword")?.value || "";
  if (!fullName || !emailValid(email) || !passwordValid(password) || password !== confirmation || !$("acceptTerms")?.checked) {
    status("signup", "Check the form", "Use a valid email, matching strong passwords, and accept the terms.", "error");
    return;
  }
  busy = true;
  const button = $("signupSubmitButton");
  setLoading(button, true, "Creating account");
  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, name: fullName }, emailRedirectTo: getOAuthRedirectURL() }
    });
    if (error) throw error;
    if (data.session) {
      await finishLogin(data.session);
    } else {
      status("signup", "Check your email", "Your account was created. Open the confirmation link sent to your email.", "success");
    }
  } catch (error) {
    status("signup", "Signup failed", readable(error), "error");
  } finally {
    busy = false;
    setLoading(button, false);
  }
}

async function google(prefix) {
  const button = prefix === "login" ? $("googleLoginButton") : $("googleSignupButton");
  if (button) button.disabled = true;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getOAuthRedirectURL(), queryParams: { prompt: "select_account" } }
  });
  if (error) {
    status(prefix, "Google sign-in failed", readable(error), "error");
    if (button) button.disabled = false;
  }
}

async function requestReset(event) {
  event.preventDefault();
  const email = $("recoveryEmail")?.value.trim().toLowerCase();
  if (!emailValid(email)) {
    status("forgotPassword", "Invalid email", "Enter a valid email address.", "error");
    return;
  }
  const button = $("sendResetLinkButton");
  setLoading(button, true, "Sending link");
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: getPasswordResetRedirectURL() });
  setLoading(button, false);
  if (error) {
    status("forgotPassword", "Recovery failed", readable(error), "error");
    return;
  }
  $("requestResetView")?.setAttribute("hidden", "");
  $("resetEmailSentView")?.removeAttribute("hidden");
  if ($("resetEmailAddress")) $("resetEmailAddress").textContent = email;
}

async function updatePassword(event) {
  event.preventDefault();
  const password = $("newPassword")?.value || "";
  const confirmation = $("confirmNewPassword")?.value || "";
  if (!passwordValid(password) || password !== confirmation) {
    status("updatePassword", "Check the password", "Use at least 8 characters with uppercase, lowercase, and a number. Passwords must match.", "error");
    return;
  }
  const button = $("updatePasswordButton");
  setLoading(button, true, "Updating password");
  const { error } = await client.auth.updateUser({ password });
  setLoading(button, false);
  if (error) {
    status("updatePassword", "Update failed", readable(error), "error");
    return;
  }
  $("updatePasswordView")?.setAttribute("hidden", "");
  $("passwordUpdatedView")?.removeAttribute("hidden");
}

function bindToggles() {
  document.querySelectorAll(".password-toggle-button").forEach(button => {
    button.addEventListener("click", () => {
      const wrapper = button.closest(".auth-input-wrapper");
      const input = wrapper?.querySelector("input");
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.setAttribute("aria-pressed", String(!visible));
      const icon = button.querySelector("i");
      if (icon) icon.className = visible ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
    });
  });
}

function updateStrength(input, prefix = "signupPassword") {
  if (!input) return;
  const value = input.value;
  const tests = {
    Length: value.length >= 8,
    Uppercase: /[A-Z]/.test(value),
    Lowercase: /[a-z]/.test(value),
    Number: /\d/.test(value)
  };
  const count = Object.values(tests).filter(Boolean).length;
  const level = count === 4 ? "strong" : count === 3 ? "good" : count === 2 ? "fair" : value ? "weak" : "empty";
  const box = $(`${prefix}Strength`);
  const text = $(`${prefix}StrengthText`);
  if (box) box.dataset.strength = level;
  if (text) text.textContent = value ? `Password strength: ${level}.` : "Use at least 8 characters.";
  const map = prefix === "newPassword" ? {
    Length: "newPasswordLengthRequirement",
    Uppercase: "newPasswordUppercaseRequirement",
    Lowercase: "newPasswordLowercaseRequirement",
    Number: "newPasswordNumberRequirement"
  } : {
    Length: "passwordLengthRequirement",
    Uppercase: "passwordUppercaseRequirement",
    Lowercase: "passwordLowercaseRequirement",
    Number: "passwordNumberRequirement"
  };
  Object.entries(tests).forEach(([name, valid]) => {
    const item = $(map[name]);
    item?.classList.toggle("valid", valid);
    const icon = item?.querySelector("i");
    if (icon) icon.className = valid ? "fa-solid fa-check" : "fa-solid fa-circle";
  });
}

export async function logoutUser({ redirect = true } = {}) {
  await client.auth.signOut();
  dispatch("SIGNED_OUT", null);
  if (redirect) window.location.replace(AUTH_CONFIG.redirectAfterLogout || ROUTES.home);
}

export async function requireAuthentication({ redirect = true } = {}) {
  const { session, user } = await getCurrentSession();
  if (session && user) return { session, user };
  if (redirect) {
    saveAuthReturnPath(page);
    window.location.replace(ROUTES.login);
  }
  throw new Error("Authentication required.");
}

export function getAuthenticatedUser() { return null; }

async function init() {
  bindToggles();
  $("loginForm")?.addEventListener("submit", login);
  $("signupForm")?.addEventListener("submit", signup);
  $("googleLoginButton")?.addEventListener("click", () => google("login"));
  $("googleSignupButton")?.addEventListener("click", () => google("signup"));
  $("forgotPasswordForm")?.addEventListener("submit", requestReset);
  $("updatePasswordForm")?.addEventListener("submit", updatePassword);
  $("signupPassword")?.addEventListener("input", event => updateStrength(event.target, "signupPassword"));
  $("newPassword")?.addEventListener("input", event => updateStrength(event.target, "newPassword"));
  document.querySelectorAll("#logoutButton,[data-auth-action='logout']").forEach(button => button.addEventListener("click", () => logoutUser()));

  const { session } = await getCurrentSession();
  dispatch("INITIAL_SESSION", session);

  if (isProtectedPage(page) && !session) {
    saveAuthReturnPath(page);
    window.location.replace(ROUTES.login);
    return;
  }
  if ([ROUTES.login, ROUTES.signup].includes(page) && session) {
    window.location.replace(AUTH_CONFIG.redirectAfterLogin || ROUTES.home);
    return;
  }

  const url = new URL(window.location.href);
  if (page === ROUTES.forgotPassword && (url.searchParams.has("code") || url.hash.includes("type=recovery"))) {
    $("requestResetView")?.setAttribute("hidden", "");
    $("updatePasswordView")?.removeAttribute("hidden");
  }

  client.auth.onAuthStateChange((event, currentSession) => dispatch(event, currentSession));
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();

export default { logout: logoutUser, require: requireAuthentication };
