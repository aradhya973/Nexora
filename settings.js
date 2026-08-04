import {
  getProfile,
  getUserSettings,
  updateUserSettings,
  deleteAllConversations
} from "./supabase.js";
import { requireAuthentication, logoutUser } from "./auth.js";

const $ = id => document.getElementById(id);
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");

let currentSavedSettings = null;
let systemThemeListenerBound = false;

function setStatus(text, state = "unsaved") {
  const label = $("settingsStatusLabel");
  if (!label) return;

  label.textContent = text;
  label.classList.remove("is-saved", "is-saving", "is-error");

  if (state === "saved") label.classList.add("is-saved");
  if (state === "saving") label.classList.add("is-saving");
  if (state === "error") label.classList.add("is-error");
}

function showMessage(text = "", type = "neutral") {
  const element = $("settingsFormMessage");
  if (!element) return;

  element.textContent = text;
  element.classList.remove("is-success", "is-error");

  if (type === "success") element.classList.add("is-success");
  if (type === "error") element.classList.add("is-error");
}

function setLoader(visible, text = "Loading your preferences") {
  const loader = $("settingsPageLoader");
  if (!loader) return;

  const label = loader.querySelector("span:last-child");
  if (label) label.textContent = text;

  loader.hidden = !visible;
}

function getResolvedTheme(theme) {
  if (theme === "system") {
    return systemThemeQuery.matches ? "light" : "dark";
  }

  return theme === "light" ? "light" : "dark";
}

function updateThemeColor(resolvedTheme) {
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) return;

  themeColor.content = resolvedTheme === "light" ? "#f4f1ea" : "#0f1318";
}

function applyTheme(theme, { persist = true } = {}) {
  const selectedTheme = ["system", "dark", "light"].includes(theme)
    ? theme
    : "system";
  const resolvedTheme = getResolvedTheme(selectedTheme);

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = selectedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;

  updateThemeColor(resolvedTheme);

  if (persist) {
    localStorage.setItem("nexxorraTheme", selectedTheme);
  }
}

function setRadioValue(name, value, fallback) {
  const input =
    document.querySelector(`input[name="${name}"][value="${value}"]`) ||
    document.querySelector(`input[name="${name}"][value="${fallback}"]`);

  if (input) input.checked = true;
}

function setSelectValue(id, value, fallback) {
  const select = $(id);
  if (!select) return;

  const exists = [...select.options].some(option => option.value === value);
  select.value = exists ? value : fallback;
}

function readFormSettings() {
  return {
    theme:
      document.querySelector('input[name="theme"]:checked')?.value || "system",
    response_style:
      document.querySelector('input[name="responseStyle"]:checked')?.value ||
      "balanced",
    language: $("settingsLanguage")?.value || "auto",
    save_history: Boolean($("settingsSaveHistory")?.checked),
    enter_to_send: Boolean($("settingsEnterToSend")?.checked),
    voice_language: $("settingsVoiceLanguage")?.value || "en-US"
  };
}

function settingsAreEqual(first, second) {
  if (!first || !second) return false;
  return JSON.stringify(first) === JSON.stringify(second);
}

function updateDirtyState() {
  const current = readFormSettings();

  if (settingsAreEqual(current, currentSavedSettings)) {
    setStatus("Saved", "saved");
    showMessage("");
  } else {
    setStatus("Unsaved changes", "unsaved");
  }
}

async function loadSettings(user) {
  const [profileResult, settingsResult] = await Promise.all([
    getProfile(),
    getUserSettings()
  ]);

  const profile = profileResult || {};
  const settings = settingsResult || {};

  if ($("settingsAccountName")) {
    $("settingsAccountName").textContent =
      profile.full_name || user?.user_metadata?.full_name || "Nexxorra user";
  }

  if ($("settingsAccountEmail")) {
    $("settingsAccountEmail").textContent = user?.email || "Signed-in account";
  }

  const normalizedSettings = {
    theme: settings.theme || localStorage.getItem("nexxorraTheme") || "system",
    response_style: settings.response_style || "balanced",
    language: settings.language || "auto",
    save_history: settings.save_history !== false,
    enter_to_send: settings.enter_to_send !== false,
    voice_language: settings.voice_language || "en-US"
  };

  setRadioValue("theme", normalizedSettings.theme, "system");
  setRadioValue("responseStyle", normalizedSettings.response_style, "balanced");
  setSelectValue("settingsLanguage", normalizedSettings.language, "auto");
  setSelectValue(
    "settingsVoiceLanguage",
    normalizedSettings.voice_language,
    "en-US"
  );

  if ($("settingsSaveHistory")) {
    $("settingsSaveHistory").checked = normalizedSettings.save_history;
  }

  if ($("settingsEnterToSend")) {
    $("settingsEnterToSend").checked = normalizedSettings.enter_to_send;
  }

  applyTheme(normalizedSettings.theme);
  currentSavedSettings = readFormSettings();
  setStatus("Saved", "saved");
}

async function saveSettings(event) {
  event.preventDefault();

  const button = $("saveSettingsButton");
  if (!button || button.disabled) return;

  const payload = readFormSettings();

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  setStatus("Saving…", "saving");
  showMessage("Saving your preferences…");

  try {
    await updateUserSettings(payload);
    applyTheme(payload.theme);
    currentSavedSettings = { ...payload };
    setStatus("Saved", "saved");
    showMessage("Settings saved successfully.", "success");
  } catch (error) {
    console.error("Settings save failed:", error);
    setStatus("Save failed", "error");
    showMessage(error?.message || "Could not save settings.", "error");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;

  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector("button")?.focus();
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function bindSystemThemeListener() {
  if (systemThemeListenerBound) return;
  systemThemeListenerBound = true;

  const handler = () => {
    const selectedTheme =
      document.querySelector('input[name="theme"]:checked')?.value ||
      localStorage.getItem("nexxorraTheme") ||
      "system";

    if (selectedTheme === "system") {
      applyTheme("system", { persist: false });
    }
  };

  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handler);
  } else {
    systemThemeQuery.addListener(handler);
  }
}

function bindFormEvents() {
  $("settingsForm")?.addEventListener("submit", saveSettings);

  $("settingsForm")?.addEventListener("change", event => {
    if (event.target.matches('input[name="theme"]')) {
      applyTheme(event.target.value);
    }

    updateDirtyState();
  });

  $("settingsForm")?.addEventListener("input", updateDirtyState);

  $("logoutButton")?.addEventListener("click", async () => {
    const button = $("logoutButton");
    if (!button) return;

    button.disabled = true;
    try {
      await logoutUser();
    } finally {
      button.disabled = false;
    }
  });

  $("deleteAllConversationsButton")?.addEventListener("click", () => {
    openModal("confirmDeleteAllModal");
  });

  $("confirmDeleteAllButton")?.addEventListener("click", async () => {
    const button = $("confirmDeleteAllButton");
    if (!button || button.disabled) return;

    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
      await deleteAllConversations();
      closeModal("confirmDeleteAllModal");
      showMessage("All conversations were deleted.", "success");
    } catch (error) {
      console.error("Delete all conversations failed:", error);
      showMessage(error?.message || "Could not delete conversations.", "error");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });

  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  $("confirmDeleteAllModal")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) {
      closeModal("confirmDeleteAllModal");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("confirmDeleteAllModal")?.hidden) {
      closeModal("confirmDeleteAllModal");
    }
  });
}

async function init() {
  setLoader(true);

  try {
    const { user } = await requireAuthentication();
    await loadSettings(user);
    bindFormEvents();
    bindSystemThemeListener();
  } catch (error) {
    console.error("Settings initialization failed:", error);
    setStatus("Could not load", "error");
    showMessage(error?.message || "Could not load your settings.", "error");
  } finally {
    setLoader(false);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
