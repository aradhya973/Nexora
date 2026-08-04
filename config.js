/* =========================================================
   nexxorra AI — PUBLIC FRONTEND CONFIGURATION
   File: config.js
========================================================= */


/* =========================================================
   1. ENVIRONMENT DETECTION
========================================================= */

function detectEnvironment() {
    const hostname =
        window.location.hostname.toLowerCase();

    const isLocalhost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";

    if (isLocalhost) {
        return "development";
    }

    if (
        hostname.includes("netlify.app") ||
        hostname.includes("vercel.app")
    ) {
        return "preview";
    }

    return "production";
}

const CURRENT_ENVIRONMENT =
    detectEnvironment();


/* =========================================================
   2. PUBLIC SUPABASE CONFIGURATION
========================================================= */

const SUPABASE_CONFIG = Object.freeze({
    url: "https://lqpvlpebtfiyfldvqvdx.supabase.co",

    anonKey: "sb_publishable_n8gl-tZmJT169LfoICxeYg_kRfa_E1_",

    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,

        flowType: "pkce",

        storageKey:
            "nexxorra-auth-session"
    }
});


/* =========================================================
   3. APPLICATION ROUTES
========================================================= */

const ROUTES = Object.freeze({
    home: "index.html",

    about: "about.html",
    features: "features.html",
    pricing: "pricing.html",
    contact: "contact.html",

    login: "login.html",
    signup: "signup.html",

    forgotPassword:
        "forgot-password.html",

    profile: "profile.html",
    history: "history.html",
    settings: "settings.html",

    privacy: "privacy.html",
    terms: "terms.html",
    help: "help.html"
});


/* =========================================================
   4. PROTECTED ROUTES
========================================================= */

const PROTECTED_ROUTES = Object.freeze([
    ROUTES.profile,
    ROUTES.history,
    ROUTES.settings
]);


/* =========================================================
   5. API CONFIGURATION
========================================================= */

const API_CONFIG = Object.freeze({
    chatEndpoint:
        "/.netlify/functions/chat",

    timeout: 90000,

    streaming: false,

    retryAttempts: 2,

    requestHeaders: {
        client:
            "nexxorra-web",

        version:
            "1.0.0"
    }
});


/* =========================================================
   6. AUTHENTICATION CONFIGURATION
========================================================= */

const AUTH_CONFIG = Object.freeze({
    redirectAfterLogin:
        ROUTES.home,

    redirectAfterSignup:
        ROUTES.home,

    redirectAfterLogout:
        ROUTES.home,

    redirectAfterPasswordReset:
        ROUTES.login,

    loginPage:
        ROUTES.login,

    protectedRoutes:
        PROTECTED_ROUTES,

    providers: {
        google: "google"
    },

    password: {
        minimumLength: 8,

        requireUppercase: true,

        requireLowercase: true,

        requireNumber: true
    }
});


/* =========================================================
   7. CHAT CONFIGURATION
========================================================= */

const CHAT_CONFIG = Object.freeze({
    defaultMode: "balanced",

    responseModes: {
        balanced: {
            id: "balanced",
            label: "Balanced",
            displayModel:
                "nexxorra Core"
        },

        fast: {
            id: "fast",
            label: "Fast",
            displayModel:
                "nexxorra Swift"
        },

        deep: {
            id: "deep",
            label: "Deep",
            displayModel:
                "nexxorra Deep"
        }
    },

    maximumMessageLength: 12000,

    maximumContextMessages: 30,

    maximumContextCharacters: 80000,

    recentConversationLimit: 8,

    guest: {
        maximumDailyMessages: 20,

        maximumConversations: 12,

        maximumMessagesPerConversation:
            30
    },

    attachments: {
        maximumFiles: 5,

        maximumFileSize:
            10 * 1024 * 1024,

        allowedExtensions: [
            "txt",
            "md",
            "pdf",
            "doc",
            "docx",
            "png",
            "jpg",
            "jpeg",
            "webp"
        ]
    }
});


/* =========================================================
   8. STORAGE KEYS
========================================================= */

const STORAGE_KEYS = Object.freeze({
    theme:
        "nexxorraTheme",

    responseMode:
        "nexxorraResponseMode",

    guestId:
        "nexxorraGuestId",

    guestUsage:
        "nexxorraGuestUsage",

    guestConversations:
        "nexxorraGuestConversations",

    activeConversation:
        "nexxorraActiveConversation",

    authReturnPath:
        "nexxorraAuthReturnPath"
});


/* =========================================================
   9. DATABASE TABLE NAMES
========================================================= */

const DATABASE_TABLES = Object.freeze({
    profiles: "profiles",

    conversations:
        "conversations",

    messages: "messages",

    userSettings:
        "user_settings"
});


/* =========================================================
   10. USER SETTINGS DEFAULTS
========================================================= */

const DEFAULT_USER_SETTINGS =
    Object.freeze({
        theme: "system",

        preferredModel:
            "balanced",

        responseStyle:
            "balanced",

        language: "auto",

        saveHistory: true,

        enterToSend: true,

        voiceLanguage:
            "en-US"
    });


/* =========================================================
   11. APPLICATION INFORMATION
========================================================= */

const APP_CONFIG = Object.freeze({
    name: "nexxorra AI",

    shortName: "nexxorra",

    version: "1.0.0",

    environment:
        CURRENT_ENVIRONMENT,

    defaultLanguage: "en",

    supportEmail:
        "support@nexxorra.ai",

    routes: ROUTES,

    protectedRoutes:
        PROTECTED_ROUTES
});


/* =========================================================
   12. SUPABASE CONFIGURATION VALIDATION
========================================================= */

function isPlaceholderValue(value) {
    const normalizedValue =
        String(value || "")
            .trim()
            .toUpperCase();

    return (
        !normalizedValue ||
        normalizedValue.includes(
            "YOUR_SUPABASE"
        ) ||
        normalizedValue.includes(
            "PLACEHOLDER"
        )
    );
}

export function isSupabaseConfigured() {
    return (
        !isPlaceholderValue(
            SUPABASE_CONFIG.url
        ) &&
        !isPlaceholderValue(
            SUPABASE_CONFIG.anonKey
        )
    );
}

export function validateSupabaseConfig() {
    const errors = [];

    if (
        isPlaceholderValue(
            SUPABASE_CONFIG.url
        )
    ) {
        errors.push(
            "Supabase project URL is missing."
        );
    } else {
        try {
            const url =
                new URL(
                    SUPABASE_CONFIG.url
                );

            if (
                url.protocol !== "https:"
            ) {
                errors.push(
                    "Supabase URL must use HTTPS."
                );
            }
        } catch {
            errors.push(
                "Supabase project URL is invalid."
            );
        }
    }

    if (
        isPlaceholderValue(
            SUPABASE_CONFIG.anonKey
        )
    ) {
        errors.push(
            "Supabase public anon key is missing."
        );
    }

    return {
        valid:
            errors.length === 0,

        errors
    };
}


/* =========================================================
   13. CURRENT PAGE HELPERS
========================================================= */

export function getCurrentPageName() {
    const pathname =
        window.location.pathname;

    const pageName =
        pathname
            .split("/")
            .pop();

    return pageName ||
        ROUTES.home;
}

export function isProtectedPage(
    pageName = getCurrentPageName()
) {
    return PROTECTED_ROUTES.includes(
        pageName
    );
}


/* =========================================================
   14. REDIRECT URL HELPERS
========================================================= */

export function getApplicationBaseURL() {
    const {
        origin,
        pathname
    } = window.location;

    const directory =
        pathname.endsWith("/")
            ? pathname
            : pathname.substring(
                  0,
                  pathname.lastIndexOf("/") + 1
              );

    return `${origin}${directory}`;
}

export function createPageURL(page) {
    return new URL(
        page,
        getApplicationBaseURL()
    ).toString();
}

export function getOAuthRedirectURL() {
    return createPageURL(
        ROUTES.home
    );
}

export function getPasswordResetRedirectURL() {
    return createPageURL(
        ROUTES.forgotPassword
    );
}


/* =========================================================
   15. AUTH RETURN PATH
========================================================= */

export function saveAuthReturnPath(
    page = getCurrentPageName()
) {
    if (
        page === ROUTES.login ||
        page === ROUTES.signup ||
        page ===
            ROUTES.forgotPassword
    ) {
        return;
    }

    sessionStorage.setItem(
        STORAGE_KEYS.authReturnPath,
        page
    );
}

export function consumeAuthReturnPath() {
    const storedPath =
        sessionStorage.getItem(
            STORAGE_KEYS.authReturnPath
        );

    sessionStorage.removeItem(
        STORAGE_KEYS.authReturnPath
    );

    if (
        storedPath &&
        Object.values(ROUTES)
            .includes(storedPath)
    ) {
        return storedPath;
    }

    return AUTH_CONFIG
        .redirectAfterLogin;
}


/* =========================================================
   16. DEVELOPMENT LOGGING
========================================================= */

export function logDevelopment(
    ...values
) {
    if (
        CURRENT_ENVIRONMENT ===
        "development"
    ) {
        console.log(
            "[nexxorra]",
            ...values
        );
    }
}

export function warnDevelopment(
    ...values
) {
    if (
        CURRENT_ENVIRONMENT !==
        "production"
    ) {
        console.warn(
            "[nexxorra]",
            ...values
        );
    }
}


/* =========================================================
   17. FREEZE COMBINED CONFIGURATION
========================================================= */

const nexxorra_CONFIG =
    Object.freeze({
        app: APP_CONFIG,

        supabase:
            SUPABASE_CONFIG,

        api:
            API_CONFIG,

        auth:
            AUTH_CONFIG,

        chat:
            CHAT_CONFIG,

        routes:
            ROUTES,

        tables:
            DATABASE_TABLES,

        storage:
            STORAGE_KEYS,

        defaultSettings:
            DEFAULT_USER_SETTINGS
    });


/* =========================================================
   18. NAMED EXPORTS
========================================================= */

export {
    CURRENT_ENVIRONMENT,

    APP_CONFIG,

    SUPABASE_CONFIG,

    API_CONFIG,

    AUTH_CONFIG,

    CHAT_CONFIG,

    ROUTES,

    PROTECTED_ROUTES,

    STORAGE_KEYS,

    DATABASE_TABLES,

    DEFAULT_USER_SETTINGS
};


/* =========================================================
   19. DEFAULT EXPORT
========================================================= */

export default nexxorra_CONFIG;