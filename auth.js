/* =========================================================
   nexxorra AI — AUTHENTICATION CONTROLLER
   File: auth.js
   Part 1: Core State, Session, Login, Signup and Google OAuth
========================================================= */

import {
    getSupabaseClient,
    getCurrentSession as getSupabaseSession,
    ensureProfile,
    ensureUserSettings
} from "./supabase.js";

import {
    ROUTES,
    AUTH_CONFIG,
    SUPABASE_CONFIG,
    getCurrentPageName,
    getOAuthRedirectURL,
    consumeAuthReturnPath,
    saveAuthReturnPath,
    isProtectedPage
} from "./config.js";

/* =========================================================
   1. AUTHENTICATION STATE
========================================================= */

const authState = {
    initialized: false,
    loading: false,

    session: null,
    user: null,

    currentPage: getCurrentPageName(),

    loginInProgress: false,
    signupInProgress: false,
    googleOAuthInProgress: false,

    recoveryMode: false,
    passwordUpdateInProgress: false
};


/* =========================================================
   2. DOM REFERENCES
========================================================= */

const authElements = {
    loginForm: null,
    loginEmail: null,
    loginPassword: null,
    loginSubmitButton: null,
    googleLoginButton: null,

    signupForm: null,
    signupFullName: null,
    signupEmail: null,
    signupPassword: null,
    signupConfirmPassword: null,
    signupSubmitButton: null,
    googleSignupButton: null,
    acceptTerms: null,

    pageLoader: null,
    pageLoaderText: null,

    toastRegion: null
};


/* =========================================================
   3. DOM INITIALIZATION
========================================================= */

function cacheAuthElements() {
    authElements.loginForm =
        document.getElementById("loginForm");

    authElements.loginEmail =
        document.getElementById("loginEmail");

    authElements.loginPassword =
        document.getElementById("loginPassword");

    authElements.loginSubmitButton =
        document.getElementById("loginSubmitButton");

    authElements.googleLoginButton =
        document.getElementById("googleLoginButton");

    authElements.signupForm =
        document.getElementById("signupForm");

    authElements.signupFullName =
        document.getElementById("signupFullName");

    authElements.signupEmail =
        document.getElementById("signupEmail");

    authElements.signupPassword =
        document.getElementById("signupPassword");

    authElements.signupConfirmPassword =
        document.getElementById("signupConfirmPassword");

    authElements.signupSubmitButton =
        document.getElementById("signupSubmitButton");

    authElements.googleSignupButton =
        document.getElementById("googleSignupButton");

    authElements.acceptTerms =
        document.getElementById("acceptTerms");

    authElements.pageLoader =
        document.getElementById("authPageLoader");

    authElements.pageLoaderText =
        document.getElementById("authPageLoaderText");

    authElements.toastRegion =
        document.getElementById("toastRegion");
}


/* =========================================================
   4. GENERAL HELPERS
========================================================= */

function normalizeText(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeEmail(value) {
    return normalizeText(value).toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizeEmail(email)
    );
}

function getSupabase() {
    return getSupabaseClient();
}

function getUserDisplayName(user) {
    if (!user) {
        return "nexxorra user";
    }

    return (
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "nexxorra user"
    );
}

function createAuthError(
    message,
    code = "authentication_error"
) {
    const error = new Error(message);

    error.name = "nexxorraAuthError";
    error.code = code;

    return error;
}


/* =========================================================
   5. PAGE LOADER
========================================================= */

function showPageLoader(
    message = "Checking your session"
) {
    const loader =
        authElements.pageLoader;

    if (!loader) return;

    if (authElements.pageLoaderText) {
        authElements.pageLoaderText.textContent =
            message;
    }

    loader.hidden = false;
}

function hidePageLoader() {
    if (authElements.pageLoader) {
        authElements.pageLoader.hidden = true;
    }
}


/* =========================================================
   6. BUTTON LOADING STATE
========================================================= */

function setButtonLoading(
    button,
    loading,
    loadingText = ""
) {
    if (!button) return;

    const textElement =
        button.querySelector(".auth-submit-text");

    const loaderElement =
        button.querySelector(".auth-submit-loader");

    if (!button.dataset.originalText && textElement) {
        button.dataset.originalText =
            textElement.textContent.trim();
    }

    button.disabled = loading;
    button.classList.toggle(
        "is-loading",
        loading
    );

    if (loaderElement) {
        loaderElement.hidden = !loading;
    }

    if (textElement) {
        textElement.textContent =
            loading && loadingText
                ? loadingText
                : button.dataset.originalText ||
                  textElement.textContent;
    }
}


/* =========================================================
   7. STATUS MESSAGE
========================================================= */

function showAuthStatus({
    containerId,
    titleId,
    messageId,
    title,
    message,
    type = "info"
}) {
    const container =
        document.getElementById(containerId);

    const titleElement =
        document.getElementById(titleId);

    const messageElement =
        document.getElementById(messageId);

    if (!container) return;

    container.classList.remove(
        "auth-status-success",
        "auth-status-error",
        "auth-status-warning"
    );

    container.classList.add(
        `auth-status-${type}`
    );

    const icon =
        container.querySelector(
            ".auth-status-icon i"
        );

    const icons = {
        success: "fa-solid fa-circle-check",
        error: "fa-solid fa-triangle-exclamation",
        warning: "fa-solid fa-circle-exclamation",
        info: "fa-solid fa-circle-info"
    };

    if (icon) {
        icon.className =
            icons[type] || icons.info;
    }

    if (titleElement) {
        titleElement.textContent = title;
    }

    if (messageElement) {
        messageElement.textContent = message;
    }

    container.hidden = false;
}

function hideAuthStatus(containerId) {
    const container =
        document.getElementById(containerId);

    if (container) {
        container.hidden = true;
    }
}


/* =========================================================
   8. FIELD ERROR HELPERS
========================================================= */

function showFieldError(
    input,
    errorElementId,
    message
) {
    const errorElement =
        document.getElementById(errorElementId);

    const wrapper =
        input?.closest(".auth-input-wrapper");

    if (wrapper) {
        wrapper.classList.add("has-error");
    }

    if (input) {
        input.setAttribute(
            "aria-invalid",
            "true"
        );
    }

    if (errorElement) {
        errorElement.textContent = message;
    }
}

function clearFieldError(
    input,
    errorElementId
) {
    const errorElement =
        document.getElementById(errorElementId);

    const wrapper =
        input?.closest(".auth-input-wrapper");

    wrapper?.classList.remove("has-error");

    input?.removeAttribute("aria-invalid");

    if (errorElement) {
        errorElement.textContent = "";
    }
}

function clearLoginErrors() {
    clearFieldError(
        authElements.loginEmail,
        "loginEmailError"
    );

    clearFieldError(
        authElements.loginPassword,
        "loginPasswordError"
    );

    hideAuthStatus("loginStatus");
}

function clearSignupErrors() {
    clearFieldError(
        authElements.signupFullName,
        "signupFullNameError"
    );

    clearFieldError(
        authElements.signupEmail,
        "signupEmailError"
    );

    clearFieldError(
        authElements.signupPassword,
        "signupPasswordError"
    );

    clearFieldError(
        authElements.signupConfirmPassword,
        "signupConfirmPasswordError"
    );

    hideAuthStatus("signupStatus");
}


/* =========================================================
   9. PASSWORD VALIDATION
========================================================= */

function validatePassword(password) {
    const value = String(password || "");

    const requirements = {
        length: value.length >= 8,
        uppercase: /[A-Z]/.test(value),
        lowercase: /[a-z]/.test(value),
        number: /\d/.test(value)
    };

    return {
        valid: Object.values(
            requirements
        ).every(Boolean),

        requirements
    };
}


/* =========================================================
   10. LOGIN FORM VALIDATION
========================================================= */

function validateLoginForm() {
    clearLoginErrors();

    const email =
        normalizeEmail(
            authElements.loginEmail?.value
        );

    const password =
        authElements.loginPassword?.value || "";

    let valid = true;

    if (!email) {
        showFieldError(
            authElements.loginEmail,
            "loginEmailError",
            "Enter your email address."
        );

        valid = false;
    } else if (!isValidEmail(email)) {
        showFieldError(
            authElements.loginEmail,
            "loginEmailError",
            "Enter a valid email address."
        );

        valid = false;
    }

    if (!password) {
        showFieldError(
            authElements.loginPassword,
            "loginPasswordError",
            "Enter your password."
        );

        valid = false;
    } else if (password.length < 8) {
        showFieldError(
            authElements.loginPassword,
            "loginPasswordError",
            "Password must contain at least 8 characters."
        );

        valid = false;
    }

    return {
        valid,
        email,
        password
    };
}


/* =========================================================
   11. SIGNUP FORM VALIDATION
========================================================= */

function validateSignupForm() {
    clearSignupErrors();

    const fullName =
        normalizeText(
            authElements.signupFullName?.value
        );

    const email =
        normalizeEmail(
            authElements.signupEmail?.value
        );

    const password =
        authElements.signupPassword?.value || "";

    const confirmPassword =
        authElements.signupConfirmPassword?.value || "";

    const passwordValidation =
        validatePassword(password);

    let valid = true;

    if (fullName.length < 2) {
        showFieldError(
            authElements.signupFullName,
            "signupFullNameError",
            "Enter your full name."
        );

        valid = false;
    }

    if (!email) {
        showFieldError(
            authElements.signupEmail,
            "signupEmailError",
            "Enter your email address."
        );

        valid = false;
    } else if (!isValidEmail(email)) {
        showFieldError(
            authElements.signupEmail,
            "signupEmailError",
            "Enter a valid email address."
        );

        valid = false;
    }

    if (!passwordValidation.valid) {
        showFieldError(
            authElements.signupPassword,
            "signupPasswordError",
            "Password does not meet all requirements."
        );

        valid = false;
    }

    if (!confirmPassword) {
        showFieldError(
            authElements.signupConfirmPassword,
            "signupConfirmPasswordError",
            "Confirm your password."
        );

        valid = false;
    } else if (
        password !== confirmPassword
    ) {
        showFieldError(
            authElements.signupConfirmPassword,
            "signupConfirmPasswordError",
            "Passwords do not match."
        );

        valid = false;
    }

    if (!authElements.acceptTerms?.checked) {
        showAuthStatus({
            containerId: "signupStatus",
            titleId: "signupStatusTitle",
            messageId: "signupStatusMessage",
            title: "Terms required",
            message:
                "Accept the Terms and Privacy Policy to create an account.",
            type: "warning"
        });

        valid = false;
    }

    return {
        valid,
        fullName,
        email,
        password
    };
}


/* =========================================================
   12. AUTH ERROR MESSAGE MAPPING
========================================================= */

function getReadableAuthError(error) {
    const message =
        String(error?.message || "")
            .toLowerCase();

    const code =
        String(error?.code || "")
            .toLowerCase();

    if (
        message.includes(
            "invalid login credentials"
        )
    ) {
        return "The email or password is incorrect.";
    }

    if (
        message.includes(
            "email not confirmed"
        )
    ) {
        return "Confirm your email before logging in.";
    }

    if (
        message.includes(
            "user already registered"
        ) ||
        message.includes(
            "already been registered"
        )
    ) {
        return "An account already exists with this email.";
    }

    if (
        message.includes(
            "password should be"
        )
    ) {
        return "Choose a stronger password.";
    }

    if (
        message.includes(
            "rate limit"
        ) ||
        code.includes(
            "rate_limit"
        )
    ) {
        return "Too many attempts were made. Try again later.";
    }

    if (
        message.includes(
            "network"
        ) ||
        message.includes(
            "fetch"
        )
    ) {
        return "The authentication server could not be reached.";
    }

    return (
        error?.message ||
        "Authentication failed. Try again."
    );
}


/* =========================================================
   13. SESSION STATE
========================================================= */

function setAuthSession(session) {
    authState.session = session || null;
    authState.user =
        session?.user || null;

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:auth-session",
            {
                detail: {
                    event:
                        session
                            ? "SESSION_UPDATED"
                            : "SIGNED_OUT",

                    session:
                        authState.session,

                    user:
                        authState.user
                }
            }
        )
    );
}


/* =========================================================
   14. CURRENT SESSION
========================================================= */

export async function getCurrentSession() {
    try {
        const result =
            await getSupabaseSession();

        const session =
            result?.session || null;

        setAuthSession(session);

        return {
            session,
            user:
                session?.user || null
        };
    } catch (error) {
        console.error(
            "Session loading failed:",
            error
        );

        setAuthSession(null);

        return {
            session: null,
            user: null
        };
    }
}

export async function getAccessToken() {
    const {
        session
    } = await getCurrentSession();

    return session?.access_token || null;
}


/* =========================================================
   15. REDIRECT AFTER AUTH
========================================================= */

function getSafeRedirectPage() {
    const returnPath =
        consumeAuthReturnPath();

    const allowedPages =
        Object.values(ROUTES);

    if (
        allowedPages.includes(returnPath)
    ) {
        return returnPath;
    }

    return AUTH_CONFIG.redirectAfterLogin;
}

function redirectAfterAuthentication() {
    const targetPage =
        getSafeRedirectPage();

    window.location.replace(targetPage);
}


/* =========================================================
   16. EMAIL LOGIN
========================================================= */

export async function loginWithEmail({
    email,
    password
}) {
    const normalizedEmail =
        normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
        throw createAuthError(
            "Enter a valid email address.",
            "invalid_email"
        );
    }

    if (!password) {
        throw createAuthError(
            "Enter your password.",
            "password_required"
        );
    }

    const client = getSupabase();

    const {
        data,
        error
    } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password
    });

    if (error) {
        throw error;
    }

    if (!data?.session || !data?.user) {
        throw createAuthError(
            "The login session was not created.",
            "missing_login_session"
        );
    }

    setAuthSession(data.session);

    await Promise.allSettled([
        ensureProfile(),
        ensureUserSettings()
    ]);

    return {
        session: data.session,
        user: data.user
    };
}


/* =========================================================
   17. LOGIN FORM SUBMISSION
========================================================= */

async function handleLoginSubmit(event) {
    event.preventDefault();

    if (authState.loginInProgress) {
        return;
    }

    const validation =
        validateLoginForm();

    if (!validation.valid) {
        return;
    }

    authState.loginInProgress = true;

    setButtonLoading(
        authElements.loginSubmitButton,
        true,
        "Logging in"
    );

    showAuthStatus({
        containerId: "loginStatus",
        titleId: "loginStatusTitle",
        messageId: "loginStatusMessage",
        title: "Logging in",
        message:
            "nexxorra is verifying your account.",
        type: "info"
    });

    try {
        const {
            user
        } = await loginWithEmail({
            email:
                validation.email,

            password:
                validation.password
        });

        showAuthStatus({
            containerId: "loginStatus",
            titleId: "loginStatusTitle",
            messageId: "loginStatusMessage",
            title: "Login successful",
            message:
                `Welcome back, ${getUserDisplayName(user)}.`,
            type: "success"
        });

        showPageLoader(
            "Opening your workspace"
        );

        window.setTimeout(
            redirectAfterAuthentication,
            400
        );
    } catch (error) {
        console.error(
            "Email login failed:",
            error
        );

        showAuthStatus({
            containerId: "loginStatus",
            titleId: "loginStatusTitle",
            messageId: "loginStatusMessage",
            title: "Login failed",
            message:
                getReadableAuthError(error),
            type: "error"
        });
    } finally {
        authState.loginInProgress = false;

        setButtonLoading(
            authElements.loginSubmitButton,
            false
        );
    }
}


/* =========================================================
   18. EMAIL SIGNUP
========================================================= */

export async function signupWithEmail({
    fullName,
    email,
    password
}) {
    const normalizedName =
        normalizeText(fullName);

    const normalizedEmail =
        normalizeEmail(email);

    if (normalizedName.length < 2) {
        throw createAuthError(
            "Enter your full name.",
            "invalid_full_name"
        );
    }

    if (!isValidEmail(normalizedEmail)) {
        throw createAuthError(
            "Enter a valid email address.",
            "invalid_email"
        );
    }

    const passwordValidation =
        validatePassword(password);

    if (!passwordValidation.valid) {
        throw createAuthError(
            "Password does not meet all requirements.",
            "weak_password"
        );
    }

    const client = getSupabase();

    const {
        data,
        error
    } = await client.auth.signUp({
        email: normalizedEmail,

        password,

        options: {
            data: {
                full_name:
                    normalizedName,

                name:
                    normalizedName
            },

            emailRedirectTo:
                getOAuthRedirectURL()
        }
    });

    if (error) {
        throw error;
    }

    if (!data?.user) {
        throw createAuthError(
            "The account could not be created.",
            "signup_failed"
        );
    }

    if (data.session) {
        setAuthSession(data.session);

        await Promise.allSettled([
            ensureProfile(),
            ensureUserSettings()
        ]);
    }

    return {
        user: data.user,
        session:
            data.session || null,

        confirmationRequired:
            !data.session
    };
}


/* =========================================================
   19. SIGNUP FORM SUBMISSION
========================================================= */

async function handleSignupSubmit(event) {
    event.preventDefault();

    if (authState.signupInProgress) {
        return;
    }

    const validation =
        validateSignupForm();

    if (!validation.valid) {
        return;
    }

    authState.signupInProgress = true;

    setButtonLoading(
        authElements.signupSubmitButton,
        true,
        "Creating account"
    );

    showAuthStatus({
        containerId: "signupStatus",
        titleId: "signupStatusTitle",
        messageId: "signupStatusMessage",
        title: "Creating account",
        message:
            "nexxorra is preparing your private workspace.",
        type: "info"
    });

    try {
        const result =
            await signupWithEmail({
                fullName:
                    validation.fullName,

                email:
                    validation.email,

                password:
                    validation.password
            });

        if (
            result.confirmationRequired
        ) {
            showAuthStatus({
                containerId: "signupStatus",
                titleId: "signupStatusTitle",
                messageId: "signupStatusMessage",
                title: "Check your email",
                message:
                    "Your account was created. Open the confirmation link sent to your email.",
                type: "success"
            });

            authElements.signupForm?.reset();

            return;
        }

        showAuthStatus({
            containerId: "signupStatus",
            titleId: "signupStatusTitle",
            messageId: "signupStatusMessage",
            title: "Account created",
            message:
                "Your nexxorra workspace is ready.",
            type: "success"
        });

        showPageLoader(
            "Opening your workspace"
        );

        window.setTimeout(
            redirectAfterAuthentication,
            450
        );
    } catch (error) {
        console.error(
            "Email signup failed:",
            error
        );

        showAuthStatus({
            containerId: "signupStatus",
            titleId: "signupStatusTitle",
            messageId: "signupStatusMessage",
            title: "Signup failed",
            message:
                getReadableAuthError(error),
            type: "error"
        });
    } finally {
        authState.signupInProgress = false;

        setButtonLoading(
            authElements.signupSubmitButton,
            false
        );
    }
}


/* =========================================================
   20. GOOGLE OAUTH
========================================================= */

export async function continueWithGoogle() {
    if (
        authState.googleOAuthInProgress
    ) {
        return;
    }

    authState.googleOAuthInProgress = true;

    const client = getSupabase();

    try {
        const {
            data,
            error
        } = await client.auth.signInWithOAuth({
            provider:
                AUTH_CONFIG.providers.google,

            options: {
                redirectTo:
                    getOAuthRedirectURL(),

                queryParams: {
                    access_type:
                        "offline",

                    prompt:
                        "consent"
                }
            }
        });

        if (error) {
            throw error;
        }

        return data;
    } catch (error) {
        authState.googleOAuthInProgress =
            false;

        throw error;
    }
}


/* =========================================================
   21. GOOGLE LOGIN BUTTON
========================================================= */

async function handleGoogleLogin() {
    const button =
        authElements.googleLoginButton;

    if (!button) return;

    button.disabled = true;

    showAuthStatus({
        containerId: "loginStatus",
        titleId: "loginStatusTitle",
        messageId: "loginStatusMessage",
        title: "Opening Google",
        message:
            "Continue securely with your Google account.",
        type: "info"
    });

    try {
        await continueWithGoogle();
    } catch (error) {
        console.error(
            "Google login failed:",
            error
        );

        button.disabled = false;

        showAuthStatus({
            containerId: "loginStatus",
            titleId: "loginStatusTitle",
            messageId: "loginStatusMessage",
            title: "Google login failed",
            message:
                getReadableAuthError(error),
            type: "error"
        });
    }
}


/* =========================================================
   22. GOOGLE SIGNUP BUTTON
========================================================= */

async function handleGoogleSignup() {
    const button =
        authElements.googleSignupButton;

    if (!button) return;

    button.disabled = true;

    showAuthStatus({
        containerId: "signupStatus",
        titleId: "signupStatusTitle",
        messageId: "signupStatusMessage",
        title: "Opening Google",
        message:
            "Choose the Google account for your nexxorra workspace.",
        type: "info"
    });

    try {
        await continueWithGoogle();
    } catch (error) {
        console.error(
            "Google signup failed:",
            error
        );

        button.disabled = false;

        showAuthStatus({
            containerId: "signupStatus",
            titleId: "signupStatusTitle",
            messageId: "signupStatusMessage",
            title: "Google signup failed",
            message:
                getReadableAuthError(error),
            type: "error"
        });
    }
}


/* =========================================================
   23. OAUTH CALLBACK SESSION
========================================================= */

async function resolveOAuthCallback() {
    const url =
        new URL(window.location.href);

    const hasOAuthCode =
        url.searchParams.has("code");

    const hasAuthError =
        url.searchParams.has(
            "error"
        ) ||
        url.searchParams.has(
            "error_description"
        );

    if (hasAuthError) {
        const errorDescription =
            url.searchParams.get(
                "error_description"
            ) ||
            url.searchParams.get(
                "error"
            ) ||
            "Google authentication failed.";

        throw createAuthError(
            errorDescription,
            "oauth_callback_error"
        );
    }

    if (!hasOAuthCode) {
        return null;
    }

    showPageLoader(
        "Completing Google login"
    );

    const client = getSupabase();

    const {
        data,
        error
    } =
        await client.auth.exchangeCodeForSession(
            window.location.href
        );

    if (error) {
        throw error;
    }

    if (!data?.session) {
        throw createAuthError(
            "Google login did not return a session.",
            "missing_oauth_session"
        );
    }

    setAuthSession(data.session);

    await Promise.allSettled([
        ensureProfile(),
        ensureUserSettings()
    ]);

    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );

    return {
        session: data.session,
        user: data.user
    };
}


/* =========================================================
   24. EXISTING SESSION REDIRECT
========================================================= */

async function redirectAuthenticatedUserFromAuthPage() {
    const authPages = [
        ROUTES.login,
        ROUTES.signup
    ];

    if (
        !authPages.includes(
            authState.currentPage
        )
    ) {
        return false;
    }

    const {
        session
    } = await getCurrentSession();

    if (!session) {
        return false;
    }

    showPageLoader(
        "Opening your workspace"
    );

    window.location.replace(
        AUTH_CONFIG.redirectAfterLogin
    );

    return true;
}


/* =========================================================
   25. PROTECTED PAGE CHECK
========================================================= */

async function protectCurrentPage() {
    if (
        !isProtectedPage(
            authState.currentPage
        )
    ) {
        return true;
    }

    const {
        session
    } = await getCurrentSession();

    if (session) {
        return true;
    }

    saveAuthReturnPath(
        authState.currentPage
    );

    window.location.replace(
        ROUTES.login
    );

    return false;
}


/* =========================================================
   26. AUTH EVENT BINDING
========================================================= */

function bindLoginEvents() {
    authElements.loginForm
        ?.addEventListener(
            "submit",
            handleLoginSubmit
        );

    authElements.googleLoginButton
        ?.addEventListener(
            "click",
            handleGoogleLogin
        );

    authElements.loginEmail
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    authElements.loginEmail,
                    "loginEmailError"
                );
            }
        );

    authElements.loginPassword
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    authElements.loginPassword,
                    "loginPasswordError"
                );
            }
        );
}

function bindSignupEvents() {
    authElements.signupForm
        ?.addEventListener(
            "submit",
            handleSignupSubmit
        );

    authElements.googleSignupButton
        ?.addEventListener(
            "click",
            handleGoogleSignup
        );

    authElements.signupFullName
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    authElements.signupFullName,
                    "signupFullNameError"
                );
            }
        );

    authElements.signupEmail
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    authElements.signupEmail,
                    "signupEmailError"
                );
            }
        );

    authElements.signupPassword
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    authElements.signupPassword,
                    "signupPasswordError"
                );
            }
        );

    authElements.signupConfirmPassword
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    authElements.signupConfirmPassword,
                    "signupConfirmPasswordError"
                );
            }
        );
}


/* =========================================================
   27. CORE AUTH INITIALIZATION
========================================================= */

async function initializeAuthCore() {
    if (authState.initialized) {
        return;
    }

    authState.initialized = true;
    authState.loading = true;

    cacheAuthElements();

    bindLoginEvents();
    bindSignupEvents();

    try {
        const protectedAccess =
            await protectCurrentPage();

        if (!protectedAccess) {
            return;
        }

        const oauthResult =
            await resolveOAuthCallback();

        if (oauthResult?.session) {
            showPageLoader(
                "Opening your workspace"
            );

            window.setTimeout(
                redirectAfterAuthentication,
                350
            );

            return;
        }

        await redirectAuthenticatedUserFromAuthPage();
    } catch (error) {
        console.error(
            "Authentication initialization failed:",
            error
        );

        hidePageLoader();

        const isLoginPage =
            authState.currentPage ===
            ROUTES.login;

        const isSignupPage =
            authState.currentPage ===
            ROUTES.signup;

        if (isLoginPage) {
            showAuthStatus({
                containerId: "loginStatus",
                titleId: "loginStatusTitle",
                messageId: "loginStatusMessage",
                title: "Authentication failed",
                message:
                    getReadableAuthError(error),
                type: "error"
            });
        }

        if (isSignupPage) {
            showAuthStatus({
                containerId: "signupStatus",
                titleId: "signupStatusTitle",
                messageId: "signupStatusMessage",
                title: "Authentication failed",
                message:
                    getReadableAuthError(error),
                type: "error"
            });
        }
    } finally {
        authState.loading = false;

        document.documentElement.classList.add(
            "nexxorra-auth-core-ready"
        );
    }
}


/* =========================================================
   28. PUBLIC EXPORTS
========================================================= */

export {
    authState,

    validatePassword,

    getReadableAuthError,

    showAuthStatus,
    hideAuthStatus,

    showFieldError,
    clearFieldError,

    showPageLoader,
    hidePageLoader,

    setButtonLoading,

    protectCurrentPage
};


/* =========================================================
   29. AUTOMATIC START
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAuthCore,
        {
            once: true
        }
    );
} else {
    initializeAuthCore();
}
/* =========================================================
   nexxorra AI — AUTHENTICATION CONTROLLER
   File: auth.js
   Part 2: Password Recovery and Password Update
========================================================= */


/* =========================================================
   30. RECOVERY DOM REFERENCES
========================================================= */

const recoveryElements = {
    requestResetView: null,
    resetEmailSentView: null,
    updatePasswordView: null,
    passwordUpdatedView: null,

    forgotPasswordForm: null,
    recoveryEmail: null,
    sendResetLinkButton: null,
    resendResetLinkButton: null,
    resetEmailAddress: null,

    updatePasswordForm: null,
    newPassword: null,
    confirmNewPassword: null,
    updatePasswordButton: null,

    newPasswordStrength: null,
    newPasswordStrengthText: null
};


/* =========================================================
   31. RECOVERY STATE
========================================================= */

const recoveryState = {
    initialized: false,

    sendingResetEmail: false,
    updatingPassword: false,

    recoveryEmail: "",
    recoverySessionReady: false,

    resendAvailableAt: 0,
    resendTimerId: null
};


/* =========================================================
   32. CACHE RECOVERY ELEMENTS
========================================================= */

function cacheRecoveryElements() {
    recoveryElements.requestResetView =
        document.getElementById(
            "requestResetView"
        );

    recoveryElements.resetEmailSentView =
        document.getElementById(
            "resetEmailSentView"
        );

    recoveryElements.updatePasswordView =
        document.getElementById(
            "updatePasswordView"
        );

    recoveryElements.passwordUpdatedView =
        document.getElementById(
            "passwordUpdatedView"
        );

    recoveryElements.forgotPasswordForm =
        document.getElementById(
            "forgotPasswordForm"
        );

    recoveryElements.recoveryEmail =
        document.getElementById(
            "recoveryEmail"
        );

    recoveryElements.sendResetLinkButton =
        document.getElementById(
            "sendResetLinkButton"
        );

    recoveryElements.resendResetLinkButton =
        document.getElementById(
            "resendResetLinkButton"
        );

    recoveryElements.resetEmailAddress =
        document.getElementById(
            "resetEmailAddress"
        );

    recoveryElements.updatePasswordForm =
        document.getElementById(
            "updatePasswordForm"
        );

    recoveryElements.newPassword =
        document.getElementById(
            "newPassword"
        );

    recoveryElements.confirmNewPassword =
        document.getElementById(
            "confirmNewPassword"
        );

    recoveryElements.updatePasswordButton =
        document.getElementById(
            "updatePasswordButton"
        );

    recoveryElements.newPasswordStrength =
        document.getElementById(
            "newPasswordStrength"
        );

    recoveryElements.newPasswordStrengthText =
        document.getElementById(
            "newPasswordStrengthText"
        );
}


/* =========================================================
   33. RECOVERY VIEW MANAGEMENT
========================================================= */

function hideAllRecoveryViews() {
    [
        recoveryElements.requestResetView,
        recoveryElements.resetEmailSentView,
        recoveryElements.updatePasswordView,
        recoveryElements.passwordUpdatedView
    ].forEach(view => {
        if (view) {
            view.hidden = true;
        }
    });
}

function showRequestResetView() {
    hideAllRecoveryViews();

    if (
        recoveryElements.requestResetView
    ) {
        recoveryElements.requestResetView
            .hidden = false;
    }

    recoveryElements.recoveryEmail
        ?.focus();
}

function showResetEmailSentView(email) {
    hideAllRecoveryViews();

    if (
        recoveryElements.resetEmailSentView
    ) {
        recoveryElements.resetEmailSentView
            .hidden = false;
    }

    if (
        recoveryElements.resetEmailAddress
    ) {
        recoveryElements.resetEmailAddress
            .textContent = email;
    }
}

function showUpdatePasswordView() {
    hideAllRecoveryViews();

    if (
        recoveryElements.updatePasswordView
    ) {
        recoveryElements.updatePasswordView
            .hidden = false;
    }

    window.requestAnimationFrame(() => {
        recoveryElements.newPassword
            ?.focus();
    });
}

function showPasswordUpdatedView() {
    hideAllRecoveryViews();

    if (
        recoveryElements.passwordUpdatedView
    ) {
        recoveryElements.passwordUpdatedView
            .hidden = false;
    }
}


/* =========================================================
   34. PASSWORD RESET REDIRECT URL
========================================================= */

function getRecoveryRedirectURL() {
    return new URL(
        ROUTES.forgotPassword,
        document.baseURI
    ).toString();
}


/* =========================================================
   35. RESET EMAIL VALIDATION
========================================================= */

function validateRecoveryEmail() {
    clearFieldError(
        recoveryElements.recoveryEmail,
        "recoveryEmailError"
    );

    hideAuthStatus(
        "forgotPasswordStatus"
    );

    const email =
        normalizeEmail(
            recoveryElements
                .recoveryEmail
                ?.value
        );

    if (!email) {
        showFieldError(
            recoveryElements.recoveryEmail,
            "recoveryEmailError",
            "Enter your email address."
        );

        return {
            valid: false,
            email: ""
        };
    }

    if (!isValidEmail(email)) {
        showFieldError(
            recoveryElements.recoveryEmail,
            "recoveryEmailError",
            "Enter a valid email address."
        );

        return {
            valid: false,
            email
        };
    }

    return {
        valid: true,
        email
    };
}


/* =========================================================
   36. SEND PASSWORD RESET EMAIL
========================================================= */

export async function sendPasswordResetEmail(
    email
) {
    const normalizedEmail =
        normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
        throw createAuthError(
            "Enter a valid email address.",
            "invalid_recovery_email"
        );
    }

    const client =
        getSupabase();

    const {
        data,
        error
    } =
        await client.auth
            .resetPasswordForEmail(
                normalizedEmail,
                {
                    redirectTo:
                        getRecoveryRedirectURL()
                }
            );

    if (error) {
        throw error;
    }

    return {
        data,
        email: normalizedEmail
    };
}


/* =========================================================
   37. REQUEST RESET EMAIL
========================================================= */

async function requestResetEmail(
    email,
    {
        resend = false
    } = {}
) {
    if (
        recoveryState.sendingResetEmail
    ) {
        return;
    }

    recoveryState.sendingResetEmail =
        true;

    const button = resend
        ? recoveryElements
              .resendResetLinkButton
        : recoveryElements
              .sendResetLinkButton;

    setButtonLoading(
        button,
        true,
        resend
            ? "Resending link"
            : "Sending link"
    );

    if (!resend) {
        showAuthStatus({
            containerId:
                "forgotPasswordStatus",

            titleId:
                "forgotPasswordStatusTitle",

            messageId:
                "forgotPasswordStatusMessage",

            title:
                "Sending recovery link",

            message:
                "nexxorra is preparing a secure password reset email.",

            type: "info"
        });
    }

    try {
        const result =
            await sendPasswordResetEmail(
                email
            );

        recoveryState.recoveryEmail =
            result.email;

        showResetEmailSentView(
            result.email
        );

        startResetResendCooldown();

        if (resend) {
            showTemporaryRecoveryStatus({
                title:
                    "Recovery link resent",

                message:
                    "Check your inbox for the latest password reset email.",

                type: "success"
            });
        }
    } catch (error) {
        console.error(
            "Password reset email failed:",
            error
        );

        if (resend) {
            showTemporaryRecoveryStatus({
                title:
                    "Could not resend link",

                message:
                    getReadableAuthError(
                        error
                    ),

                type: "error"
            });
        } else {
            showAuthStatus({
                containerId:
                    "forgotPasswordStatus",

                titleId:
                    "forgotPasswordStatusTitle",

                messageId:
                    "forgotPasswordStatusMessage",

                title:
                    "Recovery failed",

                message:
                    getReadableAuthError(
                        error
                    ),

                type: "error"
            });
        }
    } finally {
        recoveryState.sendingResetEmail =
            false;

        setButtonLoading(
            button,
            false
        );
    }
}


/* =========================================================
   38. RESET FORM SUBMISSION
========================================================= */

async function handleForgotPasswordSubmit(
    event
) {
    event.preventDefault();

    const validation =
        validateRecoveryEmail();

    if (!validation.valid) {
        return;
    }

    await requestResetEmail(
        validation.email
    );
}


/* =========================================================
   39. RESEND RESET EMAIL
========================================================= */

async function handleResetEmailResend() {
    if (
        Date.now() <
        recoveryState.resendAvailableAt
    ) {
        return;
    }

    const email =
        recoveryState.recoveryEmail;

    if (!email) {
        showRequestResetView();
        return;
    }

    await requestResetEmail(
        email,
        {
            resend: true
        }
    );
}


/* =========================================================
   40. RESEND COOLDOWN
========================================================= */

function startResetResendCooldown(
    durationSeconds = 30
) {
    recoveryState.resendAvailableAt =
        Date.now() +
        durationSeconds * 1000;

    window.clearInterval(
        recoveryState.resendTimerId
    );

    updateResetResendButton();

    recoveryState.resendTimerId =
        window.setInterval(() => {
            updateResetResendButton();

            if (
                Date.now() >=
                recoveryState
                    .resendAvailableAt
            ) {
                window.clearInterval(
                    recoveryState
                        .resendTimerId
                );

                recoveryState.resendTimerId =
                    null;
            }
        }, 1000);
}

function updateResetResendButton() {
    const button =
        recoveryElements
            .resendResetLinkButton;

    if (!button) return;

    const textElement =
        button.querySelector(
            ".auth-submit-text"
        );

    const millisecondsRemaining =
        recoveryState
            .resendAvailableAt -
        Date.now();

    if (
        millisecondsRemaining <= 0
    ) {
        button.disabled = false;

        if (textElement) {
            textElement.textContent =
                "Resend recovery link";
        }

        return;
    }

    const secondsRemaining =
        Math.ceil(
            millisecondsRemaining /
            1000
        );

    button.disabled = true;

    if (textElement) {
        textElement.textContent =
            `Resend in ${secondsRemaining}s`;
    }
}


/* =========================================================
   41. TEMPORARY RECOVERY STATUS
========================================================= */

function showTemporaryRecoveryStatus({
    title,
    message,
    type
}) {
    const existingToast =
        document.createElement("div");

    existingToast.className =
        `auth-status auth-status-${type}`;

    existingToast.setAttribute(
        "role",
        type === "error"
            ? "alert"
            : "status"
    );

    const iconWrapper =
        document.createElement("span");

    iconWrapper.className =
        "auth-status-icon";

    const icon =
        document.createElement("i");

    icon.className =
        type === "success"
            ? "fa-solid fa-circle-check"
            : "fa-solid fa-triangle-exclamation";

    icon.setAttribute(
        "aria-hidden",
        "true"
    );

    iconWrapper.appendChild(icon);

    const content =
        document.createElement("div");

    const titleElement =
        document.createElement("strong");

    titleElement.textContent = title;

    const messageElement =
        document.createElement("p");

    messageElement.textContent =
        message;

    content.append(
        titleElement,
        messageElement
    );

    existingToast.append(
        iconWrapper,
        content
    );

    const sentView =
        recoveryElements
            .resetEmailSentView;

    sentView?.prepend(
        existingToast
    );

    window.setTimeout(() => {
        existingToast.remove();
    }, 4500);
}


/* =========================================================
   42. PASSWORD STRENGTH CALCULATION
========================================================= */

function calculatePasswordStrength(
    password
) {
    const value =
        String(password || "");

    if (!value) {
        return {
            score: 0,
            label: "empty",
            text:
                "Use at least 8 characters."
        };
    }

    let score = 0;

    if (value.length >= 8) {
        score += 1;
    }

    if (
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value)
    ) {
        score += 1;
    }

    if (/\d/.test(value)) {
        score += 1;
    }

    if (
        /[^A-Za-z0-9]/.test(value) ||
        value.length >= 12
    ) {
        score += 1;
    }

    const strengths = {
        0: {
            label: "weak",
            text: "Password is too weak."
        },

        1: {
            label: "weak",
            text: "Password strength: weak."
        },

        2: {
            label: "fair",
            text: "Password strength: fair."
        },

        3: {
            label: "good",
            text: "Password strength: good."
        },

        4: {
            label: "strong",
            text: "Password strength: strong."
        }
    };

    return {
        score,
        ...strengths[score]
    };
}


/* =========================================================
   43. PASSWORD REQUIREMENTS UI
========================================================= */

function updateRequirementElement(
    elementId,
    valid
) {
    const element =
        document.getElementById(
            elementId
        );

    if (!element) return;

    element.classList.toggle(
        "valid",
        valid
    );

    const icon =
        element.querySelector("i");

    if (icon) {
        icon.className = valid
            ? "fa-solid fa-check"
            : "fa-solid fa-circle";
    }
}

function updateNewPasswordStrength() {
    const password =
        recoveryElements
            .newPassword
            ?.value || "";

    const validation =
        validatePassword(password);

    const strength =
        calculatePasswordStrength(
            password
        );

    if (
        recoveryElements
            .newPasswordStrength
    ) {
        recoveryElements
            .newPasswordStrength
            .dataset
            .strength = strength.label;
    }

    if (
        recoveryElements
            .newPasswordStrengthText
    ) {
        recoveryElements
            .newPasswordStrengthText
            .textContent = strength.text;
    }

    updateRequirementElement(
        "newPasswordLengthRequirement",
        validation.requirements.length
    );

    updateRequirementElement(
        "newPasswordUppercaseRequirement",
        validation.requirements.uppercase
    );

    updateRequirementElement(
        "newPasswordLowercaseRequirement",
        validation.requirements.lowercase
    );

    updateRequirementElement(
        "newPasswordNumberRequirement",
        validation.requirements.number
    );

    return validation;
}


/* =========================================================
   44. UPDATE PASSWORD VALIDATION
========================================================= */

function validatePasswordUpdateForm() {
    clearFieldError(
        recoveryElements.newPassword,
        "newPasswordError"
    );

    clearFieldError(
        recoveryElements
            .confirmNewPassword,
        "confirmNewPasswordError"
    );

    hideAuthStatus(
        "updatePasswordStatus"
    );

    const newPassword =
        recoveryElements
            .newPassword
            ?.value || "";

    const confirmation =
        recoveryElements
            .confirmNewPassword
            ?.value || "";

    const passwordValidation =
        validatePassword(
            newPassword
        );

    let valid = true;

    if (
        !passwordValidation.valid
    ) {
        showFieldError(
            recoveryElements.newPassword,
            "newPasswordError",
            "Password does not meet all requirements."
        );

        valid = false;
    }

    if (!confirmation) {
        showFieldError(
            recoveryElements
                .confirmNewPassword,

            "confirmNewPasswordError",

            "Confirm your new password."
        );

        valid = false;
    } else if (
        newPassword !== confirmation
    ) {
        showFieldError(
            recoveryElements
                .confirmNewPassword,

            "confirmNewPasswordError",

            "Passwords do not match."
        );

        valid = false;
    }

    return {
        valid,
        newPassword
    };
}


/* =========================================================
   45. UPDATE AUTHENTICATED PASSWORD
========================================================= */

export async function updateAccountPassword(
    password
) {
    const validation =
        validatePassword(password);

    if (!validation.valid) {
        throw createAuthError(
            "Password does not meet all requirements.",
            "weak_password"
        );
    }

    const client =
        getSupabase();

    const {
        data,
        error
    } =
        await client.auth.updateUser({
            password
        });

    if (error) {
        throw error;
    }

    if (!data?.user) {
        throw createAuthError(
            "The password was not updated.",
            "password_update_failed"
        );
    }

    return data.user;
}


/* =========================================================
   46. UPDATE PASSWORD SUBMISSION
========================================================= */

async function handleUpdatePasswordSubmit(
    event
) {
    event.preventDefault();

    if (
        recoveryState
            .updatingPassword
    ) {
        return;
    }

    const validation =
        validatePasswordUpdateForm();

    if (!validation.valid) {
        return;
    }

    recoveryState.updatingPassword =
        true;

    setButtonLoading(
        recoveryElements
            .updatePasswordButton,

        true,

        "Updating password"
    );

    showAuthStatus({
        containerId:
            "updatePasswordStatus",

        titleId:
            "updatePasswordStatusTitle",

        messageId:
            "updatePasswordStatusMessage",

        title:
            "Updating password",

        message:
            "nexxorra is securely saving your new password.",

        type: "info"
    });

    try {
        await updateAccountPassword(
            validation.newPassword
        );

        recoveryElements
            .updatePasswordForm
            ?.reset();

        showPasswordUpdatedView();

        /*
           Keep the recovery session active so the user can
           continue directly to nexxorra.
        */
    } catch (error) {
        console.error(
            "Password update failed:",
            error
        );

        showAuthStatus({
            containerId:
                "updatePasswordStatus",

            titleId:
                "updatePasswordStatusTitle",

            messageId:
                "updatePasswordStatusMessage",

            title:
                "Password update failed",

            message:
                getReadableAuthError(
                    error
                ),

            type: "error"
        });
    } finally {
        recoveryState.updatingPassword =
            false;

        setButtonLoading(
            recoveryElements
                .updatePasswordButton,

            false
        );
    }
}


/* =========================================================
   47. RECOVERY URL DETECTION
========================================================= */

function hasRecoveryParameters() {
    const url =
        new URL(
            window.location.href
        );

    const hashParameters =
        new URLSearchParams(
            window.location.hash
                .replace(/^#/, "")
        );

    return (
        url.searchParams.has("code") ||
        url.searchParams.get("type") ===
            "recovery" ||
        hashParameters.get("type") ===
            "recovery" ||
        Boolean(
            hashParameters.get(
                "access_token"
            )
        )
    );
}


/* =========================================================
   48. RECOVERY SESSION FROM HASH
========================================================= */

async function setRecoverySessionFromHash() {
    const hashParameters =
        new URLSearchParams(
            window.location.hash
                .replace(/^#/, "")
        );

    const accessToken =
        hashParameters.get(
            "access_token"
        );

    const refreshToken =
        hashParameters.get(
            "refresh_token"
        );

    if (
        !accessToken ||
        !refreshToken
    ) {
        return null;
    }

    const client =
        getSupabase();

    const {
        data,
        error
    } =
        await client.auth.setSession({
            access_token:
                accessToken,

            refresh_token:
                refreshToken
        });

    if (error) {
        throw error;
    }

    return data?.session || null;
}


/* =========================================================
   49. RECOVERY SESSION FROM PKCE CODE
========================================================= */

async function setRecoverySessionFromCode() {
    const url =
        new URL(
            window.location.href
        );

    const code =
        url.searchParams.get("code");

    if (!code) {
        return null;
    }

    const client =
        getSupabase();

    /*
       detectSessionInUrl may already exchange the code.
    */

    const {
        data: currentSessionData
    } = await client.auth.getSession();

    if (
        currentSessionData?.session
    ) {
        return currentSessionData.session;
    }

    const {
        data,
        error
    } =
        await client.auth
            .exchangeCodeForSession(
                code
            );

    if (error) {
        throw error;
    }

    return data?.session || null;
}


/* =========================================================
   50. RESOLVE PASSWORD RECOVERY SESSION
========================================================= */

async function resolvePasswordRecoverySession() {
    if (
        authState.currentPage !==
        ROUTES.forgotPassword
    ) {
        return false;
    }

    if (
        !hasRecoveryParameters()
    ) {
        return false;
    }

    showPageLoader(
        "Checking recovery session"
    );

    try {
        let session =
            await setRecoverySessionFromHash();

        if (!session) {
            session =
                await setRecoverySessionFromCode();
        }

        if (!session) {
            const result =
                await getSupabaseSession();

            session =
                result?.session ||
                null;
        }

        if (!session) {
            throw createAuthError(
                "The recovery link is invalid or has expired.",
                "invalid_recovery_session"
            );
        }

        authState.recoveryMode = true;

        recoveryState
            .recoverySessionReady = true;

        setAuthSession(session);

        cleanRecoveryURL();

        showUpdatePasswordView();

        return true;
    } catch (error) {
        console.error(
            "Recovery session failed:",
            error
        );

        showRequestResetView();

        showAuthStatus({
            containerId:
                "forgotPasswordStatus",

            titleId:
                "forgotPasswordStatusTitle",

            messageId:
                "forgotPasswordStatusMessage",

            title:
                "Recovery link unavailable",

            message:
                "The link is invalid or expired. Request a new recovery email.",

            type: "error"
        });

        return false;
    } finally {
        hidePageLoader();
    }
}


/* =========================================================
   51. CLEAN RECOVERY URL
========================================================= */

function cleanRecoveryURL() {
    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );
}


/* =========================================================
   52. PASSWORD RECOVERY AUTH EVENT
========================================================= */

function bindPasswordRecoveryAuthEvent() {
    const client =
        getSupabase();

    client.auth.onAuthStateChange(
        (
            event,
            session
        ) => {
            if (
                event !==
                "PASSWORD_RECOVERY"
            ) {
                return;
            }

            authState.recoveryMode =
                true;

            recoveryState
                .recoverySessionReady =
                Boolean(session);

            if (session) {
                setAuthSession(
                    session
                );

                cleanRecoveryURL();

                showUpdatePasswordView();

                hidePageLoader();
            }
        }
    );
}


/* =========================================================
   53. RECOVERY INPUT EVENTS
========================================================= */

function bindRecoveryInputEvents() {
    recoveryElements.recoveryEmail
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    recoveryElements
                        .recoveryEmail,

                    "recoveryEmailError"
                );

                hideAuthStatus(
                    "forgotPasswordStatus"
                );
            }
        );

    recoveryElements.newPassword
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    recoveryElements
                        .newPassword,

                    "newPasswordError"
                );

                updateNewPasswordStrength();
            }
        );

    recoveryElements
        .confirmNewPassword
        ?.addEventListener(
            "input",
            () => {
                clearFieldError(
                    recoveryElements
                        .confirmNewPassword,

                    "confirmNewPasswordError"
                );
            }
        );
}


/* =========================================================
   54. RECOVERY FORM EVENTS
========================================================= */

function bindRecoveryFormEvents() {
    recoveryElements
        .forgotPasswordForm
        ?.addEventListener(
            "submit",
            handleForgotPasswordSubmit
        );

    recoveryElements
        .resendResetLinkButton
        ?.addEventListener(
            "click",
            handleResetEmailResend
        );

    recoveryElements
        .updatePasswordForm
        ?.addEventListener(
            "submit",
            handleUpdatePasswordSubmit
        );
}


/* =========================================================
   55. RECOVERY PAGE INITIALIZATION
========================================================= */

async function initializePasswordRecovery() {
    if (
        recoveryState.initialized ||
        authState.currentPage !==
            ROUTES.forgotPassword
    ) {
        return;
    }

    recoveryState.initialized = true;

    cacheRecoveryElements();

    bindRecoveryFormEvents();
    bindRecoveryInputEvents();
    bindPasswordRecoveryAuthEvent();

    updateNewPasswordStrength();

    const recoveryResolved =
        await resolvePasswordRecoverySession();

    if (!recoveryResolved) {
        showRequestResetView();
    }

    document.documentElement
        .classList.add(
            "nexxorra-password-recovery-ready"
        );
}


/* =========================================================
   56. START PART 2
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializePasswordRecovery,
        {
            once: true
        }
    );
} else {
    initializePasswordRecovery();
}
/* =========================================================
   nexxorra AI — AUTHENTICATION CONTROLLER
   File: auth.js
   Part 3: Logout, Route Guards, Session Restore
           and Authentication State Synchronization
========================================================= */


/* =========================================================
   57. SESSION LISTENER STATE
========================================================= */

const sessionState = {
    listenerInitialized: false,
    subscription: null,

    initialSessionResolved: false,
    redirectInProgress: false,

    lastAuthEvent: null,
    lastSessionUserId: null
};


/* =========================================================
   58. AUTHENTICATION PAGE CHECK
========================================================= */

function isAuthenticationPage(
    page = authState.currentPage
) {
    return [
        ROUTES.login,
        ROUTES.signup,
        ROUTES.forgotPassword
    ].includes(page);
}


/* =========================================================
   59. PROTECTED PAGE LIST
========================================================= */

function isCurrentPageProtected() {
    return isProtectedPage(
        authState.currentPage
    );
}


/* =========================================================
   60. SAFE PAGE REDIRECT
========================================================= */

function redirectToPage(
    page,
    {
        replace = true
    } = {}
) {
    if (
        !page ||
        sessionState.redirectInProgress
    ) {
        return;
    }

    sessionState.redirectInProgress = true;

    if (replace) {
        window.location.replace(page);
    } else {
        window.location.href = page;
    }
}


/* =========================================================
   61. SAVE PROTECTED PAGE RETURN PATH
========================================================= */

function preserveCurrentProtectedPage() {
    if (!isCurrentPageProtected()) {
        return;
    }

    saveAuthReturnPath(
        authState.currentPage
    );
}


/* =========================================================
   62. LOGOUT
========================================================= */

export async function logoutUser({
    redirect = true
} = {}) {
    const client =
        getSupabase();

    try {
        showPageLoader(
            "Logging out"
        );

        const {
            error
        } = await client.auth.signOut({
            scope: "local"
        });

        if (error) {
            throw error;
        }

        authState.session = null;
        authState.user = null;

        sessionState.lastSessionUserId =
            null;

        document.dispatchEvent(
            new CustomEvent(
                "nexxorra:logout",
                {
                    detail: {
                        redirect
                    }
                }
            )
        );

        document.dispatchEvent(
            new CustomEvent(
                "nexxorra:auth-session",
                {
                    detail: {
                        event:
                            "SIGNED_OUT",

                        session: null,
                        user: null
                    }
                }
            )
        );

        if (redirect) {
            redirectToPage(
                AUTH_CONFIG
                    .redirectAfterLogout
            );
        }

        return true;
    } catch (error) {
        console.error(
            "Logout failed:",
            error
        );

        hidePageLoader();

        showGlobalAuthMessage({
            title: "Logout failed",
            message:
                getReadableAuthError(
                    error
                ),
            type: "error"
        });

        return false;
    }
}


/* =========================================================
   63. GLOBAL AUTH MESSAGE
========================================================= */

function showGlobalAuthMessage({
    title,
    message,
    type = "info"
}) {
    const statusConfigurations = [
        {
            containerId:
                "loginStatus",
            titleId:
                "loginStatusTitle",
            messageId:
                "loginStatusMessage"
        },

        {
            containerId:
                "signupStatus",
            titleId:
                "signupStatusTitle",
            messageId:
                "signupStatusMessage"
        },

        {
            containerId:
                "forgotPasswordStatus",
            titleId:
                "forgotPasswordStatusTitle",
            messageId:
                "forgotPasswordStatusMessage"
        },

        {
            containerId:
                "updatePasswordStatus",
            titleId:
                "updatePasswordStatusTitle",
            messageId:
                "updatePasswordStatusMessage"
        }
    ];

    const availableStatus =
        statusConfigurations.find(
            configuration =>
                document.getElementById(
                    configuration.containerId
                )
        );

    if (availableStatus) {
        showAuthStatus({
            ...availableStatus,
            title,
            message,
            type
        });

        return;
    }

    createAuthToast({
        title,
        message,
        type
    });
}


/* =========================================================
   64. AUTH TOAST
========================================================= */

function createAuthToast({
    title,
    message,
    type = "info",
    duration = 3500
}) {
    const toastRegion =
        document.getElementById(
            "toastRegion"
        );

    if (!toastRegion) {
        return;
    }

    const toast =
        document.createElement(
            "article"
        );

    toast.className =
        `toast toast-${type}`;

    toast.setAttribute(
        "role",
        type === "error"
            ? "alert"
            : "status"
    );

    const iconWrapper =
        document.createElement(
            "span"
        );

    iconWrapper.className =
        "toast-icon";

    const icon =
        document.createElement("i");

    const iconClasses = {
        success:
            "fa-solid fa-check",

        error:
            "fa-solid fa-triangle-exclamation",

        warning:
            "fa-solid fa-circle-exclamation",

        info:
            "fa-solid fa-circle-info"
    };

    icon.className =
        iconClasses[type] ||
        iconClasses.info;

    icon.setAttribute(
        "aria-hidden",
        "true"
    );

    iconWrapper.appendChild(icon);

    const content =
        document.createElement(
            "div"
        );

    content.className =
        "toast-content";

    const titleElement =
        document.createElement(
            "strong"
        );

    titleElement.textContent =
        title;

    const messageElement =
        document.createElement(
            "span"
        );

    messageElement.textContent =
        message;

    content.append(
        titleElement,
        messageElement
    );

    const closeButton =
        document.createElement(
            "button"
        );

    closeButton.className =
        "toast-close";

    closeButton.type = "button";

    closeButton.setAttribute(
        "aria-label",
        "Close notification"
    );

    const closeIcon =
        document.createElement("i");

    closeIcon.className =
        "fa-solid fa-xmark";

    closeIcon.setAttribute(
        "aria-hidden",
        "true"
    );

    closeButton.appendChild(
        closeIcon
    );

    toast.append(
        iconWrapper,
        content,
        closeButton
    );

    toastRegion.appendChild(toast);

    function removeToast() {
        if (!toast.isConnected) {
            return;
        }

        toast.remove();
    }

    closeButton.addEventListener(
        "click",
        removeToast
    );

    if (duration > 0) {
        window.setTimeout(
            removeToast,
            duration
        );
    }
}


/* =========================================================
   65. SESSION USER SYNCHRONIZATION
========================================================= */

async function synchronizeAuthenticatedUser(
    session
) {
    if (!session?.user) {
        return;
    }

    const userId =
        session.user.id;

    if (
        sessionState.lastSessionUserId ===
        userId
    ) {
        return;
    }

    sessionState.lastSessionUserId =
        userId;

    await Promise.allSettled([
        ensureProfile(),
        ensureUserSettings()
    ]);
}


/* =========================================================
   66. REDIRECT AUTHENTICATED AUTH-PAGE USER
========================================================= */

function handleAuthenticatedAuthPage(
    event
) {
    if (
        authState.recoveryMode ||
        event === "PASSWORD_RECOVERY"
    ) {
        return;
    }

    if (
        ![
            ROUTES.login,
            ROUTES.signup
        ].includes(
            authState.currentPage
        )
    ) {
        return;
    }

    showPageLoader(
        "Opening your workspace"
    );

    const targetPage =
        consumeAuthReturnPath() ||
        AUTH_CONFIG
            .redirectAfterLogin;

    redirectToPage(
        targetPage
    );
}


/* =========================================================
   67. HANDLE UNAUTHENTICATED PROTECTED PAGE
========================================================= */

function handleUnauthenticatedProtectedPage() {
    if (!isCurrentPageProtected()) {
        return;
    }

    preserveCurrentProtectedPage();

    showPageLoader(
        "Redirecting to login"
    );

    redirectToPage(
        ROUTES.login
    );
}


/* =========================================================
   68. PROCESS AUTH STATE CHANGE
========================================================= */

async function processAuthStateChange(
    event,
    session
) {
    sessionState.lastAuthEvent =
        event;

    authState.session =
        session || null;

    authState.user =
        session?.user || null;

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:auth-session",
            {
                detail: {
                    event,
                    session:
                        authState.session,

                    user:
                        authState.user
                }
            }
        )
    );

    if (session?.user) {
        await synchronizeAuthenticatedUser(
            session
        );

        if (
            event ===
            "PASSWORD_RECOVERY"
        ) {
            authState.recoveryMode =
                true;

            return;
        }

        if (
            event === "SIGNED_IN" ||
            event ===
                "INITIAL_SESSION"
        ) {
            handleAuthenticatedAuthPage(
                event
            );
        }

        return;
    }

    sessionState.lastSessionUserId =
        null;

    if (
        event === "SIGNED_OUT" ||
        event ===
            "INITIAL_SESSION"
    ) {
        handleUnauthenticatedProtectedPage();
    }
}


/* =========================================================
   69. AUTH STATE CHANGE LISTENER
========================================================= */

function initializeAuthStateListener() {
    if (
        sessionState.listenerInitialized
    ) {
        return;
    }

    sessionState.listenerInitialized =
        true;

    const client =
        getSupabase();

    const {
        data
    } = client.auth.onAuthStateChange(
        (
            event,
            session
        ) => {
            window.setTimeout(
                () => {
                    processAuthStateChange(
                        event,
                        session
                    ).catch(error => {
                        console.error(
                            "Auth state processing failed:",
                            error
                        );
                    });
                },
                0
            );
        }
    );

    sessionState.subscription =
        data?.subscription || null;
}


/* =========================================================
   70. STOP AUTH LISTENER
========================================================= */

export function stopAuthStateListener() {
    sessionState.subscription
        ?.unsubscribe();

    sessionState.subscription =
        null;

    sessionState.listenerInitialized =
        false;
}


/* =========================================================
   71. RESTORE INITIAL SESSION
========================================================= */

async function restoreAuthenticationSession() {
    if (
        sessionState
            .initialSessionResolved
    ) {
        return {
            session:
                authState.session,

            user:
                authState.user
        };
    }

    sessionState
        .initialSessionResolved = true;

    try {
        const result =
            await getSupabaseSession();

        const session =
            result?.session || null;

        authState.session =
            session;

        authState.user =
            session?.user || null;

        if (session?.user) {
            await synchronizeAuthenticatedUser(
                session
            );
        }

        return {
            session,
            user:
                session?.user || null
        };
    } catch (error) {
        console.error(
            "Session restoration failed:",
            error
        );

        authState.session = null;
        authState.user = null;

        return {
            session: null,
            user: null
        };
    }
}


/* =========================================================
   72. PROTECTED ROUTE GUARD
========================================================= */

export async function guardProtectedRoute() {
    if (!isCurrentPageProtected()) {
        return true;
    }

    showPageLoader(
        "Checking your account"
    );

    const {
        session
    } =
        await restoreAuthenticationSession();

    if (!session) {
        preserveCurrentProtectedPage();

        redirectToPage(
            ROUTES.login
        );

        return false;
    }

    hidePageLoader();

    return true;
}


/* =========================================================
   73. PUBLIC AUTH-PAGE GUARD
========================================================= */

async function guardAuthenticationPage() {
    if (
        ![
            ROUTES.login,
            ROUTES.signup
        ].includes(
            authState.currentPage
        )
    ) {
        return true;
    }

    const {
        session
    } =
        await restoreAuthenticationSession();

    if (!session) {
        hidePageLoader();
        return true;
    }

    handleAuthenticatedAuthPage(
        "INITIAL_SESSION"
    );

    return false;
}


/* =========================================================
   74. SESSION EXPIRY CHECK
========================================================= */

function isSessionExpired(
    session
) {
    const expiresAt =
        Number(
            session?.expires_at
        );

    if (!expiresAt) {
        return false;
    }

    const expiryMilliseconds =
        expiresAt * 1000;

    return (
        Date.now() >=
        expiryMilliseconds
    );
}


/* =========================================================
   75. REFRESH SESSION
========================================================= */

export async function refreshAuthSession() {
    const client =
        getSupabase();

    try {
        const {
            data,
            error
        } =
            await client.auth
                .refreshSession();

        if (error) {
            throw error;
        }

        const session =
            data?.session || null;

        setAuthSession(session);

        return {
            session,
            user:
                session?.user || null
        };
    } catch (error) {
        console.error(
            "Session refresh failed:",
            error
        );

        setAuthSession(null);

        if (
            isCurrentPageProtected()
        ) {
            preserveCurrentProtectedPage();

            redirectToPage(
                ROUTES.login
            );
        }

        return {
            session: null,
            user: null
        };
    }
}


/* =========================================================
   76. PERIODIC SESSION VALIDATION
========================================================= */

let sessionValidationTimer = null;

function startSessionValidation() {
    window.clearInterval(
        sessionValidationTimer
    );

    sessionValidationTimer =
        window.setInterval(
            async () => {
                if (
                    document
                        .visibilityState !==
                    "visible"
                ) {
                    return;
                }

                const session =
                    authState.session;

                if (!session) {
                    return;
                }

                if (
                    isSessionExpired(
                        session
                    )
                ) {
                    await refreshAuthSession();
                }
            },
            60 * 1000
        );
}


/* =========================================================
   77. LOGOUT BUTTON SELECTORS
========================================================= */

function getLogoutButtons() {
    return [
        ...document.querySelectorAll(
            [
                "#logoutButton",
                "#accountLogoutButton",
                "#profileLogoutButton",
                "#settingsLogoutButton",
                "[data-auth-action='logout']"
            ].join(",")
        )
    ];
}


/* =========================================================
   78. BIND LOGOUT BUTTONS
========================================================= */

function bindLogoutButtons() {
    getLogoutButtons().forEach(
        button => {
            if (
                button.dataset
                    .logoutBound ===
                "true"
            ) {
                return;
            }

            button.dataset.logoutBound =
                "true";

            button.addEventListener(
                "click",
                async event => {
                    event.preventDefault();

                    button.disabled = true;

                    await logoutUser({
                        redirect: true
                    });

                    button.disabled = false;
                }
            );
        }
    );
}


/* =========================================================
   79. AUTH SESSION API
========================================================= */

export function getAuthenticatedUser() {
    return authState.user;
}

export function getAuthenticatedSession() {
    return authState.session;
}

export function isUserAuthenticated() {
    return Boolean(
        authState.session &&
        authState.user
    );
}


/* =========================================================
   80. REQUIRE AUTHENTICATION
========================================================= */

export async function requireAuthentication({
    redirect = true
} = {}) {
    const {
        session,
        user
    } =
        await restoreAuthenticationSession();

    if (session && user) {
        return {
            session,
            user
        };
    }

    if (redirect) {
        preserveCurrentProtectedPage();

        redirectToPage(
            ROUTES.login
        );
    }

    throw createAuthError(
        "You must be logged in.",
        "authentication_required"
    );
}


/* =========================================================
   81. PAGE VISIBILITY SESSION CHECK
========================================================= */

async function handlePageVisibilityChange() {
    if (
        document.visibilityState !==
        "visible"
    ) {
        return;
    }

    const {
        session
    } =
        await getCurrentSession();

    if (
        !session &&
        isCurrentPageProtected()
    ) {
        preserveCurrentProtectedPage();

        redirectToPage(
            ROUTES.login
        );
    }
}


/* =========================================================
   82. BROWSER STORAGE SESSION EVENT
========================================================= */

function handleStorageAuthenticationChange(
    event
) {
    if (
        event.key !==
        SUPABASE_CONFIG?.auth
            ?.storageKey
    ) {
        return;
    }

    restoreAuthenticationSession()
        .then(
            ({
                session
            }) => {
                if (
                    !session &&
                    isCurrentPageProtected()
                ) {
                    preserveCurrentProtectedPage();

                    redirectToPage(
                        ROUTES.login
                    );
                }
            }
        )
        .catch(error => {
            console.error(
                "Cross-tab auth synchronization failed:",
                error
            );
        });
}


/* =========================================================
   83. ACCOUNT UI UPDATE
========================================================= */

function updateAccountElements(
    user
) {
    const displayName =
        getUserDisplayName(user);

    const email =
        user?.email ||
        "Guest workspace";

    const initial =
        displayName
            .charAt(0)
            .toUpperCase() ||
        "G";

    document
        .querySelectorAll(
            [
                "#railProfileInitial",
                ".account-avatar",
                ".account-large-avatar",
                "[data-user-initial]"
            ].join(",")
        )
        .forEach(element => {
            element.textContent =
                initial;
        });

    document
        .querySelectorAll(
            "[data-user-name]"
        )
        .forEach(element => {
            element.textContent =
                displayName;
        });

    document
        .querySelectorAll(
            "[data-user-email]"
        )
        .forEach(element => {
            element.textContent =
                email;
        });

    const authenticatedElements =
        document.querySelectorAll(
            "[data-auth-visible='authenticated']"
        );

    const guestElements =
        document.querySelectorAll(
            "[data-auth-visible='guest']"
        );

    authenticatedElements.forEach(
        element => {
            element.hidden = !user;
        }
    );

    guestElements.forEach(
        element => {
            element.hidden =
                Boolean(user);
        }
    );
}


/* =========================================================
   84. AUTH UI EVENT
========================================================= */

document.addEventListener(
    "nexxorra:auth-session",
    event => {
        updateAccountElements(
            event.detail?.user ||
            null
        );

        bindLogoutButtons();
    }
);


/* =========================================================
   85. SESSION SYNCHRONIZATION EVENTS
========================================================= */

function bindSessionSynchronizationEvents() {
    document.addEventListener(
        "visibilitychange",
        handlePageVisibilityChange
    );

    window.addEventListener(
        "storage",
        handleStorageAuthenticationChange
    );

    window.addEventListener(
        "pageshow",
        event => {
            if (event.persisted) {
                restoreAuthenticationSession();
            }
        }
    );
}


/* =========================================================
   86. PART 3 INITIALIZATION
========================================================= */

async function initializeSessionManagement() {
    initializeAuthStateListener();

    bindLogoutButtons();
    bindSessionSynchronizationEvents();

    startSessionValidation();

    const protectedAccess =
        await guardProtectedRoute();

    if (!protectedAccess) {
        return;
    }

    const authenticationPageAccess =
        await guardAuthenticationPage();

    if (!authenticationPageAccess) {
        return;
    }

    const {
        user
    } =
        await restoreAuthenticationSession();

    updateAccountElements(user);

    hidePageLoader();

    document.documentElement
        .classList.add(
            "nexxorra-auth-session-ready"
        );
}


/* =========================================================
   87. CLEANUP
========================================================= */

window.addEventListener(
    "pagehide",
    () => {
        window.clearInterval(
            sessionValidationTimer
        );
    }
);


/* =========================================================
   88. START PART 3
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeSessionManagement,
        {
            once: true
        }
    );
} else {
    initializeSessionManagement();
}

/* =========================================================
   nexxorra AI — AUTHENTICATION CONTROLLER
   File: auth.js
   Part 4: Password Visibility, Password Strength,
           Real-Time Validation and Accessibility
========================================================= */


/* =========================================================
   89. UI ENHANCEMENT STATE
========================================================= */

const authUIState = {
    initialized: false,

    passwordToggles: new Map(),

    signupPasswordTouched: false,
    signupConfirmPasswordTouched: false,

    loginEmailTouched: false,
    loginPasswordTouched: false,

    recoveryEmailTouched: false,
    newPasswordTouched: false,
    confirmNewPasswordTouched: false
};


/* =========================================================
   90. PASSWORD TOGGLE CONFIGURATION
========================================================= */

const PASSWORD_TOGGLE_CONFIG = [
    {
        buttonId: "loginPasswordToggle",
        inputId: "loginPassword",
        visibleLabel: "Hide password",
        hiddenLabel: "Show password"
    },

    {
        buttonId: "signupPasswordToggle",
        inputId: "signupPassword",
        visibleLabel: "Hide password",
        hiddenLabel: "Show password"
    },

    {
        buttonId: "signupConfirmPasswordToggle",
        inputId: "signupConfirmPassword",
        visibleLabel: "Hide confirmation password",
        hiddenLabel: "Show confirmation password"
    },

    {
        buttonId: "newPasswordToggle",
        inputId: "newPassword",
        visibleLabel: "Hide new password",
        hiddenLabel: "Show new password"
    },

    {
        buttonId: "confirmNewPasswordToggle",
        inputId: "confirmNewPassword",
        visibleLabel: "Hide confirmation password",
        hiddenLabel: "Show confirmation password"
    }
];


/* =========================================================
   91. PASSWORD VISIBILITY
========================================================= */

function setPasswordVisibility({
    button,
    input,
    visible,
    visibleLabel,
    hiddenLabel
}) {
    if (!button || !input) {
        return;
    }

    input.type =
        visible
            ? "text"
            : "password";

    button.setAttribute(
        "aria-pressed",
        String(visible)
    );

    button.setAttribute(
        "aria-label",
        visible
            ? visibleLabel
            : hiddenLabel
    );

    const icon =
        button.querySelector("i");

    if (icon) {
        icon.className =
            visible
                ? "fa-regular fa-eye-slash"
                : "fa-regular fa-eye";
    }

    authUIState.passwordToggles.set(
        button.id,
        visible
    );
}

function togglePasswordVisibility(
    configuration
) {
    const button =
        document.getElementById(
            configuration.buttonId
        );

    const input =
        document.getElementById(
            configuration.inputId
        );

    if (!button || !input) {
        return;
    }

    const currentlyVisible =
        input.type === "text";

    const selectionStart =
        input.selectionStart;

    const selectionEnd =
        input.selectionEnd;

    setPasswordVisibility({
        button,
        input,
        visible:
            !currentlyVisible,

        visibleLabel:
            configuration.visibleLabel,

        hiddenLabel:
            configuration.hiddenLabel
    });

    input.focus();

    if (
        typeof selectionStart === "number" &&
        typeof selectionEnd === "number"
    ) {
        window.requestAnimationFrame(() => {
            input.setSelectionRange(
                selectionStart,
                selectionEnd
            );
        });
    }
}

function bindPasswordVisibilityButtons() {
    PASSWORD_TOGGLE_CONFIG.forEach(
        configuration => {
            const button =
                document.getElementById(
                    configuration.buttonId
                );

            const input =
                document.getElementById(
                    configuration.inputId
                );

            if (!button || !input) {
                return;
            }

            if (
                button.dataset
                    .passwordToggleBound ===
                "true"
            ) {
                return;
            }

            button.dataset.passwordToggleBound =
                "true";

            setPasswordVisibility({
                button,
                input,
                visible: false,
                visibleLabel:
                    configuration.visibleLabel,
                hiddenLabel:
                    configuration.hiddenLabel
            });

            button.addEventListener(
                "click",
                () => {
                    togglePasswordVisibility(
                        configuration
                    );
                }
            );
        }
    );
}


/* =========================================================
   92. SIGNUP PASSWORD REQUIREMENT IDS
========================================================= */

const SIGNUP_REQUIREMENT_IDS = {
    length:
        "passwordLengthRequirement",

    uppercase:
        "passwordUppercaseRequirement",

    lowercase:
        "passwordLowercaseRequirement",

    number:
        "passwordNumberRequirement"
};


/* =========================================================
   93. PASSWORD SCORE
========================================================= */

function getPasswordScore(
    password
) {
    const value =
        String(password || "");

    if (!value) {
        return {
            score: 0,
            label: "empty",
            text:
                "Use at least 8 characters."
        };
    }

    let score = 0;

    if (value.length >= 8) {
        score += 1;
    }

    if (
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value)
    ) {
        score += 1;
    }

    if (/\d/.test(value)) {
        score += 1;
    }

    if (
        /[^A-Za-z0-9]/.test(value) ||
        value.length >= 12
    ) {
        score += 1;
    }

    const labels = {
        0: {
            label: "weak",
            text:
                "Password strength: weak."
        },

        1: {
            label: "weak",
            text:
                "Password strength: weak."
        },

        2: {
            label: "fair",
            text:
                "Password strength: fair."
        },

        3: {
            label: "good",
            text:
                "Password strength: good."
        },

        4: {
            label: "strong",
            text:
                "Password strength: strong."
        }
    };

    return {
        score,
        ...labels[score]
    };
}


/* =========================================================
   94. REQUIREMENT VISUAL UPDATE
========================================================= */

function setRequirementState(
    requirementId,
    valid
) {
    const requirement =
        document.getElementById(
            requirementId
        );

    if (!requirement) {
        return;
    }

    requirement.classList.toggle(
        "valid",
        valid
    );

    const icon =
        requirement.querySelector("i");

    if (icon) {
        icon.className =
            valid
                ? "fa-solid fa-check"
                : "fa-solid fa-circle";
    }

    requirement.setAttribute(
        "aria-label",
        valid
            ? `${requirement.textContent.trim()} satisfied`
            : `${requirement.textContent.trim()} not satisfied`
    );
}


/* =========================================================
   95. SIGNUP PASSWORD STRENGTH UI
========================================================= */

function updateSignupPasswordStrength() {
    const input =
        authElements.signupPassword;

    if (!input) {
        return null;
    }

    const password =
        input.value || "";

    const validation =
        validatePassword(password);

    const strength =
        getPasswordScore(password);

    const strengthContainer =
        document.getElementById(
            "signupPasswordStrength"
        );

    const strengthText =
        document.getElementById(
            "signupPasswordStrengthText"
        );

    if (strengthContainer) {
        strengthContainer.dataset.strength =
            strength.label;
    }

    if (strengthText) {
        strengthText.textContent =
            strength.text;
    }

    setRequirementState(
        SIGNUP_REQUIREMENT_IDS.length,
        validation.requirements.length
    );

    setRequirementState(
        SIGNUP_REQUIREMENT_IDS.uppercase,
        validation.requirements.uppercase
    );

    setRequirementState(
        SIGNUP_REQUIREMENT_IDS.lowercase,
        validation.requirements.lowercase
    );

    setRequirementState(
        SIGNUP_REQUIREMENT_IDS.number,
        validation.requirements.number
    );

    return validation;
}


/* =========================================================
   96. INPUT VALIDITY STATE
========================================================= */

function setInputValidityState(
    input,
    {
        valid = false,
        invalid = false
    } = {}
) {
    const wrapper =
        input?.closest(
            ".auth-input-wrapper"
        );

    if (!wrapper) {
        return;
    }

    wrapper.classList.toggle(
        "has-valid",
        Boolean(valid)
    );

    wrapper.classList.toggle(
        "has-error",
        Boolean(invalid)
    );
}


/* =========================================================
   97. LOGIN EMAIL REAL-TIME VALIDATION
========================================================= */

function validateLoginEmailRealtime({
    force = false
} = {}) {
    const input =
        authElements.loginEmail;

    if (!input) {
        return true;
    }

    const email =
        normalizeEmail(
            input.value
        );

    if (
        !force &&
        !authUIState.loginEmailTouched &&
        !email
    ) {
        return true;
    }

    if (!email) {
        showFieldError(
            input,
            "loginEmailError",
            "Enter your email address."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (!isValidEmail(email)) {
        showFieldError(
            input,
            "loginEmailError",
            "Enter a valid email address."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "loginEmailError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   98. LOGIN PASSWORD REAL-TIME VALIDATION
========================================================= */

function validateLoginPasswordRealtime({
    force = false
} = {}) {
    const input =
        authElements.loginPassword;

    if (!input) {
        return true;
    }

    const password =
        input.value || "";

    if (
        !force &&
        !authUIState.loginPasswordTouched &&
        !password
    ) {
        return true;
    }

    if (!password) {
        showFieldError(
            input,
            "loginPasswordError",
            "Enter your password."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (password.length < 8) {
        showFieldError(
            input,
            "loginPasswordError",
            "Password must contain at least 8 characters."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "loginPasswordError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   99. SIGNUP NAME VALIDATION
========================================================= */

function validateSignupNameRealtime({
    force = false
} = {}) {
    const input =
        authElements.signupFullName;

    if (!input) {
        return true;
    }

    const fullName =
        normalizeText(
            input.value
        );

    if (
        !force &&
        document.activeElement !== input &&
        !fullName
    ) {
        return true;
    }

    if (fullName.length < 2) {
        showFieldError(
            input,
            "signupFullNameError",
            "Enter your full name."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (fullName.length > 100) {
        showFieldError(
            input,
            "signupFullNameError",
            "Full name is too long."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "signupFullNameError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   100. SIGNUP EMAIL VALIDATION
========================================================= */

function validateSignupEmailRealtime({
    force = false
} = {}) {
    const input =
        authElements.signupEmail;

    if (!input) {
        return true;
    }

    const email =
        normalizeEmail(
            input.value
        );

    if (
        !force &&
        document.activeElement !== input &&
        !email
    ) {
        return true;
    }

    if (!email) {
        showFieldError(
            input,
            "signupEmailError",
            "Enter your email address."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (!isValidEmail(email)) {
        showFieldError(
            input,
            "signupEmailError",
            "Enter a valid email address."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "signupEmailError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   101. SIGNUP PASSWORD VALIDATION
========================================================= */

function validateSignupPasswordRealtime({
    force = false
} = {}) {
    const input =
        authElements.signupPassword;

    if (!input) {
        return true;
    }

    const password =
        input.value || "";

    const validation =
        updateSignupPasswordStrength();

    if (
        !force &&
        !authUIState.signupPasswordTouched &&
        !password
    ) {
        return true;
    }

    if (!password) {
        showFieldError(
            input,
            "signupPasswordError",
            "Create a password."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (!validation?.valid) {
        showFieldError(
            input,
            "signupPasswordError",
            "Password does not meet all requirements."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "signupPasswordError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   102. CONFIRM PASSWORD VALIDATION
========================================================= */

function validateSignupConfirmPasswordRealtime({
    force = false
} = {}) {
    const input =
        authElements.signupConfirmPassword;

    if (!input) {
        return true;
    }

    const password =
        authElements.signupPassword
            ?.value || "";

    const confirmation =
        input.value || "";

    if (
        !force &&
        !authUIState
            .signupConfirmPasswordTouched &&
        !confirmation
    ) {
        return true;
    }

    if (!confirmation) {
        showFieldError(
            input,
            "signupConfirmPasswordError",
            "Confirm your password."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (
        password !==
        confirmation
    ) {
        showFieldError(
            input,
            "signupConfirmPasswordError",
            "Passwords do not match."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "signupConfirmPasswordError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   103. RECOVERY EMAIL REAL-TIME VALIDATION
========================================================= */

function validateRecoveryEmailRealtime({
    force = false
} = {}) {
    const input =
        recoveryElements.recoveryEmail;

    if (!input) {
        return true;
    }

    const email =
        normalizeEmail(
            input.value
        );

    if (
        !force &&
        !authUIState.recoveryEmailTouched &&
        !email
    ) {
        return true;
    }

    if (!email) {
        showFieldError(
            input,
            "recoveryEmailError",
            "Enter your email address."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (!isValidEmail(email)) {
        showFieldError(
            input,
            "recoveryEmailError",
            "Enter a valid email address."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "recoveryEmailError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   104. NEW PASSWORD REAL-TIME VALIDATION
========================================================= */

function validateNewPasswordRealtime({
    force = false
} = {}) {
    const input =
        recoveryElements.newPassword;

    if (!input) {
        return true;
    }

    const password =
        input.value || "";

    const validation =
        updateNewPasswordStrength();

    if (
        !force &&
        !authUIState.newPasswordTouched &&
        !password
    ) {
        return true;
    }

    if (!password) {
        showFieldError(
            input,
            "newPasswordError",
            "Create a new password."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (!validation?.valid) {
        showFieldError(
            input,
            "newPasswordError",
            "Password does not meet all requirements."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "newPasswordError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   105. CONFIRM NEW PASSWORD VALIDATION
========================================================= */

function validateConfirmNewPasswordRealtime({
    force = false
} = {}) {
    const input =
        recoveryElements
            .confirmNewPassword;

    if (!input) {
        return true;
    }

    const password =
        recoveryElements
            .newPassword
            ?.value || "";

    const confirmation =
        input.value || "";

    if (
        !force &&
        !authUIState
            .confirmNewPasswordTouched &&
        !confirmation
    ) {
        return true;
    }

    if (!confirmation) {
        showFieldError(
            input,
            "confirmNewPasswordError",
            "Confirm your new password."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    if (
        password !==
        confirmation
    ) {
        showFieldError(
            input,
            "confirmNewPasswordError",
            "Passwords do not match."
        );

        setInputValidityState(
            input,
            {
                invalid: true
            }
        );

        return false;
    }

    clearFieldError(
        input,
        "confirmNewPasswordError"
    );

    setInputValidityState(
        input,
        {
            valid: true
        }
    );

    return true;
}


/* =========================================================
   106. FORM VALIDITY UPDATE
========================================================= */

function updateLoginSubmitAvailability() {
    const button =
        authElements.loginSubmitButton;

    if (!button) {
        return;
    }

    const hasEmail =
        Boolean(
            normalizeEmail(
                authElements.loginEmail
                    ?.value
            )
        );

    const hasPassword =
        Boolean(
            authElements.loginPassword
                ?.value
        );

    if (!authState.loginInProgress) {
        button.disabled =
            !(hasEmail && hasPassword);
    }
}

function updateSignupSubmitAvailability() {
    const button =
        authElements.signupSubmitButton;

    if (!button) {
        return;
    }

    const hasName =
        normalizeText(
            authElements.signupFullName
                ?.value
        ).length >= 2;

    const hasEmail =
        isValidEmail(
            authElements.signupEmail
                ?.value
        );

    const passwordValidation =
        validatePassword(
            authElements.signupPassword
                ?.value
        );

    const passwordsMatch =
        Boolean(
            authElements
                .signupConfirmPassword
                ?.value
        ) &&
        authElements.signupPassword
            ?.value ===
        authElements
            .signupConfirmPassword
            ?.value;

    const termsAccepted =
        Boolean(
            authElements.acceptTerms
                ?.checked
        );

    if (!authState.signupInProgress) {
        button.disabled =
            !(
                hasName &&
                hasEmail &&
                passwordValidation.valid &&
                passwordsMatch &&
                termsAccepted
            );
    }
}

function updateRecoverySubmitAvailability() {
    const button =
        recoveryElements
            .sendResetLinkButton;

    if (!button) {
        return;
    }

    if (
        !recoveryState
            .sendingResetEmail
    ) {
        button.disabled =
            !isValidEmail(
                recoveryElements
                    .recoveryEmail
                    ?.value
            );
    }
}

function updatePasswordSubmitAvailability() {
    const button =
        recoveryElements
            .updatePasswordButton;

    if (!button) {
        return;
    }

    const password =
        recoveryElements
            .newPassword
            ?.value || "";

    const confirmation =
        recoveryElements
            .confirmNewPassword
            ?.value || "";

    const validation =
        validatePassword(password);

    if (
        !recoveryState
            .updatingPassword
    ) {
        button.disabled =
            !(
                validation.valid &&
                password ===
                    confirmation
            );
    }
}


/* =========================================================
   107. LOGIN REAL-TIME EVENTS
========================================================= */

function bindLoginRealtimeValidation() {
    const emailInput =
        authElements.loginEmail;

    const passwordInput =
        authElements.loginPassword;

    emailInput?.addEventListener(
        "blur",
        () => {
            authUIState.loginEmailTouched =
                true;

            validateLoginEmailRealtime({
                force: true
            });

            updateLoginSubmitAvailability();
        }
    );

    emailInput?.addEventListener(
        "input",
        () => {
            if (
                authUIState.loginEmailTouched
            ) {
                validateLoginEmailRealtime({
                    force: true
                });
            }

            updateLoginSubmitAvailability();
        }
    );

    passwordInput?.addEventListener(
        "blur",
        () => {
            authUIState.loginPasswordTouched =
                true;

            validateLoginPasswordRealtime({
                force: true
            });

            updateLoginSubmitAvailability();
        }
    );

    passwordInput?.addEventListener(
        "input",
        () => {
            if (
                authUIState.loginPasswordTouched
            ) {
                validateLoginPasswordRealtime({
                    force: true
                });
            }

            updateLoginSubmitAvailability();
        }
    );
}


/* =========================================================
   108. SIGNUP REAL-TIME EVENTS
========================================================= */

function bindSignupRealtimeValidation() {
    const fullNameInput =
        authElements.signupFullName;

    const emailInput =
        authElements.signupEmail;

    const passwordInput =
        authElements.signupPassword;

    const confirmationInput =
        authElements.signupConfirmPassword;

    fullNameInput?.addEventListener(
        "blur",
        () => {
            validateSignupNameRealtime({
                force: true
            });

            updateSignupSubmitAvailability();
        }
    );

    fullNameInput?.addEventListener(
        "input",
        updateSignupSubmitAvailability
    );

    emailInput?.addEventListener(
        "blur",
        () => {
            validateSignupEmailRealtime({
                force: true
            });

            updateSignupSubmitAvailability();
        }
    );

    emailInput?.addEventListener(
        "input",
        () => {
            validateSignupEmailRealtime();

            updateSignupSubmitAvailability();
        }
    );

    passwordInput?.addEventListener(
        "focus",
        () => {
            authUIState.signupPasswordTouched =
                true;
        }
    );

    passwordInput?.addEventListener(
        "input",
        () => {
            updateSignupPasswordStrength();

            if (
                authUIState
                    .signupPasswordTouched
            ) {
                validateSignupPasswordRealtime();
            }

            if (
                confirmationInput?.value
            ) {
                validateSignupConfirmPasswordRealtime({
                    force: true
                });
            }

            updateSignupSubmitAvailability();
        }
    );

    passwordInput?.addEventListener(
        "blur",
        () => {
            authUIState.signupPasswordTouched =
                true;

            validateSignupPasswordRealtime({
                force: true
            });

            updateSignupSubmitAvailability();
        }
    );

    confirmationInput?.addEventListener(
        "focus",
        () => {
            authUIState
                .signupConfirmPasswordTouched =
                true;
        }
    );

    confirmationInput?.addEventListener(
        "input",
        () => {
            validateSignupConfirmPasswordRealtime();

            updateSignupSubmitAvailability();
        }
    );

    confirmationInput?.addEventListener(
        "blur",
        () => {
            authUIState
                .signupConfirmPasswordTouched =
                true;

            validateSignupConfirmPasswordRealtime({
                force: true
            });

            updateSignupSubmitAvailability();
        }
    );

    authElements.acceptTerms
        ?.addEventListener(
            "change",
            () => {
                hideAuthStatus(
                    "signupStatus"
                );

                updateSignupSubmitAvailability();
            }
        );
}


/* =========================================================
   109. RECOVERY REAL-TIME EVENTS
========================================================= */

function bindRecoveryRealtimeValidation() {
    const emailInput =
        recoveryElements.recoveryEmail;

    const passwordInput =
        recoveryElements.newPassword;

    const confirmationInput =
        recoveryElements
            .confirmNewPassword;

    emailInput?.addEventListener(
        "focus",
        () => {
            authUIState.recoveryEmailTouched =
                true;
        }
    );

    emailInput?.addEventListener(
        "input",
        () => {
            if (
                authUIState
                    .recoveryEmailTouched
            ) {
                validateRecoveryEmailRealtime();
            }

            updateRecoverySubmitAvailability();
        }
    );

    emailInput?.addEventListener(
        "blur",
        () => {
            authUIState.recoveryEmailTouched =
                true;

            validateRecoveryEmailRealtime({
                force: true
            });

            updateRecoverySubmitAvailability();
        }
    );

    passwordInput?.addEventListener(
        "focus",
        () => {
            authUIState.newPasswordTouched =
                true;
        }
    );

    passwordInput?.addEventListener(
        "input",
        () => {
            updateNewPasswordStrength();

            validateNewPasswordRealtime();

            if (
                confirmationInput?.value
            ) {
                validateConfirmNewPasswordRealtime({
                    force: true
                });
            }

            updatePasswordSubmitAvailability();
        }
    );

    passwordInput?.addEventListener(
        "blur",
        () => {
            authUIState.newPasswordTouched =
                true;

            validateNewPasswordRealtime({
                force: true
            });

            updatePasswordSubmitAvailability();
        }
    );

    confirmationInput?.addEventListener(
        "focus",
        () => {
            authUIState
                .confirmNewPasswordTouched =
                true;
        }
    );

    confirmationInput?.addEventListener(
        "input",
        () => {
            validateConfirmNewPasswordRealtime();

            updatePasswordSubmitAvailability();
        }
    );

    confirmationInput?.addEventListener(
        "blur",
        () => {
            authUIState
                .confirmNewPasswordTouched =
                true;

            validateConfirmNewPasswordRealtime({
                force: true
            });

            updatePasswordSubmitAvailability();
        }
    );
}


/* =========================================================
   110. ENTER KEY BEHAVIOUR
========================================================= */

function bindAuthKeyboardBehaviour() {
    document
        .querySelectorAll(
            ".auth-form input"
        )
        .forEach(input => {
            input.addEventListener(
                "keydown",
                event => {
                    if (
                        event.key !==
                        "Enter"
                    ) {
                        return;
                    }

                    const form =
                        input.closest(
                            "form"
                        );

                    if (!form) {
                        return;
                    }

                    const submitButton =
                        form.querySelector(
                            '[type="submit"]'
                        );

                    if (
                        submitButton?.disabled
                    ) {
                        return;
                    }

                    event.preventDefault();

                    form.requestSubmit();
                }
            );
        });
}


/* =========================================================
   111. ESCAPE KEY BEHAVIOUR
========================================================= */

function bindPasswordEscapeBehaviour() {
    document.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            PASSWORD_TOGGLE_CONFIG.forEach(
                configuration => {
                    const input =
                        document.getElementById(
                            configuration.inputId
                        );

                    const button =
                        document.getElementById(
                            configuration.buttonId
                        );

                    if (
                        !input ||
                        !button ||
                        input.type !== "text"
                    ) {
                        return;
                    }

                    setPasswordVisibility({
                        button,
                        input,
                        visible: false,
                        visibleLabel:
                            configuration.visibleLabel,
                        hiddenLabel:
                            configuration.hiddenLabel
                    });
                }
            );
        }
    );
}


/* =========================================================
   112. PASTE NORMALIZATION
========================================================= */

function bindEmailPasteNormalization() {
    [
        authElements.loginEmail,
        authElements.signupEmail,
        recoveryElements.recoveryEmail
    ].forEach(input => {
        input?.addEventListener(
            "paste",
            event => {
                const pastedText =
                    event.clipboardData
                        ?.getData("text");

                if (!pastedText) {
                    return;
                }

                event.preventDefault();

                input.value =
                    normalizeEmail(
                        pastedText
                    );

                input.dispatchEvent(
                    new Event("input", {
                        bubbles: true
                    })
                );
            }
        );
    });
}


/* =========================================================
   113. NAME INPUT NORMALIZATION
========================================================= */

function bindNameInputNormalization() {
    const input =
        authElements.signupFullName;

    input?.addEventListener(
        "blur",
        () => {
            input.value =
                normalizeText(
                    input.value
                );
        }
    );
}


/* =========================================================
   114. PASSWORD AUTOFILL SUPPORT
========================================================= */

function detectAutofilledFields() {
    window.setTimeout(() => {
        updateLoginSubmitAvailability();
        updateSignupPasswordStrength();
        updateSignupSubmitAvailability();
        updateRecoverySubmitAvailability();
        updateNewPasswordStrength();
        updatePasswordSubmitAvailability();
    }, 350);

    window.setTimeout(() => {
        updateLoginSubmitAvailability();
        updateSignupSubmitAvailability();
        updateRecoverySubmitAvailability();
        updatePasswordSubmitAvailability();
    }, 1200);
}


/* =========================================================
   115. SUBMIT VALIDATION BRIDGE
========================================================= */

function bindSubmitValidationBridge() {
    authElements.loginForm
        ?.addEventListener(
            "submit",
            event => {
                const emailValid =
                    validateLoginEmailRealtime({
                        force: true
                    });

                const passwordValid =
                    validateLoginPasswordRealtime({
                        force: true
                    });

                if (
                    !emailValid ||
                    !passwordValid
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },
            {
                capture: true
            }
        );

    authElements.signupForm
        ?.addEventListener(
            "submit",
            event => {
                const nameValid =
                    validateSignupNameRealtime({
                        force: true
                    });

                const emailValid =
                    validateSignupEmailRealtime({
                        force: true
                    });

                const passwordValid =
                    validateSignupPasswordRealtime({
                        force: true
                    });

                const confirmationValid =
                    validateSignupConfirmPasswordRealtime({
                        force: true
                    });

                if (
                    !nameValid ||
                    !emailValid ||
                    !passwordValid ||
                    !confirmationValid ||
                    !authElements.acceptTerms
                        ?.checked
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },
            {
                capture: true
            }
        );

    recoveryElements
        .forgotPasswordForm
        ?.addEventListener(
            "submit",
            event => {
                const valid =
                    validateRecoveryEmailRealtime({
                        force: true
                    });

                if (!valid) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },
            {
                capture: true
            }
        );

    recoveryElements
        .updatePasswordForm
        ?.addEventListener(
            "submit",
            event => {
                const passwordValid =
                    validateNewPasswordRealtime({
                        force: true
                    });

                const confirmationValid =
                    validateConfirmNewPasswordRealtime({
                        force: true
                    });

                if (
                    !passwordValid ||
                    !confirmationValid
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },
            {
                capture: true
            }
        );
}


/* =========================================================
   116. INITIAL BUTTON STATES
========================================================= */

function initializeAuthButtonStates() {
    updateLoginSubmitAvailability();
    updateSignupPasswordStrength();
    updateSignupSubmitAvailability();

    updateRecoverySubmitAvailability();
    updateNewPasswordStrength();
    updatePasswordSubmitAvailability();
}


/* =========================================================
   117. PART 4 EVENT BINDINGS
========================================================= */

function bindAuthUIEnhancementEvents() {
    bindPasswordVisibilityButtons();

    bindLoginRealtimeValidation();
    bindSignupRealtimeValidation();
    bindRecoveryRealtimeValidation();

    bindAuthKeyboardBehaviour();
    bindPasswordEscapeBehaviour();

    bindEmailPasteNormalization();
    bindNameInputNormalization();

    bindSubmitValidationBridge();
}


/* =========================================================
   118. PART 4 INITIALIZATION
========================================================= */

function initializeAuthUIEnhancements() {
    if (authUIState.initialized) {
        return;
    }

    authUIState.initialized = true;

    /*
       Part 1 and Part 2 cache their elements separately.
       Re-cache here so this section also works if script
       execution order changes.
    */

    cacheAuthElements();
    cacheRecoveryElements();

    bindAuthUIEnhancementEvents();

    initializeAuthButtonStates();
    detectAutofilledFields();

    document.documentElement
        .classList.add(
            "nexxorra-auth-ui-ready"
        );
}


/* =========================================================
   119. PUBLIC PART 4 EXPORTS
========================================================= */

export {
    updateSignupPasswordStrength,

    validateLoginEmailRealtime,
    validateLoginPasswordRealtime,

    validateSignupNameRealtime,
    validateSignupEmailRealtime,
    validateSignupPasswordRealtime,
    validateSignupConfirmPasswordRealtime,

    validateRecoveryEmailRealtime,
    validateNewPasswordRealtime,
    validateConfirmNewPasswordRealtime,

    updateLoginSubmitAvailability,
    updateSignupSubmitAvailability,
    updateRecoverySubmitAvailability,
    updatePasswordSubmitAvailability
};


/* =========================================================
   120. START PART 4
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeAuthUIEnhancements,
        {
            once: true
        }
    );
} else {
    initializeAuthUIEnhancements();
}
/* =========================================================
   nexxorra AI — AUTHENTICATION CONTROLLER
   File: auth.js
   Part 5: Final Error Handling, Toasts, Cleanup,
           Session Utilities and Stable Initialization
========================================================= */


/* =========================================================
   121. FINAL AUTH STATE
========================================================= */

const finalAuthState = {
    initialized: false,
    configurationChecked: false,
    configurationValid: true,

    online: navigator.onLine,

    lastError: null,

    cleanupFunctions: [],

    initializationPromise: null
};


/* =========================================================
   122. AUTH ERROR NORMALIZATION
========================================================= */

function normalizeAuthError(error) {
    if (!error) {
        return {
            name: "Error",
            code: "unknown_auth_error",
            message:
                "An unknown authentication error occurred.",
            status: 0,
            retryable: false,
            originalError: null
        };
    }

    const originalMessage =
        String(
            error.message || ""
        ).trim();

    const normalizedMessage =
        originalMessage.toLowerCase();

    const originalCode =
        String(
            error.code || ""
        ).trim();

    const normalizedCode =
        originalCode.toLowerCase();

    let code =
        originalCode ||
        "authentication_error";

    let message =
        originalMessage ||
        "Authentication failed.";

    let status =
        Number(
            error.status ||
            error.statusCode
        ) || 0;

    let retryable = false;

    if (
        normalizedMessage.includes(
            "invalid login credentials"
        )
    ) {
        code = "invalid_credentials";
        message =
            "The email or password is incorrect.";
        status = 401;
    } else if (
        normalizedMessage.includes(
            "email not confirmed"
        )
    ) {
        code = "email_not_confirmed";
        message =
            "Confirm your email before logging in.";
        status = 403;
    } else if (
        normalizedMessage.includes(
            "user already registered"
        ) ||
        normalizedMessage.includes(
            "already been registered"
        )
    ) {
        code = "user_already_registered";
        message =
            "An account already exists with this email.";
        status = 409;
    } else if (
        normalizedMessage.includes(
            "signup is disabled"
        )
    ) {
        code = "signup_disabled";
        message =
            "New account creation is currently disabled.";
        status = 403;
    } else if (
        normalizedMessage.includes(
            "password should be"
        ) ||
        normalizedCode.includes(
            "weak_password"
        )
    ) {
        code = "weak_password";
        message =
            "Choose a stronger password.";
        status = 400;
    } else if (
        normalizedMessage.includes(
            "same password"
        )
    ) {
        code = "same_password";
        message =
            "Your new password must be different from the previous password.";
        status = 400;
    } else if (
        normalizedMessage.includes(
            "expired"
        ) &&
        normalizedMessage.includes(
            "token"
        )
    ) {
        code = "expired_token";
        message =
            "This authentication link has expired. Request a new one.";
        status = 401;
    } else if (
        normalizedMessage.includes(
            "invalid token"
        ) ||
        normalizedMessage.includes(
            "invalid claim"
        )
    ) {
        code = "invalid_token";
        message =
            "This authentication link is invalid or has already been used.";
        status = 401;
    } else if (
        normalizedMessage.includes(
            "rate limit"
        ) ||
        normalizedMessage.includes(
            "too many requests"
        ) ||
        normalizedCode.includes(
            "rate_limit"
        )
    ) {
        code = "rate_limit";
        message =
            "Too many attempts were made. Wait briefly and try again.";
        status = 429;
        retryable = true;
    } else if (
        normalizedMessage.includes(
            "network"
        ) ||
        normalizedMessage.includes(
            "fetch"
        ) ||
        normalizedMessage.includes(
            "failed to fetch"
        )
    ) {
        code = "network_error";
        message =
            "nexxorra could not reach the authentication server.";
        retryable = true;
    } else if (
        normalizedMessage.includes(
            "provider is not enabled"
        ) ||
        normalizedMessage.includes(
            "unsupported provider"
        )
    ) {
        code = "provider_not_enabled";
        message =
            "Google login is not enabled in Supabase.";
        status = 400;
    } else if (
        normalizedMessage.includes(
            "redirect"
        ) &&
        normalizedMessage.includes(
            "not allowed"
        )
    ) {
        code = "redirect_not_allowed";
        message =
            "This redirect URL is not allowed in Supabase.";
        status = 400;
    } else if (
        status >= 500
    ) {
        code = "auth_server_error";
        message =
            "The authentication service is temporarily unavailable.";
        retryable = true;
    }

    return {
        name:
            error.name ||
            "nexxorraAuthError",

        code,

        message,

        status,

        retryable,

        originalError:
            error
    };
}


/* =========================================================
   123. AUTH ERROR SERIALIZATION
========================================================= */

export function serializeAuthError(
    error
) {
    const normalized =
        normalizeAuthError(
            error
        );

    return {
        name:
            normalized.name,

        code:
            normalized.code,

        message:
            normalized.message,

        status:
            normalized.status,

        retryable:
            normalized.retryable
    };
}


/* =========================================================
   124. FINAL READABLE AUTH MESSAGE
========================================================= */

export function getFinalAuthErrorMessage(
    error
) {
    return normalizeAuthError(
        error
    ).message;
}


/* =========================================================
   125. AUTH TOAST FACTORY
========================================================= */

export function showAuthToast({
    title = "nexxorra",
    message = "",
    type = "info",
    duration = 3600
} = {}) {
    const toastRegion =
        document.getElementById(
            "toastRegion"
        );

    if (!toastRegion) {
        return null;
    }

    const toast =
        document.createElement(
            "article"
        );

    toast.className =
        `toast toast-${type}`;

    toast.setAttribute(
        "role",
        type === "error"
            ? "alert"
            : "status"
    );

    const iconWrapper =
        document.createElement(
            "span"
        );

    iconWrapper.className =
        "toast-icon";

    const icon =
        document.createElement("i");

    const iconClasses = {
        success:
            "fa-solid fa-check",

        error:
            "fa-solid fa-triangle-exclamation",

        warning:
            "fa-solid fa-circle-exclamation",

        info:
            "fa-solid fa-circle-info"
    };

    icon.className =
        iconClasses[type] ||
        iconClasses.info;

    icon.setAttribute(
        "aria-hidden",
        "true"
    );

    iconWrapper.appendChild(icon);

    const content =
        document.createElement(
            "div"
        );

    content.className =
        "toast-content";

    const toastTitle =
        document.createElement(
            "strong"
        );

    toastTitle.textContent =
        title;

    const toastMessage =
        document.createElement(
            "span"
        );

    toastMessage.textContent =
        message;

    content.appendChild(
        toastTitle
    );

    if (message) {
        content.appendChild(
            toastMessage
        );
    }

    const closeButton =
        document.createElement(
            "button"
        );

    closeButton.className =
        "toast-close";

    closeButton.type =
        "button";

    closeButton.setAttribute(
        "aria-label",
        "Close notification"
    );

    const closeIcon =
        document.createElement("i");

    closeIcon.className =
        "fa-solid fa-xmark";

    closeIcon.setAttribute(
        "aria-hidden",
        "true"
    );

    closeButton.appendChild(
        closeIcon
    );

    toast.append(
        iconWrapper,
        content,
        closeButton
    );

    toastRegion.appendChild(
        toast
    );

    let timeoutId = null;

    function removeToast() {
        if (!toast.isConnected) {
            return;
        }

        toast.classList.add(
            "toast-leaving"
        );

        window.setTimeout(
            () => {
                toast.remove();
            },
            180
        );
    }

    closeButton.addEventListener(
        "click",
        removeToast
    );

    if (duration > 0) {
        timeoutId =
            window.setTimeout(
                removeToast,
                duration
            );
    }

    toast.addEventListener(
        "mouseenter",
        () => {
            if (timeoutId) {
                window.clearTimeout(
                    timeoutId
                );
            }
        }
    );

    toast.addEventListener(
        "mouseleave",
        () => {
            if (duration > 0) {
                timeoutId =
                    window.setTimeout(
                        removeToast,
                        1200
                    );
            }
        }
    );

    return toast;
}


/* =========================================================
   126. AUTH ERROR DISPLAY
========================================================= */

export function displayAuthError(
    error,
    {
        title = "Authentication failed",
        statusConfiguration = null,
        toast = true
    } = {}
) {
    const normalized =
        normalizeAuthError(
            error
        );

    finalAuthState.lastError =
        normalized;

    console.error(
        "[nexxorra Auth]",
        normalized.code,
        error
    );

    if (
        statusConfiguration &&
        document.getElementById(
            statusConfiguration
                .containerId
        )
    ) {
        showAuthStatus({
            ...statusConfiguration,

            title,

            message:
                normalized.message,

            type: "error"
        });

        return normalized;
    }

    if (toast) {
        showAuthToast({
            title,

            message:
                normalized.message,

            type:
                normalized.retryable
                    ? "warning"
                    : "error",

            duration: 4500
        });
    }

    return normalized;
}


/* =========================================================
   127. SUCCESS DISPLAY
========================================================= */

export function displayAuthSuccess({
    title,
    message,
    statusConfiguration = null,
    toast = true
}) {
    if (
        statusConfiguration &&
        document.getElementById(
            statusConfiguration
                .containerId
        )
    ) {
        showAuthStatus({
            ...statusConfiguration,

            title,

            message,

            type: "success"
        });

        return;
    }

    if (toast) {
        showAuthToast({
            title,

            message,

            type: "success"
        });
    }
}


/* =========================================================
   128. CONFIGURATION VALIDATION
========================================================= */

function validateAuthConfiguration() {
    if (
        finalAuthState
            .configurationChecked
    ) {
        return finalAuthState
            .configurationValid;
    }

    finalAuthState
        .configurationChecked = true;

    const missingValues = [];

    if (
        !SUPABASE_CONFIG?.url ||
        String(
            SUPABASE_CONFIG.url
        ).includes(
            "YOUR_SUPABASE"
        )
    ) {
        missingValues.push(
            "Supabase project URL"
        );
    }

    if (
        !SUPABASE_CONFIG
            ?.anonKey ||
        String(
            SUPABASE_CONFIG.anonKey
        ).includes(
            "YOUR_SUPABASE"
        )
    ) {
        missingValues.push(
            "Supabase public key"
        );
    }

    finalAuthState.configurationValid =
        missingValues.length === 0;

    if (
        !finalAuthState
            .configurationValid
    ) {
        showAuthToast({
            title:
                "Supabase configuration missing",

            message:
                `Add ${missingValues.join(
                    " and "
                )} inside config.js.`,

            type: "error",

            duration: 0
        });
    }

    return finalAuthState
        .configurationValid;
}


/* =========================================================
   129. AUTH BUTTON RECOVERY
========================================================= */

function resetAuthenticationButtons() {
    const buttons = [
        authElements
            .loginSubmitButton,

        authElements
            .signupSubmitButton,

        authElements
            .googleLoginButton,

        authElements
            .googleSignupButton,

        recoveryElements
            .sendResetLinkButton,

        recoveryElements
            .resendResetLinkButton,

        recoveryElements
            .updatePasswordButton
    ];

    buttons.forEach(button => {
        if (!button) {
            return;
        }

        button.classList.remove(
            "is-loading"
        );

        const loader =
            button.querySelector(
                ".auth-submit-loader"
            );

        if (loader) {
            loader.hidden = true;
        }
    });

    authState.loginInProgress =
        false;

    authState.signupInProgress =
        false;

    authState.googleOAuthInProgress =
        false;

    recoveryState.sendingResetEmail =
        false;

    recoveryState.updatingPassword =
        false;

    initializeAuthButtonStates();
}


/* =========================================================
   130. ONLINE STATUS
========================================================= */

function handleAuthOnline() {
    finalAuthState.online = true;

    showAuthToast({
        title: "Back online",

        message:
            "Authentication services are available again.",

        type: "success",

        duration: 2200
    });

    resetAuthenticationButtons();
}

function handleAuthOffline() {
    finalAuthState.online = false;

    resetAuthenticationButtons();

    showAuthToast({
        title: "You are offline",

        message:
            "Login and account changes require an internet connection.",

        type: "warning",

        duration: 0
    });
}

export function isAuthenticationOnline() {
    return finalAuthState.online;
}


/* =========================================================
   131. REQUIRE ONLINE AUTH
========================================================= */

export function requireAuthenticationConnection() {
    if (
        finalAuthState.online
    ) {
        return true;
    }

    throw createAuthError(
        "You are offline. Check your connection and try again.",
        "offline"
    );
}


/* =========================================================
   132. REMOVE AUTH QUERY ERRORS
========================================================= */

function cleanAuthErrorParameters() {
    const url =
        new URL(
            window.location.href
        );

    const removableParameters = [
        "error",
        "error_code",
        "error_description"
    ];

    let changed = false;

    removableParameters.forEach(
        parameter => {
            if (
                url.searchParams.has(
                    parameter
                )
            ) {
                url.searchParams.delete(
                    parameter
                );

                changed = true;
            }
        }
    );

    if (!changed) {
        return;
    }

    const query =
        url.searchParams.toString();

    const cleanURL =
        `${url.pathname}${
            query
                ? `?${query}`
                : ""
        }`;

    window.history.replaceState(
        {},
        document.title,
        cleanURL
    );
}


/* =========================================================
   133. HANDLE URL AUTH ERRORS
========================================================= */

function handleAuthenticationURLError() {
    const url =
        new URL(
            window.location.href
        );

    const error =
        url.searchParams.get(
            "error_description"
        ) ||
        url.searchParams.get(
            "error"
        );

    if (!error) {
        return;
    }

    const decodedError =
        decodeURIComponent(
            error.replace(/\+/g, " ")
        );

    displayAuthError(
        createAuthError(
            decodedError,
            "url_auth_error"
        ),
        {
            title:
                "Authentication link failed"
        }
    );

    cleanAuthErrorParameters();
}


/* =========================================================
   134. SESSION RESTORE RETRY
========================================================= */

export async function restoreSessionWithRetry({
    attempts = 2,
    delay = 450
} = {}) {
    let latestError = null;

    for (
        let attempt = 1;
        attempt <= attempts;
        attempt += 1
    ) {
        try {
            const result =
                await getSupabaseSession();

            const session =
                result?.session ||
                null;

            authState.session =
                session;

            authState.user =
                session?.user ||
                null;

            if (session?.user) {
                await Promise.allSettled([
                    ensureProfile(),
                    ensureUserSettings()
                ]);
            }

            return {
                session,
                user:
                    session?.user ||
                    null
            };
        } catch (error) {
            latestError = error;

            if (
                attempt >= attempts
            ) {
                break;
            }

            await new Promise(
                resolve => {
                    window.setTimeout(
                        resolve,
                        delay * attempt
                    );
                }
            );
        }
    }

    throw latestError;
}


/* =========================================================
   135. SAFE AUTH ACTION
========================================================= */

export async function runAuthAction(
    action,
    {
        requireOnline = true,
        errorTitle =
            "Authentication failed",
        statusConfiguration = null
    } = {}
) {
    if (
        typeof action !==
        "function"
    ) {
        throw createAuthError(
            "Authentication action is invalid.",
            "invalid_auth_action"
        );
    }

    try {
        if (requireOnline) {
            requireAuthenticationConnection();
        }

        return await action();
    } catch (error) {
        displayAuthError(
            error,
            {
                title:
                    errorTitle,

                statusConfiguration
            }
        );

        throw error;
    }
}


/* =========================================================
   136. PREVENT DUPLICATE FORM SUBMISSION
========================================================= */

function lockAuthForm(
    form,
    locked
) {
    if (!form) {
        return;
    }

    form.dataset.submitting =
        String(locked);

    form.querySelectorAll(
        "input, button, select, textarea"
    ).forEach(element => {
        if (
            element.matches(
                ".password-toggle-button"
            )
        ) {
            return;
        }

        if (locked) {
            element.dataset
                .wasDisabled =
                String(
                    element.disabled
                );

            element.disabled = true;
        } else {
            const wasDisabled =
                element.dataset
                    .wasDisabled ===
                "true";

            element.disabled =
                wasDisabled;

            delete element.dataset
                .wasDisabled;
        }
    });
}


/* =========================================================
   137. FORM SUBMIT LOCK BRIDGE
========================================================= */

function bindFormSubmissionLocks() {
    const forms = [
        authElements.loginForm,
        authElements.signupForm,
        recoveryElements
            .forgotPasswordForm,
        recoveryElements
            .updatePasswordForm
    ];

    forms.forEach(form => {
        if (!form) {
            return;
        }

        form.addEventListener(
            "submit",
            event => {
                if (
                    form.dataset
                        .submitting ===
                    "true"
                ) {
                    event.preventDefault();
                }
            },
            {
                capture: true
            }
        );
    });
}


/* =========================================================
   138. FOCUS FIRST INVALID FIELD
========================================================= */

function focusFirstInvalidField(
    form
) {
    if (!form) {
        return;
    }

    const invalidInput =
        form.querySelector(
            '[aria-invalid="true"]'
        );

    invalidInput?.focus();
}


/* =========================================================
   139. INVALID FORM EVENT
========================================================= */

function bindInvalidFormHandling() {
    document
        .querySelectorAll(
            ".auth-form"
        )
        .forEach(form => {
            form.addEventListener(
                "submit",
                () => {
                    window.requestAnimationFrame(
                        () => {
                            focusFirstInvalidField(
                                form
                            );
                        }
                    );
                }
            );
        });
}


/* =========================================================
   140. AUTH SESSION DEBUG EVENT
========================================================= */

function dispatchAuthReadyEvent() {
    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:auth-ready",
            {
                detail: {
                    user:
                        authState.user,

                    session:
                        authState.session,

                    authenticated:
                        Boolean(
                            authState.user &&
                            authState.session
                        ),

                    page:
                        authState.currentPage,

                    recoveryMode:
                        authState.recoveryMode
                }
            }
        )
    );
}


/* =========================================================
   141. FINAL ACCOUNT UI SYNC
========================================================= */

function synchronizeFinalAccountUI() {
    updateAccountElements(
        authState.user
    );

    document.documentElement
        .classList.toggle(
            "nexxorra-user-authenticated",
            Boolean(
                authState.user
            )
        );

    document.documentElement
        .classList.toggle(
            "nexxorra-user-guest",
            !authState.user
        );
}


/* =========================================================
   142. GLOBAL AUTH EVENT HANDLERS
========================================================= */

function bindFinalAuthenticationEvents() {
    window.addEventListener(
        "online",
        handleAuthOnline
    );

    window.addEventListener(
        "offline",
        handleAuthOffline
    );

    document.addEventListener(
        "nexxorra:auth-session",
        event => {
            authState.session =
                event.detail
                    ?.session ||
                null;

            authState.user =
                event.detail
                    ?.user ||
                authState.session
                    ?.user ||
                null;

            synchronizeFinalAccountUI();
        }
    );

    document.addEventListener(
        "nexxorra:logout",
        () => {
            authState.session = null;
            authState.user = null;

            synchronizeFinalAccountUI();
        }
    );

    window.addEventListener(
        "unhandledrejection",
        event => {
            const error =
                event.reason;

            const message =
                String(
                    error?.message ||
                    ""
                ).toLowerCase();

            const appearsAuthRelated =
                message.includes(
                    "auth"
                ) ||
                message.includes(
                    "session"
                ) ||
                message.includes(
                    "supabase"
                ) ||
                error?.name ===
                    "nexxorraAuthError";

            if (!appearsAuthRelated) {
                return;
            }

            console.error(
                "Unhandled authentication rejection:",
                error
            );
        }
    );
}


/* =========================================================
   143. FINAL CLEANUP REGISTRATION
========================================================= */

function registerAuthCleanup(
    cleanupFunction
) {
    if (
        typeof cleanupFunction ===
        "function"
    ) {
        finalAuthState
            .cleanupFunctions
            .push(
                cleanupFunction
            );
    }
}

function runAuthCleanup() {
    finalAuthState
        .cleanupFunctions
        .forEach(
            cleanupFunction => {
                try {
                    cleanupFunction();
                } catch (error) {
                    console.warn(
                        "Authentication cleanup failed:",
                        error
                    );
                }
            }
        );

    finalAuthState
        .cleanupFunctions = [];

    window.clearInterval(
        sessionValidationTimer
    );

    window.clearInterval(
        recoveryState
            .resendTimerId
    );
}


/* =========================================================
   144. AUTH PAGE INITIAL STATE
========================================================= */

function applyAuthenticationPageState() {
    document.body.dataset.authPage =
        authState.currentPage;

    document.documentElement
        .classList.toggle(
            "nexxorra-auth-online",
            finalAuthState.online
        );

    document.documentElement
        .classList.toggle(
            "nexxorra-auth-offline",
            !finalAuthState.online
        );

    if (
        authState.currentPage ===
        ROUTES.login
    ) {
        authElements.loginEmail
            ?.focus();
    }

    if (
        authState.currentPage ===
        ROUTES.signup
    ) {
        authElements.signupFullName
            ?.focus();
    }
}


/* =========================================================
   145. FINAL SESSION RESOLUTION
========================================================= */

async function resolveFinalAuthenticationSession() {
    try {
        const {
            session,
            user
        } =
            await restoreSessionWithRetry({
                attempts: 2
            });

        authState.session =
            session;

        authState.user =
            user;

        synchronizeFinalAccountUI();

        return {
            session,
            user
        };
    } catch (error) {
        console.warn(
            "Final session resolution failed:",
            error
        );

        authState.session = null;
        authState.user = null;

        synchronizeFinalAccountUI();

        return {
            session: null,
            user: null
        };
    }
}


/* =========================================================
   146. FINAL AUTH INITIALIZATION
========================================================= */

async function initializeFinalAuthenticationLayer() {
    if (
        finalAuthState.initialized
    ) {
        return finalAuthState
            .initializationPromise;
    }

    finalAuthState.initialized =
        true;

    finalAuthState.initializationPromise =
        (async () => {
            cacheAuthElements();
            cacheRecoveryElements();

            if (
                !validateAuthConfiguration()
            ) {
                hidePageLoader();

                document.documentElement
                    .classList.add(
                        "nexxorra-auth-config-error"
                    );

                return;
            }

            handleAuthenticationURLError();

            bindFinalAuthenticationEvents();
            bindFormSubmissionLocks();
            bindInvalidFormHandling();

            applyAuthenticationPageState();

            const {
                session
            } =
                await resolveFinalAuthenticationSession();

            if (
                isCurrentPageProtected() &&
                !session
            ) {
                preserveCurrentProtectedPage();

                redirectToPage(
                    ROUTES.login
                );

                return;
            }

            if (
                [
                    ROUTES.login,
                    ROUTES.signup
                ].includes(
                    authState.currentPage
                ) &&
                session &&
                !authState.recoveryMode
            ) {
                handleAuthenticatedAuthPage(
                    "INITIAL_SESSION"
                );

                return;
            }

            synchronizeFinalAccountUI();
            resetAuthenticationButtons();

            hidePageLoader();

            dispatchAuthReadyEvent();

            document.documentElement
                .classList.add(
                    "nexxorra-auth-ready"
                );
        })();

    return finalAuthState
        .initializationPromise;
}


/* =========================================================
   147. PAGE CLEANUP
========================================================= */

window.addEventListener(
    "pagehide",
    runAuthCleanup
);


/* =========================================================
   148. FINAL PUBLIC AUTH API
========================================================= */

const nexxorraAuth =
    Object.freeze({
        login:
            loginWithEmail,

        signup:
            signupWithEmail,

        google:
            continueWithGoogle,

        logout:
            logoutUser,

        session:
            getCurrentSession,

        accessToken:
            getAccessToken,

        user:
            getAuthenticatedUser,

        isAuthenticated:
            isUserAuthenticated,

        require:
            requireAuthentication,

        refresh:
            refreshAuthSession,

        resetPassword:
            sendPasswordResetEmail,

        updatePassword:
            updateAccountPassword,

        protect:
            guardProtectedRoute,

        showToast:
            showAuthToast,

        normalizeError:
            normalizeAuthError,

        serializeError:
            serializeAuthError
    });


/* =========================================================
   149. DEFAULT EXPORT
========================================================= */

export default nexxorraAuth;


/* =========================================================
   150. START FINAL AUTH LAYER
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeFinalAuthenticationLayer,
        {
            once: true
        }
    );
} else {
    initializeFinalAuthenticationLayer();
}