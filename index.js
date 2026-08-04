/* =========================================================
   nexxorra AI — MAIN APPLICATION
   File: index.js
   Part 1: State, Storage, Session and Application Bootstrap
========================================================= */

import {
    showToast,
    showGlobalLoader,
    hideGlobalLoader,
    clearAttachments,
    getSelectedAttachments,
    resizeMessageInput
} from "./ui.js";


/* =========================================================
   1. APPLICATION CONSTANTS
========================================================= */

const APP_CONFIG = Object.freeze({
    appName: "nexxorra AI",

    storageKeys: {
        guestId: "nexxorraGuestId",
        conversations: "nexxorraGuestConversations",
        activeConversation: "nexxorraActiveConversation",
        guestUsage: "nexxorraGuestUsage",
        responseMode: "nexxorraResponseMode"
    },

    guestLimits: {
        maximumConversations: 12,
        maximumMessagesPerConversation: 30,
        maximumDailyMessages: 20
    },

    conversation: {
        defaultTitle: "Untitled conversation",
        titleMaximumLength: 80,
        recentConversationLimit: 8
    },

    message: {
        maximumLength: 12000
    }
});


/* =========================================================
   2. APPLICATION STATE
========================================================= */

const appState = {
    initialized: false,
    loading: false,
    generating: false,

    user: null,
    session: null,
    isAuthenticated: false,

    guestId: null,
    guestUsage: null,

    conversations: [],
    activeConversationId: null,
    activeConversation: null,

    responseMode: "balanced",

    abortController: null,

    pendingPrompt: null,
    lastUserMessage: null,
    lastAssistantMessage: null
};


/* =========================================================
   3. DOM REFERENCES
========================================================= */

const elements = {
    shell: null,

    conversationTitle: null,
    welcomeState: null,
    conversationStream: null,
    conversationEnd: null,

    messageForm: null,
    messageInput: null,
    sendMessageButton: null,

    typingIndicator: null,
    generationStrip: null,
    stopGenerationButton: null,
    jumpLatestButton: null,

    suggestedPrompts: null,

    memoryList: null,
    memoryEmptyState: null,
    recentChatCount: null,

    railProfileInitial: null,
    accountAvatar: null,
    accountLargeAvatar: null,
    accountDropdownHeader: null,

    activeModelName: null,
    responseModeLabel: null
};


/* =========================================================
   4. DOM INITIALIZATION
========================================================= */

function cacheDOMElements() {
    elements.shell =
        document.getElementById("nexxorraShell");

    elements.conversationTitle =
        document.getElementById("conversationTitle");

    elements.welcomeState =
        document.getElementById("welcomeState");

    elements.conversationStream =
        document.getElementById("conversationStream");

    elements.conversationEnd =
        document.getElementById("conversationEnd");

    elements.messageForm =
        document.getElementById("messageForm");

    elements.messageInput =
        document.getElementById("messageInput");

    elements.sendMessageButton =
        document.getElementById("sendMessageButton");

    elements.typingIndicator =
        document.getElementById("typingIndicator");

    elements.generationStrip =
        document.getElementById("generationStrip");

    elements.stopGenerationButton =
        document.getElementById("stopGenerationButton");

    elements.jumpLatestButton =
        document.getElementById("jumpLatestButton");

    elements.suggestedPrompts =
        document.getElementById("suggestedPrompts");

    elements.memoryList =
        document.getElementById("memoryList");

    elements.memoryEmptyState =
        document.getElementById("memoryEmptyState");

    elements.recentChatCount =
        document.getElementById("recentChatCount");

    elements.railProfileInitial =
        document.getElementById("railProfileInitial");

    elements.accountAvatar =
        document.querySelector(".account-avatar");

    elements.accountLargeAvatar =
        document.querySelector(".account-large-avatar");

    elements.accountDropdownHeader =
        document.querySelector(".account-dropdown-header");

    elements.activeModelName =
        document.getElementById("activeModelName");

    elements.responseModeLabel =
        document.getElementById("responseModeLabel");
}


/* =========================================================
   5. GENERAL HELPERS
========================================================= */

function createId(prefix = "item") {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
}

function getCurrentTimestamp() {
    return new Date().toISOString();
}

function parseJSON(value, fallbackValue) {
    if (!value) return fallbackValue;

    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn(
            "nexxorra could not parse stored data:",
            error
        );

        return fallbackValue;
    }
}

function cloneData(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function truncateText(value, maximumLength) {
    const normalized = normalizeText(value);

    if (normalized.length <= maximumLength) {
        return normalized;
    }

    return `${normalized.slice(
        0,
        Math.max(0, maximumLength - 1)
    )}…`;
}

function escapeSelectorValue(value) {
    if (
        typeof CSS !== "undefined" &&
        typeof CSS.escape === "function"
    ) {
        return CSS.escape(String(value));
    }

    return String(value).replace(
        /["\\]/g,
        "\\$&"
    );
}

function isValidDate(date) {
    return (
        date instanceof Date &&
        !Number.isNaN(date.getTime())
    );
}


/* =========================================================
   6. DATE AND TIME HELPERS
========================================================= */

function formatConversationTime(dateValue) {
    const date = new Date(dateValue);

    if (!isValidDate(date)) {
        return "";
    }

    const now = new Date();

    const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const dateStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );

    const differenceInDays = Math.floor(
        (todayStart - dateStart) /
        (1000 * 60 * 60 * 24)
    );

    if (differenceInDays === 0) {
        return new Intl.DateTimeFormat(
            undefined,
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        ).format(date);
    }

    if (differenceInDays === 1) {
        return "Yesterday";
    }

    if (differenceInDays < 7) {
        return new Intl.DateTimeFormat(
            undefined,
            {
                weekday: "short"
            }
        ).format(date);
    }

    return new Intl.DateTimeFormat(
        undefined,
        {
            day: "2-digit",
            month: "short"
        }
    ).format(date);
}

function formatMessageTime(dateValue) {
    const date = new Date(dateValue);

    if (!isValidDate(date)) {
        return "";
    }

    return new Intl.DateTimeFormat(
        undefined,
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(date);
}


/* =========================================================
   7. GUEST IDENTITY
========================================================= */

function createGuestId() {
    return createId("guest");
}

function loadOrCreateGuestId() {
    let guestId = localStorage.getItem(
        APP_CONFIG.storageKeys.guestId
    );

    if (!guestId) {
        guestId = createGuestId();

        localStorage.setItem(
            APP_CONFIG.storageKeys.guestId,
            guestId
        );
    }

    appState.guestId = guestId;

    return guestId;
}


/* =========================================================
   8. GUEST USAGE TRACKING
========================================================= */

function createDefaultGuestUsage() {
    return {
        date: new Date().toISOString().slice(0, 10),
        messageCount: 0
    };
}

function loadGuestUsage() {
    const storedUsage = parseJSON(
        localStorage.getItem(
            APP_CONFIG.storageKeys.guestUsage
        ),
        createDefaultGuestUsage()
    );

    const today =
        new Date().toISOString().slice(0, 10);

    if (storedUsage.date !== today) {
        appState.guestUsage =
            createDefaultGuestUsage();

        saveGuestUsage();

        return appState.guestUsage;
    }

    appState.guestUsage = {
        date: today,
        messageCount:
            Number(storedUsage.messageCount) || 0
    };

    return appState.guestUsage;
}

function saveGuestUsage() {
    localStorage.setItem(
        APP_CONFIG.storageKeys.guestUsage,
        JSON.stringify(appState.guestUsage)
    );
}

function incrementGuestUsage() {
    if (!appState.guestUsage) {
        loadGuestUsage();
    }

    appState.guestUsage.messageCount += 1;

    saveGuestUsage();
}

function hasGuestReachedDailyLimit() {
    if (appState.isAuthenticated) {
        return false;
    }

    if (!appState.guestUsage) {
        loadGuestUsage();
    }

    return (
        appState.guestUsage.messageCount >=
        APP_CONFIG.guestLimits.maximumDailyMessages
    );
}


/* =========================================================
   9. CONVERSATION DATA FACTORIES
========================================================= */

function createConversation({
    id = createId("conversation"),
    title = APP_CONFIG.conversation.defaultTitle,
    userId = null,
    messages = [],
    createdAt = getCurrentTimestamp(),
    updatedAt = getCurrentTimestamp(),
    responseMode = appState.responseMode,
    source = appState.isAuthenticated
        ? "supabase"
        : "local"
} = {}) {
    return {
        id,
        userId,
        title: truncateText(
            title,
            APP_CONFIG.conversation.titleMaximumLength
        ),
        messages: Array.isArray(messages)
            ? messages
            : [],
        responseMode,
        source,
        createdAt,
        updatedAt
    };
}

function createMessage({
    id = createId("message"),
    role,
    content,
    createdAt = getCurrentTimestamp(),
    status = "completed",
    attachments = [],
    metadata = {}
}) {
    if (
        !["user", "assistant", "system"].includes(role)
    ) {
        throw new Error(
            `Unsupported message role: ${role}`
        );
    }

    return {
        id,
        role,
        content: String(content || ""),
        status,
        attachments: Array.isArray(attachments)
            ? attachments
            : [],
        metadata:
            metadata &&
            typeof metadata === "object"
                ? metadata
                : {},
        createdAt
    };
}


/* =========================================================
   10. LOCAL CONVERSATION STORAGE
========================================================= */

function loadLocalConversations() {
    const storedConversations = parseJSON(
        localStorage.getItem(
            APP_CONFIG.storageKeys.conversations
        ),
        []
    );

    if (!Array.isArray(storedConversations)) {
        appState.conversations = [];
        return [];
    }

    appState.conversations = storedConversations
        .filter(conversation => {
            return (
                conversation &&
                typeof conversation.id === "string"
            );
        })
        .map(conversation => {
            return createConversation({
                ...conversation,
                messages: Array.isArray(
                    conversation.messages
                )
                    ? conversation.messages
                    : []
            });
        })
        .sort((first, second) => {
            return (
                new Date(second.updatedAt).getTime() -
                new Date(first.updatedAt).getTime()
            );
        });

    return appState.conversations;
}

function saveLocalConversations() {
    if (appState.isAuthenticated) {
        return;
    }

    const conversationsToSave =
        appState.conversations.slice(
            0,
            APP_CONFIG.guestLimits
                .maximumConversations
        );

    localStorage.setItem(
        APP_CONFIG.storageKeys.conversations,
        JSON.stringify(conversationsToSave)
    );
}

function saveActiveConversationId(
    conversationId
) {
    if (!conversationId) {
        localStorage.removeItem(
            APP_CONFIG.storageKeys
                .activeConversation
        );

        return;
    }

    localStorage.setItem(
        APP_CONFIG.storageKeys.activeConversation,
        conversationId
    );
}

function getStoredActiveConversationId() {
    return localStorage.getItem(
        APP_CONFIG.storageKeys.activeConversation
    );
}


/* =========================================================
   11. CONVERSATION LOOKUP HELPERS
========================================================= */

function getConversationById(conversationId) {
    if (!conversationId) {
        return null;
    }

    return (
        appState.conversations.find(
            conversation =>
                conversation.id === conversationId
        ) || null
    );
}

function getConversationIndex(
    conversationId
) {
    return appState.conversations.findIndex(
        conversation =>
            conversation.id === conversationId
    );
}

function getActiveConversation() {
    if (
        appState.activeConversation &&
        appState.activeConversation.id ===
            appState.activeConversationId
    ) {
        return appState.activeConversation;
    }

    return getConversationById(
        appState.activeConversationId
    );
}


/* =========================================================
   12. ACTIVE CONVERSATION MANAGEMENT
========================================================= */

function setActiveConversation(
    conversationId,
    {
        saveSelection = true,
        emitEvent = true
    } = {}
) {
    const conversation =
        getConversationById(conversationId);

    if (!conversation) {
        appState.activeConversationId = null;
        appState.activeConversation = null;

        if (saveSelection) {
            saveActiveConversationId(null);
        }

        return null;
    }

    appState.activeConversationId =
        conversation.id;

    appState.activeConversation =
        conversation;

    if (saveSelection) {
        saveActiveConversationId(
            conversation.id
        );
    }

    if (emitEvent) {
        document.dispatchEvent(
            new CustomEvent(
                "nexxorra:active-conversation-change",
                {
                    detail: {
                        conversation: cloneData(
                            conversation
                        )
                    }
                }
            )
        );
    }

    return conversation;
}

function clearActiveConversation({
    saveSelection = true,
    emitEvent = true
} = {}) {
    appState.activeConversationId = null;
    appState.activeConversation = null;

    if (saveSelection) {
        saveActiveConversationId(null);
    }

    if (emitEvent) {
        document.dispatchEvent(
            new CustomEvent(
                "nexxorra:active-conversation-change",
                {
                    detail: {
                        conversation: null
                    }
                }
            )
        );
    }
}


/* =========================================================
   13. CONVERSATION CREATION
========================================================= */

function createAndActivateConversation({
    title = APP_CONFIG.conversation.defaultTitle,
    saveImmediately = true
} = {}) {
    const conversation = createConversation({
        title,
        userId: appState.user?.id || null,
        responseMode: appState.responseMode
    });

    appState.conversations.unshift(
        conversation
    );

    setActiveConversation(
        conversation.id
    );

    if (
        saveImmediately &&
        !appState.isAuthenticated
    ) {
        saveLocalConversations();
    }

    return conversation;
}


/* =========================================================
   14. CONVERSATION UPDATE
========================================================= */

function updateConversation(
    conversationId,
    updates = {}
) {
    const conversationIndex =
        getConversationIndex(conversationId);

    if (conversationIndex === -1) {
        return null;
    }

    const currentConversation =
        appState.conversations[
            conversationIndex
        ];

    const updatedConversation = {
        ...currentConversation,
        ...updates,
        id: currentConversation.id,
        messages:
            updates.messages !== undefined
                ? updates.messages
                : currentConversation.messages,
        updatedAt:
            updates.updatedAt ||
            getCurrentTimestamp()
    };

    appState.conversations[
        conversationIndex
    ] = updatedConversation;

    appState.conversations.sort(
        (first, second) => {
            return (
                new Date(second.updatedAt).getTime() -
                new Date(first.updatedAt).getTime()
            );
        }
    );

    if (
        appState.activeConversationId ===
        conversationId
    ) {
        appState.activeConversation =
            updatedConversation;
    }

    if (!appState.isAuthenticated) {
        saveLocalConversations();
    }

    return updatedConversation;
}


/* =========================================================
   15. ADD MESSAGE TO CONVERSATION
========================================================= */

function addMessageToConversation(
    conversationId,
    message
) {
    const conversation =
        getConversationById(conversationId);

    if (!conversation) {
        throw new Error(
            "Conversation does not exist."
        );
    }

    const currentMessages =
        Array.isArray(conversation.messages)
            ? conversation.messages
            : [];

    const nextMessages = [
        ...currentMessages,
        message
    ];

    if (
        !appState.isAuthenticated &&
        nextMessages.length >
            APP_CONFIG.guestLimits
                .maximumMessagesPerConversation
    ) {
        throw new Error(
            "Guest conversation message limit reached."
        );
    }

    return updateConversation(
        conversationId,
        {
            messages: nextMessages,
            updatedAt: getCurrentTimestamp()
        }
    );
}


/* =========================================================
   16. REMOVE MESSAGE FROM CONVERSATION
========================================================= */

function removeMessageFromConversation(
    conversationId,
    messageId
) {
    const conversation =
        getConversationById(conversationId);

    if (!conversation) {
        return null;
    }

    const filteredMessages =
        conversation.messages.filter(
            message =>
                message.id !== messageId
        );

    return updateConversation(
        conversationId,
        {
            messages: filteredMessages
        }
    );
}


/* =========================================================
   17. AUTOMATIC CONVERSATION TITLE
========================================================= */

function generateConversationTitle(
    messageContent
) {
    const cleanedContent =
        normalizeText(messageContent)
            .replace(
                /[`*_>#\[\](){}]/g,
                ""
            );

    if (!cleanedContent) {
        return APP_CONFIG.conversation
            .defaultTitle;
    }

    return truncateText(
        cleanedContent,
        46
    );
}

function updateUntitledConversationTitle(
    conversationId,
    firstMessageContent
) {
    const conversation =
        getConversationById(conversationId);

    if (!conversation) return null;

    if (
        conversation.title !==
        APP_CONFIG.conversation.defaultTitle
    ) {
        return conversation;
    }

    return updateConversation(
        conversationId,
        {
            title: generateConversationTitle(
                firstMessageContent
            )
        }
    );
}


/* =========================================================
   18. DELETE CONVERSATION
========================================================= */

function deleteConversationFromState(
    conversationId
) {
    const conversationIndex =
        getConversationIndex(conversationId);

    if (conversationIndex === -1) {
        return false;
    }

    appState.conversations.splice(
        conversationIndex,
        1
    );

    if (
        appState.activeConversationId ===
        conversationId
    ) {
        clearActiveConversation();
    }

    if (!appState.isAuthenticated) {
        saveLocalConversations();
    }

    return true;
}


/* =========================================================
   19. RESPONSE MODE
========================================================= */

function loadResponseMode() {
    const storedMode = localStorage.getItem(
        APP_CONFIG.storageKeys.responseMode
    );

    if (
        ["balanced", "fast", "deep"].includes(
            storedMode
        )
    ) {
        appState.responseMode = storedMode;
    } else {
        appState.responseMode = "balanced";
    }

    return appState.responseMode;
}

function getResponseModeLabel(mode) {
    const labels = {
        balanced: "Balanced",
        fast: "Fast",
        deep: "Deep"
    };

    return labels[mode] || labels.balanced;
}

function updateResponseModeUI() {
    const label =
        getResponseModeLabel(
            appState.responseMode
        );

    if (elements.responseModeLabel) {
        elements.responseModeLabel.textContent =
            label;
    }

    if (elements.activeModelName) {
        const modelNames = {
            balanced: "nexxorra Core",
            fast: "nexxorra Swift",
            deep: "nexxorra Deep"
        };

        elements.activeModelName.textContent =
            modelNames[
                appState.responseMode
            ] || modelNames.balanced;
    }
}


/* =========================================================
   20. AUTHENTICATION STATE PLACEHOLDERS
========================================================= */

function setAuthenticatedUser({
    user = null,
    session = null
} = {}) {
    appState.user = user;
    appState.session = session;
    appState.isAuthenticated =
        Boolean(user && session);

    updateAccountUI();

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:authentication-change",
            {
                detail: {
                    user: user
                        ? cloneData(user)
                        : null,
                    isAuthenticated:
                        appState.isAuthenticated
                }
            }
        )
    );
}

function getDisplayNameFromUser(user) {
    if (!user) {
        return "Guest user";
    }

    return (
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "nexxorra user"
    );
}

function getUserInitial(user) {
    const displayName =
        getDisplayNameFromUser(user);

    const initial = displayName
        .trim()
        .charAt(0)
        .toUpperCase();

    return initial || "G";
}

function updateAccountUI() {
    const displayName =
        appState.isAuthenticated
            ? getDisplayNameFromUser(
                appState.user
            )
            : "Guest user";

    const statusText =
        appState.isAuthenticated
            ? appState.user?.email ||
              "Signed in"
            : "Local workspace";

    const initial =
        appState.isAuthenticated
            ? getUserInitial(appState.user)
            : "G";

    [
        elements.railProfileInitial,
        elements.accountAvatar,
        elements.accountLargeAvatar
    ].forEach(element => {
        if (element) {
            element.textContent = initial;
        }
    });

    if (
        elements.accountDropdownHeader
    ) {
        const nameElement =
            elements.accountDropdownHeader
                .querySelector("strong");

        const statusElement =
            elements.accountDropdownHeader
                .querySelector("span:not(.account-large-avatar)");

        if (nameElement) {
            nameElement.textContent =
                displayName;
        }

        if (statusElement) {
            statusElement.textContent =
                statusText;
        }
    }
}


/* =========================================================
   21. INITIAL SESSION RESOLUTION
========================================================= */

async function resolveInitialSession() {
    /*
       Supabase integration will be connected later
       through supabase.js and auth.js.

       This fallback keeps guest mode working even
       before Supabase configuration is added.
    */

    try {
        const authModule =
            await import("./auth.js");

        if (
            typeof authModule.getCurrentSession ===
            "function"
        ) {
            const sessionResult =
                await authModule.getCurrentSession();

            const session =
                sessionResult?.session ||
                sessionResult ||
                null;

            const user =
                session?.user || null;

            setAuthenticatedUser({
                user,
                session
            });

            return {
                user,
                session
            };
        }
    } catch (error) {
        console.info(
            "nexxorra is running in guest mode.",
            error
        );
    }

    setAuthenticatedUser({
        user: null,
        session: null
    });

    return {
        user: null,
        session: null
    };
}


/* =========================================================
   22. AUTHENTICATION EVENT LISTENER
========================================================= */

function bindAuthenticationEvents() {
    document.addEventListener(
        "nexxorra:auth-session",
        event => {
            const session =
                event.detail?.session || null;

            const user =
                event.detail?.user ||
                session?.user ||
                null;

            setAuthenticatedUser({
                user,
                session
            });
        }
    );

    document.addEventListener(
        "nexxorra:logout",
        () => {
            setAuthenticatedUser({
                user: null,
                session: null
            });

            loadLocalConversations();
            restoreInitialConversation();

            showToast({
                title: "Logged out",
                message:
                    "nexxorra is now using guest mode.",
                type: "success"
            });
        }
    );
}


/* =========================================================
   23. INITIAL CONVERSATION RESTORATION
========================================================= */

function restoreInitialConversation() {
    const storedConversationId =
        getStoredActiveConversationId();

    if (
        storedConversationId &&
        getConversationById(
            storedConversationId
        )
    ) {
        setActiveConversation(
            storedConversationId,
            {
                emitEvent: false
            }
        );

        return appState.activeConversation;
    }

    const latestConversation =
        appState.conversations[0] || null;

    if (latestConversation) {
        setActiveConversation(
            latestConversation.id,
            {
                emitEvent: false
            }
        );

        return latestConversation;
    }

    clearActiveConversation({
        emitEvent: false
    });

    return null;
}


/* =========================================================
   24. BASIC INTERFACE RESET
========================================================= */

function resetConversationInterface() {
    if (elements.conversationTitle) {
        elements.conversationTitle.textContent =
            APP_CONFIG.conversation.defaultTitle;
    }

    if (elements.welcomeState) {
        elements.welcomeState.hidden = false;
    }

    if (elements.conversationStream) {
        elements.conversationStream.hidden =
            true;

        elements.conversationStream
            .replaceChildren();
    }

    if (elements.typingIndicator) {
        elements.typingIndicator.hidden =
            true;
    }

    if (elements.generationStrip) {
        elements.generationStrip.hidden =
            true;
    }

    if (elements.jumpLatestButton) {
        elements.jumpLatestButton.hidden =
            true;
    }

    if (elements.messageInput) {
        elements.messageInput.value = "";
        resizeMessageInput();
    }

    if (elements.sendMessageButton) {
        elements.sendMessageButton.disabled =
            true;
    }

    clearAttachments();
}


/* =========================================================
   25. GENERATION STATE
========================================================= */

function setGeneratingState(generating) {
    appState.generating =
        Boolean(generating);

    if (elements.typingIndicator) {
        elements.typingIndicator.hidden =
            !appState.generating;
    }

    if (elements.generationStrip) {
        elements.generationStrip.hidden =
            !appState.generating;
    }

    if (elements.messageInput) {
        elements.messageInput.disabled =
            appState.generating;
    }

    if (elements.sendMessageButton) {
        elements.sendMessageButton.disabled =
            appState.generating ||
            !elements.messageInput
                ?.value
                ?.trim();
    }

    document.documentElement.classList.toggle(
        "nexxorra-generating",
        appState.generating
    );
}

function stopActiveGeneration() {
    if (
        appState.abortController &&
        !appState.abortController.signal.aborted
    ) {
        appState.abortController.abort();
    }

    appState.abortController = null;

    setGeneratingState(false);

    showToast({
        title: "Generation stopped",
        message:
            "nexxorra stopped the current response.",
        type: "info",
        duration: 1800
    });
}


/* =========================================================
   26. SCROLL HELPERS
========================================================= */

function scrollConversationToEnd({
    behavior = "smooth"
} = {}) {
    if (!elements.conversationEnd) {
        return;
    }

    elements.conversationEnd.scrollIntoView({
        behavior,
        block: "end"
    });
}

function isNearConversationEnd() {
    const canvas =
        document.getElementById("chatCanvas");

    if (!canvas) {
        return true;
    }

    const remainingDistance =
        canvas.scrollHeight -
        canvas.scrollTop -
        canvas.clientHeight;

    return remainingDistance < 120;
}


/* =========================================================
   27. APPLICATION EVENTS
========================================================= */

function bindApplicationEvents() {
    elements.stopGenerationButton
        ?.addEventListener(
            "click",
            stopActiveGeneration
        );

    elements.jumpLatestButton
        ?.addEventListener(
            "click",
            () => {
                scrollConversationToEnd();
            }
        );

    document
        .getElementById("chatCanvas")
        ?.addEventListener(
            "scroll",
            () => {
                if (
                    !elements.jumpLatestButton
                ) {
                    return;
                }

                const shouldShowButton =
                    !isNearConversationEnd() &&
                    Boolean(
                        appState
                            .activeConversation
                            ?.messages
                            ?.length
                    );

                elements.jumpLatestButton.hidden =
                    !shouldShowButton;
            },
            {
                passive: true
            }
        );

    document.addEventListener(
        "nexxorra:new-chat",
        () => {
            clearActiveConversation();
            resetConversationInterface();
        }
    );

    document.addEventListener(
        "nexxorra:response-mode-change",
        event => {
            const mode =
                event.detail?.mode;

            if (
                ![
                    "balanced",
                    "fast",
                    "deep"
                ].includes(mode)
            ) {
                return;
            }

            appState.responseMode = mode;

            updateResponseModeUI();

            const activeConversation =
                getActiveConversation();

            if (activeConversation) {
                updateConversation(
                    activeConversation.id,
                    {
                        responseMode: mode
                    }
                );
            }
        }
    );

    document.addEventListener(
        "nexxorra:conversation-renamed",
        event => {
            const conversationId =
                event.detail
                    ?.conversationId ||
                appState.activeConversationId;

            const title =
                event.detail?.title;

            if (
                !conversationId ||
                !title
            ) {
                return;
            }

            updateConversation(
                conversationId,
                {
                    title: truncateText(
                        title,
                        APP_CONFIG
                            .conversation
                            .titleMaximumLength
                    )
                }
            );
        }
    );

    document.addEventListener(
        "nexxorra:conversation-delete",
        event => {
            const conversationId =
                event.detail
                    ?.conversationId ||
                appState.activeConversationId;

            if (!conversationId) {
                return;
            }

            deleteConversationFromState(
                conversationId
            );

            resetConversationInterface();

            document.dispatchEvent(
                new CustomEvent(
                    "nexxorra:conversation-list-change"
                )
            );
        }
    );
}


/* =========================================================
   28. STARTUP DATA LOADING
========================================================= */

async function loadInitialApplicationData() {
    loadOrCreateGuestId();
    loadGuestUsage();
    loadResponseMode();

    const {
        user,
        session
    } = await resolveInitialSession();

    if (user && session) {
        /*
           Supabase conversation loading will be
           implemented in Part 2 and supabase.js.

           Until that integration is available,
           the array is initialized safely.
        */

        appState.conversations = [];
    } else {
        loadLocalConversations();
    }

    restoreInitialConversation();
}


/* =========================================================
   29. APPLICATION BOOTSTRAP
========================================================= */

async function initializeApplication() {
    if (appState.initialized) {
        return;
    }

    appState.initialized = true;
    appState.loading = true;

    cacheDOMElements();
    bindAuthenticationEvents();
    bindApplicationEvents();

    showGlobalLoader(
        "Preparing your workspace"
    );

    try {
        await loadInitialApplicationData();

        updateAccountUI();
        updateResponseModeUI();

        document.dispatchEvent(
            new CustomEvent(
                "nexxorra:application-ready",
                {
                    detail: {
                        user: appState.user
                            ? cloneData(
                                  appState.user
                              )
                            : null,

                        isAuthenticated:
                            appState
                                .isAuthenticated,

                        guestId:
                            appState.guestId,

                        conversations:
                            cloneData(
                                appState
                                    .conversations
                            ),

                        activeConversation:
                            appState
                                .activeConversation
                                ? cloneData(
                                      appState
                                          .activeConversation
                                  )
                                : null,

                        responseMode:
                            appState.responseMode
                    }
                }
            )
        );
    } catch (error) {
        console.error(
            "nexxorra application startup failed:",
            error
        );

        resetConversationInterface();

        showToast({
            title:
                "nexxorra could not fully start",
            message:
                "Guest mode is still available. Refresh the page if the issue continues.",
            type: "error",
            duration: 5000
        });
    } finally {
        appState.loading = false;

        hideGlobalLoader();

        document.documentElement
            .classList
            .add("nexxorra-app-ready");
    }
}


/* =========================================================
   30. PUBLIC APPLICATION API
========================================================= */

export {
    APP_CONFIG,
    appState,

    createConversation,
    createMessage,

    getConversationById,
    getActiveConversation,

    createAndActivateConversation,
    setActiveConversation,
    clearActiveConversation,

    updateConversation,
    addMessageToConversation,
    removeMessageFromConversation,
    deleteConversationFromState,

    updateUntitledConversationTitle,

    setGeneratingState,
    stopActiveGeneration,

    scrollConversationToEnd,
    hasGuestReachedDailyLimit,
    incrementGuestUsage,

    formatConversationTime,
    formatMessageTime
};


/* =========================================================
   31. AUTOMATIC INITIALIZATION
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeApplication,
        {
            once: true
        }
    );
} else {
    initializeApplication();
}

/* =========================================================
   nexxorra AI — MAIN APPLICATION
   File: index.js
   Part 2: Conversation UI, Memory Rendering and Messages
========================================================= */


/* =========================================================
   32. MEMORY TRAY RENDERING
========================================================= */

function createMemoryItem(
    conversation,
    index
) {
    const article =
        document.createElement("article");

    article.className = "memory-item";
    article.dataset.conversationId =
        conversation.id;

    if (
        conversation.id ===
        appState.activeConversationId
    ) {
        article.classList.add("active");
    }

    const openButton =
        document.createElement("button");

    openButton.className =
        "memory-open-button";

    openButton.type = "button";

    const number =
        document.createElement("span");

    number.className = "memory-index";

    number.textContent =
        String(index + 1).padStart(2, "0");

    const copy =
        document.createElement("span");

    copy.className = "memory-copy";

    const title =
        document.createElement("strong");

    title.textContent =
        conversation.title ||
        APP_CONFIG.conversation.defaultTitle;

    const preview =
        document.createElement("small");

    preview.textContent =
        getConversationPreview(
            conversation
        );

    copy.append(
        title,
        preview
    );

    const time =
        document.createElement("time");

    time.dateTime =
        conversation.updatedAt ||
        conversation.createdAt ||
        getCurrentTimestamp();

    time.textContent =
        formatConversationTime(
            conversation.updatedAt ||
            conversation.createdAt
        );

    openButton.append(
        number,
        copy,
        time
    );

    const optionsButton =
        document.createElement("button");

    optionsButton.className =
        "memory-options-button";

    optionsButton.type = "button";

    optionsButton.setAttribute(
        "aria-label",
        `Options for ${conversation.title}`
    );

    const optionsIcon =
        document.createElement("i");

    optionsIcon.className =
        "fa-solid fa-ellipsis";

    optionsIcon.setAttribute(
        "aria-hidden",
        "true"
    );

    optionsButton.appendChild(
        optionsIcon
    );

    openButton.addEventListener(
        "click",
        () => {
            selectConversationFromMemory(
                conversation.id
            );
        }
    );

    optionsButton.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            const rectangle =
                optionsButton
                    .getBoundingClientRect();

            document.dispatchEvent(
                new CustomEvent(
                    "nexxorra:open-conversation-menu",
                    {
                        detail: {
                            conversationId:
                                conversation.id,

                            x:
                                rectangle.right -
                                160,

                            y:
                                rectangle.bottom +
                                6
                        }
                    }
                )
            );
        }
    );

    article.append(
        openButton,
        optionsButton
    );

    return article;
}

function getConversationPreview(
    conversation
) {
    const messages =
        Array.isArray(
            conversation.messages
        )
            ? conversation.messages
            : [];

    if (!messages.length) {
        return "Ready when you are";
    }

    const latestMessage =
        messages[messages.length - 1];

    const content =
        normalizeText(
            latestMessage?.content
        );

    if (!content) {
        return "Conversation updated";
    }

    return truncateText(
        content,
        52
    );
}

function renderMemoryTray() {
    if (!elements.memoryList) {
        return;
    }

    elements.memoryList
        .replaceChildren();

    const recentConversations =
        appState.conversations.slice(
            0,
            APP_CONFIG.conversation
                .recentConversationLimit
        );

    recentConversations.forEach(
        (conversation, index) => {
            const memoryItem =
                createMemoryItem(
                    conversation,
                    index
                );

            elements.memoryList
                .appendChild(memoryItem);
        }
    );

    if (elements.memoryEmptyState) {
        elements.memoryEmptyState.hidden =
            recentConversations.length > 0;
    }

    updateRecentChatCount();
}

function updateRecentChatCount() {
    if (!elements.recentChatCount) {
        return;
    }

    const count =
        appState.conversations.length;

    elements.recentChatCount.textContent =
        count > 99
            ? "99+"
            : String(count);

    elements.recentChatCount.hidden =
        count === 0;
}

function updateActiveMemoryItem() {
    const memoryItems =
        document.querySelectorAll(
            ".memory-item"
        );

    memoryItems.forEach(item => {
        const isActive =
            item.dataset.conversationId ===
            appState.activeConversationId;

        item.classList.toggle(
            "active",
            isActive
        );

        const openButton =
            item.querySelector(
                ".memory-open-button"
            );

        if (openButton) {
            if (isActive) {
                openButton.setAttribute(
                    "aria-current",
                    "page"
                );
            } else {
                openButton.removeAttribute(
                    "aria-current"
                );
            }
        }
    });
}


/* =========================================================
   33. CONVERSATION SELECTION
========================================================= */

function selectConversationFromMemory(
    conversationId
) {
    const conversation =
        setActiveConversation(
            conversationId
        );

    if (!conversation) {
        showToast({
            title: "Conversation unavailable",
            message:
                "This conversation could not be opened.",
            type: "error"
        });

        return;
    }

    renderActiveConversation();
    updateActiveMemoryItem();

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:close-memory-tray"
        )
    );
}


/* =========================================================
   34. CONVERSATION HEADER
========================================================= */

function updateConversationHeader(
    conversation
) {
    if (!elements.conversationTitle) {
        return;
    }

    elements.conversationTitle.textContent =
        conversation?.title ||
        APP_CONFIG.conversation.defaultTitle;
}


/* =========================================================
   35. SAFE TEXT HELPERS
========================================================= */

function createTextParagraphs(
    content
) {
    const fragment =
        document.createDocumentFragment();

    const normalizedContent =
        String(content || "")
            .replace(/\r\n/g, "\n")
            .trim();

    if (!normalizedContent) {
        return fragment;
    }

    const paragraphs =
        normalizedContent.split(
            /\n{2,}/
        );

    paragraphs.forEach(paragraphText => {
        const paragraph =
            document.createElement("p");

        paragraph.textContent =
            paragraphText.trim();

        fragment.appendChild(paragraph);
    });

    return fragment;
}

function appendSafeTextContent(
    container,
    content
) {
    if (!container) return;

    container.replaceChildren();

    const fragment =
        createTextParagraphs(content);

    container.appendChild(fragment);
}


/* =========================================================
   36. CODE BLOCK DETECTION
========================================================= */

function splitContentIntoBlocks(
    content
) {
    const source =
        String(content || "");

    const blocks = [];

    const pattern =
        /```([\w+-]*)\n?([\s\S]*?)```/g;

    let lastIndex = 0;
    let match = null;

    while (
        (match = pattern.exec(source)) !==
        null
    ) {
        if (match.index > lastIndex) {
            blocks.push({
                type: "text",
                content:
                    source.slice(
                        lastIndex,
                        match.index
                    )
            });
        }

        blocks.push({
            type: "code",
            language:
                match[1] || "code",
            content:
                match[2].replace(
                    /\n$/,
                    ""
                )
        });

        lastIndex =
            pattern.lastIndex;
    }

    if (lastIndex < source.length) {
        blocks.push({
            type: "text",
            content:
                source.slice(lastIndex)
        });
    }

    if (!blocks.length) {
        blocks.push({
            type: "text",
            content: source
        });
    }

    return blocks;
}


/* =========================================================
   37. SAFE ASSISTANT RESPONSE RENDERING
========================================================= */

function renderAssistantContent(
    container,
    content
) {
    if (!container) return;

    container.replaceChildren();

    const blocks =
        splitContentIntoBlocks(content);

    blocks.forEach(block => {
        if (block.type === "code") {
            const codeBlock =
                createCodeBlock(
                    block.language,
                    block.content
                );

            container.appendChild(
                codeBlock
            );

            return;
        }

        const textFragment =
            createTextParagraphs(
                block.content
            );

        container.appendChild(
            textFragment
        );
    });
}

function createCodeBlock(
    language,
    code
) {
    const template =
        document.getElementById(
            "codeBlockTemplate"
        );

    if (!template) {
        const fallback =
            document.createElement("pre");

        const fallbackCode =
            document.createElement("code");

        fallbackCode.textContent = code;
        fallback.appendChild(
            fallbackCode
        );

        return fallback;
    }

    const fragment =
        template.content.cloneNode(
            true
        );

    const codeBlock =
        fragment.querySelector(
            ".nexxorra-code-block"
        );

    const languageLabel =
        fragment.querySelector(
            ".code-language"
        );

    const codeElement =
        fragment.querySelector("code");

    const copyButton =
        fragment.querySelector(
            ".copy-code-button"
        );

    if (languageLabel) {
        languageLabel.textContent =
            language || "Code";
    }

    if (codeElement) {
        codeElement.textContent =
            code || "";
    }

    copyButton?.addEventListener(
        "click",
        async () => {
            const copied =
                await copyTextToClipboard(
                    code
                );

            if (!copied) {
                showToast({
                    title: "Copy failed",
                    message:
                        "The code could not be copied.",
                    type: "error"
                });

                return;
            }

            const label =
                copyButton.querySelector(
                    "span"
                );

            const originalLabel =
                label?.textContent ||
                "Copy";

            if (label) {
                label.textContent =
                    "Copied";
            }

            showToast({
                title: "Code copied",
                message:
                    "The code is now on your clipboard.",
                type: "success",
                duration: 1500
            });

            window.setTimeout(() => {
                if (label) {
                    label.textContent =
                        originalLabel;
                }
            }, 1500);
        }
    );

    return codeBlock;
}


/* =========================================================
   38. CLIPBOARD
========================================================= */

async function copyTextToClipboard(
    text
) {
    const content =
        String(text || "");

    if (!content) {
        return false;
    }

    try {
        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            await navigator.clipboard
                .writeText(content);

            return true;
        }

        const textarea =
            document.createElement(
                "textarea"
            );

        textarea.value = content;

        textarea.setAttribute(
            "readonly",
            ""
        );

        textarea.style.position =
            "fixed";

        textarea.style.opacity = "0";
        textarea.style.pointerEvents =
            "none";

        document.body.appendChild(
            textarea
        );

        textarea.select();

        const successful =
            document.execCommand("copy");

        textarea.remove();

        return successful;
    } catch (error) {
        console.error(
            "Clipboard operation failed:",
            error
        );

        return false;
    }
}


/* =========================================================
   39. USER MESSAGE RENDERING
========================================================= */

function createUserMessageElement(
    message
) {
    const template =
        document.getElementById(
            "userMessageTemplate"
        );

    if (!template) {
        return createFallbackMessageElement(
            message
        );
    }

    const fragment =
        template.content.cloneNode(
            true
        );

    const article =
        fragment.querySelector(
            ".user-turn"
        );

    if (!article) {
        return createFallbackMessageElement(
            message
        );
    }

    article.dataset.messageId =
        message.id;

    const time =
        article.querySelector(
            ".message-time"
        );

    if (time) {
        time.dateTime =
            message.createdAt;

        time.textContent =
            formatMessageTime(
                message.createdAt
            );
    }

    const content =
        article.querySelector(
            ".user-turn-content"
        );

    appendSafeTextContent(
        content,
        message.content
    );

    renderMessageAttachments(
        article,
        message.attachments
    );

    const editButton =
        article.querySelector(
            ".edit-message-button"
        );

    const copyButton =
        article.querySelector(
            ".copy-message-button"
        );

    editButton?.addEventListener(
        "click",
        () => {
            beginEditingUserMessage(
                message
            );
        }
    );

    copyButton?.addEventListener(
        "click",
        async () => {
            const copied =
                await copyTextToClipboard(
                    message.content
                );

            showToast({
                title:
                    copied
                        ? "Message copied"
                        : "Copy failed",

                message:
                    copied
                        ? "Your message was copied."
                        : "The message could not be copied.",

                type:
                    copied
                        ? "success"
                        : "error",

                duration: 1600
            });
        }
    );

    return article;
}


/* =========================================================
   40. ASSISTANT MESSAGE RENDERING
========================================================= */

function createAssistantMessageElement(
    message
) {
    const template =
        document.getElementById(
            "assistantMessageTemplate"
        );

    if (!template) {
        return createFallbackMessageElement(
            message
        );
    }

    const fragment =
        template.content.cloneNode(
            true
        );

    const article =
        fragment.querySelector(
            ".ai-turn"
        );

    if (!article) {
        return createFallbackMessageElement(
            message
        );
    }

    article.dataset.messageId =
        message.id;

    const time =
        article.querySelector(
            ".message-time"
        );

    if (time) {
        time.dateTime =
            message.createdAt;

        time.textContent =
            formatMessageTime(
                message.createdAt
            );
    }

    const modelLabel =
        article.querySelector(
            ".message-model"
        );

    if (modelLabel) {
        modelLabel.textContent =
            getResponseModeLabel(
                message.metadata
                    ?.responseMode ||
                appState.responseMode
            );
    }

    const content =
        article.querySelector(
            ".ai-turn-content"
        );

    renderAssistantContent(
        content,
        message.content
    );

    const copyButton =
        article.querySelector(
            ".copy-response-button"
        );

    const regenerateButton =
        article.querySelector(
            ".regenerate-response-button"
        );

    copyButton?.addEventListener(
        "click",
        async () => {
            const copied =
                await copyTextToClipboard(
                    message.content
                );

            showToast({
                title:
                    copied
                        ? "Response copied"
                        : "Copy failed",

                message:
                    copied
                        ? "nexxorra's response was copied."
                        : "The response could not be copied.",

                type:
                    copied
                        ? "success"
                        : "error",

                duration: 1600
            });
        }
    );

    regenerateButton
        ?.addEventListener(
            "click",
            () => {
                document.dispatchEvent(
                    new CustomEvent(
                        "nexxorra:regenerate-response",
                        {
                            detail: {
                                messageId:
                                    message.id,

                                conversationId:
                                    appState
                                        .activeConversationId
                            }
                        }
                    )
                );
            }
        );

    bindResponseEvaluationButtons(
        article,
        message
    );

    return article;
}


/* =========================================================
   41. FALLBACK MESSAGE
========================================================= */

function createFallbackMessageElement(
    message
) {
    const article =
        document.createElement(
            "article"
        );

    article.className =
        message.role === "assistant"
            ? "ai-turn"
            : "user-turn";

    article.dataset.messageId =
        message.id;

    const index =
        document.createElement("div");

    index.className = "turn-index";
    index.textContent =
        message.role === "assistant"
            ? "AI"
            : "YOU";

    const main =
        document.createElement("div");

    main.className = "turn-main";

    const content =
        document.createElement("div");

    content.className =
        message.role === "assistant"
            ? "ai-turn-content"
            : "user-turn-content";

    if (message.role === "assistant") {
        renderAssistantContent(
            content,
            message.content
        );
    } else {
        appendSafeTextContent(
            content,
            message.content
        );
    }

    main.appendChild(content);

    article.append(
        index,
        main
    );

    return article;
}


/* =========================================================
   42. ATTACHMENTS INSIDE SENT MESSAGES
========================================================= */

function renderMessageAttachments(
    article,
    attachments
) {
    const attachmentList =
        article.querySelector(
            ".message-attachment-list"
        );

    if (
        !attachmentList ||
        !Array.isArray(attachments) ||
        attachments.length === 0
    ) {
        return;
    }

    attachmentList.replaceChildren();

    attachments.forEach(
        attachment => {
            const token =
                document.createElement(
                    "span"
                );

            token.className =
                "message-attachment-token";

            const icon =
                document.createElement("i");

            icon.className =
                "fa-regular fa-file";

            icon.setAttribute(
                "aria-hidden",
                "true"
            );

            const name =
                document.createElement(
                    "span"
                );

            name.textContent =
                attachment.name ||
                "Attachment";

            token.append(
                icon,
                name
            );

            attachmentList.appendChild(
                token
            );
        }
    );

    attachmentList.hidden = false;
}


/* =========================================================
   43. RESPONSE FEEDBACK
========================================================= */

function bindResponseEvaluationButtons(
    article,
    message
) {
    const buttons =
        article.querySelectorAll(
            ".response-evaluation button"
        );

    buttons.forEach(
        (button, index) => {
            const feedback =
                index === 0
                    ? "positive"
                    : "negative";

            button.addEventListener(
                "click",
                () => {
                    buttons.forEach(
                        item => {
                            item.setAttribute(
                                "aria-pressed",
                                String(
                                    item ===
                                        button
                                )
                            );
                        }
                    );

                    document.dispatchEvent(
                        new CustomEvent(
                            "nexxorra:response-feedback",
                            {
                                detail: {
                                    messageId:
                                        message.id,

                                    conversationId:
                                        appState
                                            .activeConversationId,

                                    feedback
                                }
                            }
                        )
                    );

                    showToast({
                        title:
                            "Feedback recorded",

                        message:
                            "Thanks for helping improve nexxorra.",

                        type: "success",
                        duration: 1700
                    });
                }
            );
        }
    );
}


/* =========================================================
   44. EDIT USER MESSAGE
========================================================= */

function beginEditingUserMessage(
    message
) {
    if (!elements.messageInput) {
        return;
    }

    elements.messageInput.value =
        message.content;

    resizeMessageInput();

    elements.messageInput.focus();

    elements.messageInput.setSelectionRange(
        elements.messageInput.value.length,
        elements.messageInput.value.length
    );

    appState.lastUserMessage =
        message;

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:user-message-edit",
            {
                detail: {
                    messageId:
                        message.id,

                    conversationId:
                        appState
                            .activeConversationId
                }
            }
        )
    );

    showToast({
        title: "Message ready to edit",
        message:
            "Update the text and send it again.",
        type: "info",
        duration: 2200
    });
}


/* =========================================================
   45. COMPLETE CONVERSATION RENDERING
========================================================= */

function renderActiveConversation({
    scrollToBottom = false
} = {}) {
    const conversation =
        getActiveConversation();

    updateConversationHeader(
        conversation
    );

    if (
        !conversation ||
        !Array.isArray(
            conversation.messages
        ) ||
        conversation.messages.length === 0
    ) {
        showWelcomeState();
        updateActiveMemoryItem();
        return;
    }

    hideWelcomeState();

    if (!elements.conversationStream) {
        return;
    }

    elements.conversationStream
        .replaceChildren();

    conversation.messages.forEach(
        message => {
            let messageElement = null;

            if (message.role === "user") {
                messageElement =
                    createUserMessageElement(
                        message
                    );
            } else if (
                message.role === "assistant"
            ) {
                messageElement =
                    createAssistantMessageElement(
                        message
                    );
            }

            if (messageElement) {
                elements
                    .conversationStream
                    .appendChild(
                        messageElement
                    );
            }
        }
    );

    elements.conversationStream.hidden =
        false;

    updateActiveMemoryItem();

    if (scrollToBottom) {
        window.requestAnimationFrame(
            () => {
                scrollConversationToEnd({
                    behavior: "auto"
                });
            }
        );
    }
}


/* =========================================================
   46. WELCOME STATE
========================================================= */

function showWelcomeState() {
    if (elements.welcomeState) {
        elements.welcomeState.hidden =
            false;
    }

    if (elements.conversationStream) {
        elements.conversationStream.hidden =
            true;

        elements.conversationStream
            .replaceChildren();
    }
}

function hideWelcomeState() {
    if (elements.welcomeState) {
        elements.welcomeState.hidden =
            true;
    }

    if (elements.conversationStream) {
        elements.conversationStream.hidden =
            false;
    }
}


/* =========================================================
   47. APPEND SINGLE MESSAGE TO UI
========================================================= */

function appendMessageToInterface(
    message,
    {
        scroll = true
    } = {}
) {
    if (!elements.conversationStream) {
        return null;
    }

    hideWelcomeState();

    let messageElement = null;

    if (message.role === "user") {
        messageElement =
            createUserMessageElement(
                message
            );
    } else if (
        message.role === "assistant"
    ) {
        messageElement =
            createAssistantMessageElement(
                message
            );
    }

    if (!messageElement) {
        return null;
    }

    elements.conversationStream
        .appendChild(messageElement);

    if (scroll) {
        window.requestAnimationFrame(
            () => {
                scrollConversationToEnd();
            }
        );
    }

    return messageElement;
}


/* =========================================================
   48. SUGGESTED PROMPTS
========================================================= */

function bindSuggestedPromptEvents() {
    const promptButtons =
        document.querySelectorAll(
            ".prompt-path"
        );

    promptButtons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const prompt =
                    button.dataset.prompt
                        ?.trim();

                if (!prompt) {
                    return;
                }

                useSuggestedPrompt(
                    prompt
                );
            }
        );
    });
}

function useSuggestedPrompt(prompt) {
    if (
        !elements.messageInput ||
        !elements.messageForm
    ) {
        return;
    }

    elements.messageInput.value =
        prompt;

    resizeMessageInput();

    if (elements.sendMessageButton) {
        elements.sendMessageButton
            .disabled = false;
    }

    appState.pendingPrompt = prompt;

    elements.messageInput.focus();

    window.setTimeout(() => {
        if (
            elements.messageForm &&
            !appState.generating
        ) {
            elements.messageForm
                .requestSubmit();
        }
    }, 120);
}


/* =========================================================
   49. START NEW CONVERSATION
========================================================= */

function startNewConversation({
    focusInput = true
} = {}) {
    if (appState.generating) {
        stopActiveGeneration();
    }

    clearActiveConversation();
    resetConversationInterface();

    renderMemoryTray();
    updateConversationHeader(null);

    if (
        focusInput &&
        elements.messageInput
    ) {
        window.requestAnimationFrame(
            () => {
                elements.messageInput
                    .focus();
            }
        );
    }
}


/* =========================================================
   50. ENSURE ACTIVE CONVERSATION
========================================================= */

function ensureActiveConversation(
    initialMessage = ""
) {
    let conversation =
        getActiveConversation();

    if (conversation) {
        return conversation;
    }

    conversation =
        createAndActivateConversation({
            title:
                initialMessage
                    ? generateConversationTitle(
                          initialMessage
                      )
                    : APP_CONFIG
                          .conversation
                          .defaultTitle,

            saveImmediately: true
        });

    renderMemoryTray();
    updateConversationHeader(
        conversation
    );

    return conversation;
}


/* =========================================================
   51. CREATE USER MESSAGE FROM FORM
========================================================= */

function createUserMessageFromForm() {
    const content =
        elements.messageInput
            ?.value
            ?.trim() || "";

    const selectedAttachments =
        getSelectedAttachments();

    if (
        !content &&
        selectedAttachments.length === 0
    ) {
        return null;
    }

    const safeContent =
        content.slice(
            0,
            APP_CONFIG.message
                .maximumLength
        );

    const attachments =
        selectedAttachments.map(
            file => ({
                id: createId(
                    "attachment"
                ),

                name: file.name,
                size: file.size,
                type:
                    file.type ||
                    "application/octet-stream",

                lastModified:
                    file.lastModified
            })
        );

    return createMessage({
        role: "user",
        content: safeContent,
        attachments,
        metadata: {
            guestId:
                appState.guestId,

            responseMode:
                appState.responseMode
        }
    });
}


/* =========================================================
   52. INSERT USER MESSAGE
========================================================= */

function insertUserMessage(
    message
) {
    const conversation =
        ensureActiveConversation(
            message.content
        );

    addMessageToConversation(
        conversation.id,
        message
    );

    updateUntitledConversationTitle(
        conversation.id,
        message.content
    );

    appState.lastUserMessage =
        message;

    appendMessageToInterface(
        message
    );

    renderMemoryTray();
    updateConversationHeader(
        getActiveConversation()
    );

    return conversation;
}


/* =========================================================
   53. CLEAR COMPOSER AFTER SEND
========================================================= */

function clearComposerAfterSend() {
    if (elements.messageInput) {
        elements.messageInput.value = "";
        resizeMessageInput();
    }

    if (elements.sendMessageButton) {
        elements.sendMessageButton.disabled =
            true;
    }

    clearAttachments();
}


/* =========================================================
   54. BASIC FORM VALIDATION
========================================================= */

function validateOutgoingMessage(
    message
) {
    if (!message) {
        showToast({
            title: "Nothing to send",
            message:
                "Enter a message or attach a file.",
            type: "warning"
        });

        return false;
    }

    if (
        message.content.length >
        APP_CONFIG.message.maximumLength
    ) {
        showToast({
            title: "Message is too long",
            message:
                `Use fewer than ${APP_CONFIG.message.maximumLength.toLocaleString()} characters.`,
            type: "error"
        });

        return false;
    }

    if (
        hasGuestReachedDailyLimit()
    ) {
        showToast({
            title: "Guest limit reached",
            message:
                "Log in or create an account to continue chatting.",
            type: "warning",
            duration: 5000
        });

        return false;
    }

    const activeConversation =
        getActiveConversation();

    if (
        !appState.isAuthenticated &&
        activeConversation &&
        activeConversation.messages.length >=
            APP_CONFIG.guestLimits
                .maximumMessagesPerConversation
    ) {
        showToast({
            title:
                "Conversation limit reached",

            message:
                "Start a new conversation or sign in to continue.",

            type: "warning",
            duration: 5000
        });

        return false;
    }

    return true;
}


/* =========================================================
   55. MESSAGE FORM SUBMISSION ENTRY
========================================================= */

function handleMessageFormSubmit(
    event
) {
    event.preventDefault();

    if (
        appState.generating ||
        appState.loading
    ) {
        return;
    }

    const userMessage =
        createUserMessageFromForm();

    if (
        !validateOutgoingMessage(
            userMessage
        )
    ) {
        return;
    }

    const conversation =
        insertUserMessage(
            userMessage
        );

    clearComposerAfterSend();

    if (!appState.isAuthenticated) {
        incrementGuestUsage();
    }

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:message-submit",
            {
                detail: {
                    conversation:
                        cloneData(
                            conversation
                        ),

                    message:
                        cloneData(
                            userMessage
                        ),

                    responseMode:
                        appState.responseMode,

                    attachments:
                        userMessage.attachments
                }
            }
        )
    );
}


/* =========================================================
   56. MEMORY CONTEXT MENU BRIDGE
========================================================= */

function bindConversationMenuBridge() {
    document.addEventListener(
        "nexxorra:open-conversation-menu",
        async event => {
            const detail =
                event.detail || {};

            try {
                const uiModule =
                    await import(
                        "./ui.js"
                    );

                if (
                    typeof uiModule
                        .openConversationContextMenu ===
                    "function"
                ) {
                    uiModule
                        .openConversationContextMenu({
                            x:
                                detail.x ||
                                10,

                            y:
                                detail.y ||
                                10,

                            conversationId:
                                detail
                                    .conversationId
                        });
                }
            } catch (error) {
                console.error(
                    "Conversation menu could not open:",
                    error
                );
            }
        }
    );

    document.addEventListener(
        "nexxorra:close-memory-tray",
        async () => {
            try {
                const uiModule =
                    await import(
                        "./ui.js"
                    );

                uiModule.closeMemoryTray?.();
            } catch (error) {
                console.error(
                    "Memory tray could not close:",
                    error
                );
            }
        }
    );
}


/* =========================================================
   57. APPLICATION READY RENDERING
========================================================= */

function handleApplicationReady(
    event
) {
    const detail =
        event.detail || {};

    if (
        Array.isArray(
            detail.conversations
        )
    ) {
        appState.conversations =
            detail.conversations;
    }

    if (
        detail.activeConversation
    ) {
        appState.activeConversation =
            detail.activeConversation;

        appState.activeConversationId =
            detail
                .activeConversation
                .id;
    }

    renderMemoryTray();
    renderActiveConversation({
        scrollToBottom: true
    });
}


/* =========================================================
   58. CONVERSATION EVENT RENDERING
========================================================= */

function bindConversationUIEvents() {
    document.addEventListener(
        "nexxorra:application-ready",
        handleApplicationReady
    );

    document.addEventListener(
        "nexxorra:conversation-list-change",
        () => {
            renderMemoryTray();
            renderActiveConversation();
        }
    );

    document.addEventListener(
        "nexxorra:active-conversation-change",
        event => {
            const conversation =
                event.detail
                    ?.conversation ||
                null;

            if (conversation) {
                appState.activeConversation =
                    conversation;

                appState.activeConversationId =
                    conversation.id;
            } else {
                appState.activeConversation =
                    null;

                appState.activeConversationId =
                    null;
            }

            renderActiveConversation({
                scrollToBottom: true
            });

            renderMemoryTray();
        }
    );

    document.addEventListener(
        "nexxorra:conversation-renamed",
        () => {
            renderMemoryTray();
            updateConversationHeader(
                getActiveConversation()
            );
        }
    );

    document.addEventListener(
        "nexxorra:new-chat",
        () => {
            startNewConversation({
                focusInput: true
            });
        }
    );
}


/* =========================================================
   59. FORM AND PROMPT EVENT BINDING
========================================================= */

function bindConversationInputEvents() {
    elements.messageForm
        ?.addEventListener(
            "submit",
            handleMessageFormSubmit
        );

    bindSuggestedPromptEvents();
}


/* =========================================================
   60. PART 2 INITIALIZATION
========================================================= */

function initializeConversationInterface() {
    bindConversationMenuBridge();
    bindConversationUIEvents();
    bindConversationInputEvents();

    renderMemoryTray();
    renderActiveConversation({
        scrollToBottom: true
    });

    document.documentElement
        .classList
        .add(
            "nexxorra-conversation-ui-ready"
        );
}


/* =========================================================
   61. START PART 2
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeConversationInterface,
        {
            once: true
        }
    );
} else {
    initializeConversationInterface();
}

/* =========================================================
   nexxorra AI — MAIN APPLICATION
   File: index.js
   Part 3: AI Lifecycle, Regenerate, Sync and Final Events
========================================================= */


/* =========================================================
   62. CHAT MODULE LOADING
========================================================= */

let chatModulePromise = null;

async function getChatModule() {
    if (!chatModulePromise) {
        chatModulePromise = import("./chat.js");
    }

    try {
        return await chatModulePromise;
    } catch (error) {
        chatModulePromise = null;

        console.error(
            "nexxorra chat module failed to load:",
            error
        );

        throw new Error(
            "The AI chat service could not be loaded."
        );
    }
}


/* =========================================================
   63. SUPABASE MODULE LOADING
========================================================= */

let supabaseModulePromise = null;

async function getSupabaseModule() {
    if (!supabaseModulePromise) {
        supabaseModulePromise = import(
            "./supabase.js"
        );
    }

    try {
        return await supabaseModulePromise;
    } catch (error) {
        supabaseModulePromise = null;

        console.warn(
            "Supabase module is unavailable:",
            error
        );

        return null;
    }
}


/* =========================================================
   64. CONVERSATION CONTEXT PREPARATION
========================================================= */

function getConversationContext(
    conversation,
    {
        excludeMessageId = null,
        maximumMessages = 24
    } = {}
) {
    if (
        !conversation ||
        !Array.isArray(conversation.messages)
    ) {
        return [];
    }

    return conversation.messages
        .filter(message => {
            if (!message) {
                return false;
            }

            if (
                excludeMessageId &&
                message.id === excludeMessageId
            ) {
                return false;
            }

            return (
                ["user", "assistant", "system"]
                    .includes(message.role) &&
                typeof message.content === "string" &&
                message.content.trim().length > 0 &&
                message.status !== "error"
            );
        })
        .slice(-maximumMessages)
        .map(message => ({
            role: message.role,
            content: message.content
        }));
}


/* =========================================================
   65. ATTACHMENT FILE RESOLUTION
========================================================= */

function getPendingAttachmentFiles() {
    const files = getSelectedAttachments();

    return files.filter(
        file => file instanceof File
    );
}


/* =========================================================
   66. CHAT REQUEST PAYLOAD
========================================================= */

function createChatRequestPayload({
    conversation,
    userMessage,
    attachmentFiles = []
}) {
    const context = getConversationContext(
        conversation
    );

    return {
        conversationId: conversation.id,

        messageId: userMessage.id,

        messages: context,

        responseMode: appState.responseMode,

        guestId: appState.guestId,

        attachments: attachmentFiles,

        metadata: {
            source: conversation.source,

            isAuthenticated:
                appState.isAuthenticated,

            clientTimestamp:
                getCurrentTimestamp()
        }
    };
}


/* =========================================================
   67. ASSISTANT PENDING MESSAGE
========================================================= */

function createPendingAssistantMessage() {
    return createMessage({
        role: "assistant",

        content: "",

        status: "generating",

        metadata: {
            responseMode:
                appState.responseMode,

            startedAt:
                getCurrentTimestamp()
        }
    });
}


/* =========================================================
   68. ASSISTANT MESSAGE ELEMENT LOOKUP
========================================================= */

function getRenderedMessageElement(
    messageId
) {
    if (!messageId) {
        return null;
    }

    return document.querySelector(
        `[data-message-id="${escapeSelectorValue(messageId)}"]`
    );
}


/* =========================================================
   69. STREAMING ASSISTANT ELEMENT
========================================================= */

function createStreamingAssistantElement(
    message
) {
    const messageElement =
        createAssistantMessageElement(
            message
        );

    if (!messageElement) {
        return null;
    }

    messageElement.classList.add(
        "streaming-message"
    );

    const contentElement =
        messageElement.querySelector(
            ".ai-turn-content"
        );

    if (contentElement) {
        contentElement.replaceChildren();

        const cursor =
            document.createElement("span");

        cursor.className =
            "streaming-cursor";

        cursor.setAttribute(
            "aria-hidden",
            "true"
        );

        contentElement.appendChild(cursor);
    }

    const responseEvaluation =
        messageElement.querySelector(
            ".response-evaluation"
        );

    if (responseEvaluation) {
        responseEvaluation.hidden = true;
    }

    const actions =
        messageElement.querySelector(
            ".turn-actions"
        );

    if (actions) {
        actions.hidden = true;
    }

    return messageElement;
}


/* =========================================================
   70. STREAMING CONTENT UPDATE
========================================================= */

function updateStreamingAssistantContent(
    messageId,
    content
) {
    const messageElement =
        getRenderedMessageElement(
            messageId
        );

    if (!messageElement) {
        return;
    }

    const contentElement =
        messageElement.querySelector(
            ".ai-turn-content"
        );

    if (!contentElement) {
        return;
    }

    contentElement.replaceChildren();

    const textNode =
        document.createTextNode(
            content || ""
        );

    const cursor =
        document.createElement("span");

    cursor.className =
        "streaming-cursor";

    cursor.setAttribute(
        "aria-hidden",
        "true"
    );

    contentElement.append(
        textNode,
        cursor
    );

    if (isNearConversationEnd()) {
        scrollConversationToEnd({
            behavior: "auto"
        });
    }
}


/* =========================================================
   71. FINALIZE ASSISTANT ELEMENT
========================================================= */

function finalizeAssistantElement(
    message
) {
    const existingElement =
        getRenderedMessageElement(
            message.id
        );

    const finalElement =
        createAssistantMessageElement(
            message
        );

    if (
        existingElement &&
        finalElement
    ) {
        existingElement.replaceWith(
            finalElement
        );

        return finalElement;
    }

    if (
        finalElement &&
        elements.conversationStream
    ) {
        elements.conversationStream
            .appendChild(finalElement);
    }

    return finalElement;
}


/* =========================================================
   72. ERROR ASSISTANT MESSAGE
========================================================= */

function createAssistantErrorMessage(
    error
) {
    const fallbackMessage =
        getReadableChatError(error);

    return createMessage({
        role: "assistant",

        content: fallbackMessage,

        status: "error",

        metadata: {
            responseMode:
                appState.responseMode,

            errorCode:
                error?.code ||
                error?.status ||
                "unknown_error"
        }
    });
}


/* =========================================================
   73. READABLE CHAT ERRORS
========================================================= */

function getReadableChatError(error) {
    const status =
        Number(
            error?.status ||
            error?.statusCode
        ) || 0;

    const code =
        String(
            error?.code || ""
        ).toLowerCase();

    const message =
        String(
            error?.message || ""
        ).toLowerCase();

    if (
        error?.name === "AbortError" ||
        code === "aborted"
    ) {
        return (
            "The response was stopped before completion."
        );
    }

    if (
        status === 401 ||
        status === 403 ||
        code.includes("unauthorized")
    ) {
        return (
            "nexxorra could not verify this request. " +
            "Please log in again or refresh the page."
        );
    }

    if (
        status === 429 ||
        code.includes("rate") ||
        message.includes("rate limit")
    ) {
        return (
            "nexxorra is receiving too many requests right now. " +
            "Please wait briefly and try again."
        );
    }

    if (
        status >= 500 ||
        code.includes("server")
    ) {
        return (
            "The AI service is temporarily unavailable. " +
            "Please try the message again."
        );
    }

    if (
        message.includes("network") ||
        message.includes("fetch")
    ) {
        return (
            "nexxorra could not reach the server. " +
            "Check your internet connection and try again."
        );
    }

    if (
        message.includes("empty response")
    ) {
        return (
            "nexxorra returned an empty response. " +
            "Please regenerate the answer."
        );
    }

    return (
        "nexxorra could not complete this response. " +
        "Please try again."
    );
}


/* =========================================================
   74. USER-FACING ERROR TOAST
========================================================= */

function showChatErrorToast(error) {
    const status =
        Number(
            error?.status ||
            error?.statusCode
        ) || 0;

    if (
        error?.name === "AbortError"
    ) {
        return;
    }

    if (status === 429) {
        showToast({
            title: "Too many requests",

            message:
                "Wait briefly before sending another message.",

            type: "warning",

            duration: 4500
        });

        return;
    }

    if (
        status === 401 ||
        status === 403
    ) {
        showToast({
            title: "Authentication required",

            message:
                "Log in again and retry your request.",

            type: "error",

            duration: 5000
        });

        return;
    }

    showToast({
        title: "Response failed",

        message:
            "nexxorra could not complete the response.",

        type: "error",

        duration: 4200
    });
}


/* =========================================================
   75. MESSAGE UPDATE INSIDE CONVERSATION
========================================================= */

function updateMessageInConversation(
    conversationId,
    messageId,
    updates = {}
) {
    const conversation =
        getConversationById(
            conversationId
        );

    if (!conversation) {
        return null;
    }

    const nextMessages =
        conversation.messages.map(
            message => {
                if (
                    message.id !== messageId
                ) {
                    return message;
                }

                return {
                    ...message,
                    ...updates,
                    id: message.id
                };
            }
        );

    return updateConversation(
        conversationId,
        {
            messages: nextMessages,
            updatedAt:
                getCurrentTimestamp()
        }
    );
}


/* =========================================================
   76. REMOVE MESSAGES AFTER USER MESSAGE
========================================================= */

function removeMessagesAfterMessage(
    conversationId,
    messageId
) {
    const conversation =
        getConversationById(
            conversationId
        );

    if (!conversation) {
        return null;
    }

    const messageIndex =
        conversation.messages.findIndex(
            message =>
                message.id === messageId
        );

    if (messageIndex === -1) {
        return conversation;
    }

    const nextMessages =
        conversation.messages.slice(
            0,
            messageIndex + 1
        );

    return updateConversation(
        conversationId,
        {
            messages: nextMessages,
            updatedAt:
                getCurrentTimestamp()
        }
    );
}


/* =========================================================
   77. FIND PREVIOUS USER MESSAGE
========================================================= */

function findPreviousUserMessage(
    conversation,
    assistantMessageId
) {
    if (!conversation) {
        return null;
    }

    const assistantIndex =
        conversation.messages.findIndex(
            message =>
                message.id ===
                assistantMessageId
        );

    const searchStart =
        assistantIndex === -1
            ? conversation.messages.length - 1
            : assistantIndex - 1;

    for (
        let index = searchStart;
        index >= 0;
        index -= 1
    ) {
        const message =
            conversation.messages[index];

        if (message.role === "user") {
            return message;
        }
    }

    return null;
}


/* =========================================================
   78. SAVE AUTHENTICATED CONVERSATION
========================================================= */

async function syncConversationToSupabase(
    conversation
) {
    if (
        !appState.isAuthenticated ||
        !conversation
    ) {
        return conversation;
    }

    const supabaseModule =
        await getSupabaseModule();

    if (!supabaseModule) {
        return conversation;
    }

    try {
        if (
            typeof supabaseModule
                .saveConversation ===
            "function"
        ) {
            const savedConversation =
                await supabaseModule
                    .saveConversation(
                        conversation
                    );

            if (
                savedConversation?.id &&
                savedConversation.id !==
                    conversation.id
            ) {
                replaceConversationId(
                    conversation.id,
                    savedConversation.id
                );
            }

            return (
                savedConversation ||
                conversation
            );
        }

        if (
            typeof supabaseModule
                .upsertConversation ===
            "function"
        ) {
            const savedConversation =
                await supabaseModule
                    .upsertConversation(
                        conversation
                    );

            if (
                savedConversation?.id &&
                savedConversation.id !==
                    conversation.id
            ) {
                replaceConversationId(
                    conversation.id,
                    savedConversation.id
                );
            }

            return (
                savedConversation ||
                conversation
            );
        }
    } catch (error) {
        console.error(
            "Conversation sync failed:",
            error
        );

        showToast({
            title: "Conversation not synced",

            message:
                "The chat is visible locally but could not be saved online.",

            type: "warning",

            duration: 4500
        });
    }

    return conversation;
}


/* =========================================================
   79. REPLACE TEMPORARY CONVERSATION ID
========================================================= */

function replaceConversationId(
    oldConversationId,
    newConversationId
) {
    if (
        !oldConversationId ||
        !newConversationId ||
        oldConversationId ===
            newConversationId
    ) {
        return;
    }

    const conversationIndex =
        getConversationIndex(
            oldConversationId
        );

    if (conversationIndex === -1) {
        return;
    }

    const conversation =
        appState.conversations[
            conversationIndex
        ];

    const updatedConversation = {
        ...conversation,
        id: newConversationId,
        source: "supabase"
    };

    appState.conversations[
        conversationIndex
    ] = updatedConversation;

    if (
        appState.activeConversationId ===
        oldConversationId
    ) {
        appState.activeConversationId =
            newConversationId;

        appState.activeConversation =
            updatedConversation;

        saveActiveConversationId(
            newConversationId
        );
    }

    renderMemoryTray();
    updateActiveMemoryItem();
}


/* =========================================================
   80. DELETE AUTHENTICATED CONVERSATION
========================================================= */

async function deleteConversationFromSupabase(
    conversationId
) {
    if (
        !appState.isAuthenticated ||
        !conversationId
    ) {
        return true;
    }

    const supabaseModule =
        await getSupabaseModule();

    if (!supabaseModule) {
        return false;
    }

    try {
        if (
            typeof supabaseModule
                .deleteConversation ===
            "function"
        ) {
            await supabaseModule
                .deleteConversation(
                    conversationId
                );

            return true;
        }
    } catch (error) {
        console.error(
            "Conversation deletion failed:",
            error
        );

        showToast({
            title: "Deletion failed",

            message:
                "The conversation could not be deleted from your account.",

            type: "error"
        });
    }

    return false;
}


/* =========================================================
   81. LOAD AUTHENTICATED CONVERSATIONS
========================================================= */

async function loadAuthenticatedConversations() {
    if (!appState.isAuthenticated) {
        return [];
    }

    const supabaseModule =
        await getSupabaseModule();

    if (!supabaseModule) {
        return [];
    }

    try {
        showGlobalLoader(
            "Loading your conversations"
        );

        let conversations = [];

        if (
            typeof supabaseModule
                .getConversations ===
            "function"
        ) {
            conversations =
                await supabaseModule
                    .getConversations();
        } else if (
            typeof supabaseModule
                .loadUserConversations ===
            "function"
        ) {
            conversations =
                await supabaseModule
                    .loadUserConversations();
        }

        if (!Array.isArray(conversations)) {
            conversations = [];
        }

        appState.conversations =
            conversations
                .map(conversation => {
                    return createConversation({
                        ...conversation,

                        source: "supabase",

                        messages:
                            Array.isArray(
                                conversation.messages
                            )
                                ? conversation.messages
                                : []
                    });
                })
                .sort(
                    (first, second) => {
                        return (
                            new Date(
                                second.updatedAt
                            ).getTime() -
                            new Date(
                                first.updatedAt
                            ).getTime()
                        );
                    }
                );

        restoreInitialConversation();

        renderMemoryTray();

        renderActiveConversation({
            scrollToBottom: true
        });

        return appState.conversations;
    } catch (error) {
        console.error(
            "Authenticated conversation loading failed:",
            error
        );

        showToast({
            title: "History unavailable",

            message:
                "nexxorra could not load your synced conversations.",

            type: "error",

            duration: 4500
        });

        return [];
    } finally {
        hideGlobalLoader();
    }
}


/* =========================================================
   82. NORMALIZE CHAT MODULE RESPONSE
========================================================= */

function normalizeChatResult(
    result
) {
    if (typeof result === "string") {
        return {
            content: result,
            metadata: {}
        };
    }

    if (
        !result ||
        typeof result !== "object"
    ) {
        return {
            content: "",
            metadata: {}
        };
    }

    const content =
        result.content ||
        result.message ||
        result.response ||
        result.output ||
        result.text ||
        "";

    return {
        content:
            typeof content === "string"
                ? content
                : String(content || ""),

        metadata:
            result.metadata &&
            typeof result.metadata === "object"
                ? result.metadata
                : {},

        conversationId:
            result.conversationId ||
            result.conversation_id ||
            null,

        usage:
            result.usage || null
    };
}


/* =========================================================
   83. NON-STREAMING CHAT REQUEST
========================================================= */

async function requestCompleteAIResponse({
    chatModule,
    payload,
    signal
}) {
    if (
        typeof chatModule.sendChatRequest ===
        "function"
    ) {
        return await chatModule
            .sendChatRequest(
                payload,
                {
                    signal
                }
            );
    }

    if (
        typeof chatModule.requestAIResponse ===
        "function"
    ) {
        return await chatModule
            .requestAIResponse(
                payload,
                {
                    signal
                }
            );
    }

    if (
        typeof chatModule.generateResponse ===
        "function"
    ) {
        return await chatModule
            .generateResponse(
                payload,
                {
                    signal
                }
            );
    }

    throw new Error(
        "chat.js does not export a supported chat request function."
    );
}


/* =========================================================
   84. STREAMING CHAT REQUEST
========================================================= */

async function requestStreamingAIResponse({
    chatModule,
    payload,
    signal,
    onChunk
}) {
    if (
        typeof chatModule.streamChatResponse !==
        "function"
    ) {
        return null;
    }

    return await chatModule
        .streamChatResponse(
            payload,
            {
                signal,
                onChunk
            }
        );
}


/* =========================================================
   85. MAIN AI RESPONSE GENERATION
========================================================= */

async function generateAssistantResponse({
    conversationId,
    userMessage,
    attachmentFiles = []
}) {
    const conversation =
        getConversationById(
            conversationId
        );

    if (!conversation) {
        throw new Error(
            "The active conversation no longer exists."
        );
    }

    const pendingMessage =
        createPendingAssistantMessage();

    addMessageToConversation(
        conversationId,
        pendingMessage
    );

    appState.lastAssistantMessage =
        pendingMessage;

    hideWelcomeState();

    if (elements.conversationStream) {
        const streamingElement =
            createStreamingAssistantElement(
                pendingMessage
            );

        if (streamingElement) {
            elements.conversationStream
                .appendChild(
                    streamingElement
                );
        }
    }

    setGeneratingState(true);

    scrollConversationToEnd();

    const abortController =
        new AbortController();

    appState.abortController =
        abortController;

    let streamedContent = "";

    try {
        const chatModule =
            await getChatModule();

        const latestConversation =
            getConversationById(
                conversationId
            );

        const payload =
            createChatRequestPayload({
                conversation:
                    latestConversation,

                userMessage,

                attachmentFiles
            });

        let responseResult =
            await requestStreamingAIResponse({
                chatModule,

                payload,

                signal:
                    abortController.signal,

                onChunk: chunk => {
                    if (
                        abortController
                            .signal
                            .aborted
                    ) {
                        return;
                    }

                    const chunkContent =
                        typeof chunk ===
                        "string"
                            ? chunk
                            : chunk?.content ||
                              chunk?.text ||
                              chunk?.delta ||
                              "";

                    if (!chunkContent) {
                        return;
                    }

                    streamedContent +=
                        chunkContent;

                    updateStreamingAssistantContent(
                        pendingMessage.id,
                        streamedContent
                    );
                }
            });

        if (responseResult === null) {
            responseResult =
                await requestCompleteAIResponse({
                    chatModule,

                    payload,

                    signal:
                        abortController.signal
                });
        }

        const normalizedResult =
            normalizeChatResult(
                responseResult
            );

        const finalContent =
            normalizeText(
                streamedContent
            )
                ? streamedContent
                : normalizedResult.content;

        if (!finalContent.trim()) {
            throw new Error(
                "Empty response received."
            );
        }

        const completedMessage = {
            ...pendingMessage,

            content: finalContent,

            status: "completed",

            metadata: {
                ...pendingMessage.metadata,

                ...normalizedResult.metadata,

                responseMode:
                    appState.responseMode,

                usage:
                    normalizedResult.usage,

                completedAt:
                    getCurrentTimestamp()
            }
        };

        updateMessageInConversation(
            conversationId,
            pendingMessage.id,
            completedMessage
        );

        appState.lastAssistantMessage =
            completedMessage;

        finalizeAssistantElement(
            completedMessage
        );

        const updatedConversation =
            getConversationById(
                conversationId
            );

        await syncConversationToSupabase(
            updatedConversation
        );

        renderMemoryTray();

        updateConversationHeader(
            getActiveConversation()
        );

        document.dispatchEvent(
            new CustomEvent(
                "nexxorra:response-complete",
                {
                    detail: {
                        conversationId,

                        userMessage:
                            cloneData(
                                userMessage
                            ),

                        assistantMessage:
                            cloneData(
                                completedMessage
                            )
                    }
                }
            )
        );

        return completedMessage;
    } catch (error) {
        const wasAborted =
            error?.name === "AbortError" ||
            abortController.signal.aborted;

        if (wasAborted) {
            const stoppedContent =
                streamedContent.trim();

            if (stoppedContent) {
                const stoppedMessage = {
                    ...pendingMessage,

                    content:
                        stoppedContent,

                    status: "stopped",

                    metadata: {
                        ...pendingMessage.metadata,

                        stoppedAt:
                            getCurrentTimestamp()
                    }
                };

                updateMessageInConversation(
                    conversationId,
                    pendingMessage.id,
                    stoppedMessage
                );

                finalizeAssistantElement(
                    stoppedMessage
                );

                return stoppedMessage;
            }

            removeMessageFromConversation(
                conversationId,
                pendingMessage.id
            );

            getRenderedMessageElement(
                pendingMessage.id
            )?.remove();

            return null;
        }

        console.error(
            "AI response generation failed:",
            error
        );

        const errorMessage =
            createAssistantErrorMessage(
                error
            );

        updateMessageInConversation(
            conversationId,
            pendingMessage.id,
            {
                ...errorMessage,
                id: pendingMessage.id
            }
        );

        errorMessage.id =
            pendingMessage.id;

        finalizeAssistantElement(
            errorMessage
        );

        showChatErrorToast(error);

        return errorMessage;
    } finally {
        appState.abortController = null;

        setGeneratingState(false);

        renderMemoryTray();

        window.requestAnimationFrame(
            () => {
                scrollConversationToEnd();
            }
        );
    }
}


/* =========================================================
   86. MESSAGE SUBMISSION HANDLER
========================================================= */

async function handleAIMessageSubmission(
    event
) {
    const detail =
        event.detail || {};

    const conversation =
        detail.conversation;

    const userMessage =
        detail.message;

    if (
        !conversation ||
        !userMessage
    ) {
        return;
    }

    const attachmentFiles =
        getPendingAttachmentFiles();

    try {
        await syncConversationToSupabase(
            getConversationById(
                conversation.id
            )
        );

        await generateAssistantResponse({
            conversationId:
                appState
                    .activeConversationId ||
                conversation.id,

            userMessage,

            attachmentFiles
        });
    } catch (error) {
        console.error(
            "Message submission lifecycle failed:",
            error
        );

        setGeneratingState(false);

        showChatErrorToast(error);
    }
}


/* =========================================================
   87. REGENERATE RESPONSE
========================================================= */

async function regenerateAssistantResponse({
    assistantMessageId,
    conversationId
}) {
    if (appState.generating) {
        showToast({
            title: "Response in progress",

            message:
                "Stop the current response before regenerating another.",

            type: "warning"
        });

        return;
    }

    const conversation =
        getConversationById(
            conversationId
        );

    if (!conversation) {
        showToast({
            title: "Conversation unavailable",

            message:
                "The response cannot be regenerated.",

            type: "error"
        });

        return;
    }

    const userMessage =
        findPreviousUserMessage(
            conversation,
            assistantMessageId
        );

    if (!userMessage) {
        showToast({
            title: "Message unavailable",

            message:
                "nexxorra could not find the original question.",

            type: "error"
        });

        return;
    }

    removeMessagesAfterMessage(
        conversationId,
        userMessage.id
    );

    renderActiveConversation({
        scrollToBottom: true
    });

    await generateAssistantResponse({
        conversationId,
        userMessage,
        attachmentFiles: []
    });
}


/* =========================================================
   88. USER MESSAGE EDIT RESUBMISSION
========================================================= */

function handleEditedMessageSubmission(
    submittedMessage
) {
    const editingMessage =
        appState.lastUserMessage;

    if (
        !editingMessage ||
        !submittedMessage
    ) {
        return false;
    }

    const conversation =
        getActiveConversation();

    if (!conversation) {
        appState.lastUserMessage = null;
        return false;
    }

    const originalIndex =
        conversation.messages.findIndex(
            message =>
                message.id ===
                editingMessage.id
        );

    if (originalIndex === -1) {
        appState.lastUserMessage = null;
        return false;
    }

    const editedMessage = {
        ...editingMessage,

        content:
            submittedMessage.content,

        attachments:
            submittedMessage.attachments,

        createdAt:
            getCurrentTimestamp(),

        metadata: {
            ...editingMessage.metadata,

            edited: true,

            editedAt:
                getCurrentTimestamp()
        }
    };

    const nextMessages = [
        ...conversation.messages.slice(
            0,
            originalIndex
        ),

        editedMessage
    ];

    updateConversation(
        conversation.id,
        {
            messages: nextMessages
        }
    );

    appState.lastUserMessage = null;

    renderActiveConversation({
        scrollToBottom: true
    });

    document.dispatchEvent(
        new CustomEvent(
            "nexxorra:edited-message-ready",
            {
                detail: {
                    conversationId:
                        conversation.id,

                    message:
                        cloneData(
                            editedMessage
                        )
                }
            }
        )
    );

    return true;
}


/* =========================================================
   89. HANDLE EDITED MESSAGE GENERATION
========================================================= */

async function handleEditedMessageReady(
    event
) {
    const conversationId =
        event.detail
            ?.conversationId;

    const message =
        event.detail?.message;

    if (
        !conversationId ||
        !message
    ) {
        return;
    }

    await generateAssistantResponse({
        conversationId,
        userMessage: message,
        attachmentFiles: []
    });
}


/* =========================================================
   90. INTERCEPT EDITED FORM SUBMISSION
========================================================= */

function bindEditedMessageInterceptor() {
    document.addEventListener(
        "nexxorra:message-submit",
        event => {
            if (!appState.lastUserMessage) {
                return;
            }

            const message =
                event.detail?.message;

            const conversation =
                event.detail?.conversation;

            if (
                !message ||
                !conversation
            ) {
                return;
            }

            const temporaryMessageIndex =
                conversation.messages
                    .findIndex(
                        item =>
                            item.id ===
                            message.id
                    );

            if (
                temporaryMessageIndex !== -1
            ) {
                conversation.messages.splice(
                    temporaryMessageIndex,
                    1
                );

                updateConversation(
                    conversation.id,
                    {
                        messages:
                            conversation.messages
                    }
                );
            }

            handleEditedMessageSubmission(
                message
            );
        },
        {
            capture: true
        }
    );
}


/* =========================================================
   91. RESPONSE FEEDBACK SYNC
========================================================= */

async function syncResponseFeedback(
    event
) {
    if (!appState.isAuthenticated) {
        return;
    }

    const detail =
        event.detail || {};

    const supabaseModule =
        await getSupabaseModule();

    if (
        !supabaseModule ||
        typeof supabaseModule
            .saveResponseFeedback !==
            "function"
    ) {
        return;
    }

    try {
        await supabaseModule
            .saveResponseFeedback({
                conversationId:
                    detail.conversationId,

                messageId:
                    detail.messageId,

                feedback:
                    detail.feedback
            });
    } catch (error) {
        console.warn(
            "Response feedback sync failed:",
            error
        );
    }
}


/* =========================================================
   92. RENAME SYNC
========================================================= */

async function syncConversationRename(
    event
) {
    if (!appState.isAuthenticated) {
        return;
    }

    const conversationId =
        event.detail
            ?.conversationId;

    const title =
        event.detail?.title;

    if (
        !conversationId ||
        !title
    ) {
        return;
    }

    const supabaseModule =
        await getSupabaseModule();

    if (
        !supabaseModule ||
        typeof supabaseModule
            .renameConversation !==
            "function"
    ) {
        await syncConversationToSupabase(
            getConversationById(
                conversationId
            )
        );

        return;
    }

    try {
        await supabaseModule
            .renameConversation(
                conversationId,
                title
            );
    } catch (error) {
        console.error(
            "Conversation rename sync failed:",
            error
        );

        showToast({
            title: "Rename not synced",

            message:
                "The new name could not be saved online.",

            type: "warning"
        });
    }
}


/* =========================================================
   93. DELETE EVENT WITH REMOTE SYNC
========================================================= */

async function handleRemoteConversationDelete(
    event
) {
    const conversationId =
        event.detail
            ?.conversationId;

    if (!conversationId) {
        return;
    }

    await deleteConversationFromSupabase(
        conversationId
    );
}


/* =========================================================
   94. AUTHENTICATION SWITCH
========================================================= */

async function handleAuthenticationChange(
    event
) {
    const authenticated =
        Boolean(
            event.detail
                ?.isAuthenticated
        );

    if (authenticated) {
        await loadAuthenticatedConversations();
        return;
    }

    loadLocalConversations();

    restoreInitialConversation();

    renderMemoryTray();

    renderActiveConversation({
        scrollToBottom: true
    });
}


/* =========================================================
   95. SHARE CONVERSATION
========================================================= */

async function shareActiveConversation() {
    const conversation =
        getActiveConversation();

    if (!conversation) {
        showToast({
            title: "Nothing to share",

            message:
                "Start a conversation before sharing it.",

            type: "warning"
        });

        return;
    }

    const shareText =
        buildConversationShareText(
            conversation
        );

    try {
        if (
            navigator.share &&
            window.isSecureContext
        ) {
            await navigator.share({
                title:
                    conversation.title,

                text: shareText
            });

            return;
        }

        const copied =
            await copyTextToClipboard(
                shareText
            );

        showToast({
            title:
                copied
                    ? "Conversation copied"
                    : "Share failed",

            message:
                copied
                    ? "The conversation text is ready to paste."
                    : "The conversation could not be copied.",

            type:
                copied
                    ? "success"
                    : "error"
        });
    } catch (error) {
        if (
            error?.name === "AbortError"
        ) {
            return;
        }

        console.error(
            "Conversation sharing failed:",
            error
        );

        showToast({
            title: "Share failed",

            message:
                "The conversation could not be shared.",

            type: "error"
        });
    }
}

function buildConversationShareText(
    conversation
) {
    const lines = [
        conversation.title,
        ""
    ];

    conversation.messages.forEach(
        message => {
            if (
                !["user", "assistant"]
                    .includes(message.role)
            ) {
                return;
            }

            const speaker =
                message.role === "user"
                    ? "You"
                    : "nexxorra";

            lines.push(
                `${speaker}:`
            );

            lines.push(
                message.content
            );

            lines.push("");
        }
    );

    lines.push(
        "Created with nexxorra AI"
    );

    return lines.join("\n");
}


/* =========================================================
   96. VOICE INPUT
========================================================= */

let speechRecognition = null;

function getSpeechRecognitionConstructor() {
    return (
        window.SpeechRecognition ||
        window.webkitSpeechRecognition ||
        null
    );
}

function initializeVoiceInput() {
    const voiceButton =
        document.getElementById(
            "voiceInputButton"
        );

    if (!voiceButton) {
        return;
    }

    const SpeechRecognition =
        getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
        voiceButton.addEventListener(
            "click",
            () => {
                showToast({
                    title: "Voice input unavailable",

                    message:
                        "This browser does not support speech recognition.",

                    type: "warning"
                });
            }
        );

        return;
    }

    speechRecognition =
        new SpeechRecognition();

    speechRecognition.continuous =
        false;

    speechRecognition.interimResults =
        true;

    speechRecognition.lang =
        document.documentElement.lang ||
        "en-US";

    let originalText = "";

    voiceButton.addEventListener(
        "click",
        () => {
            if (
                voiceButton.getAttribute(
                    "aria-pressed"
                ) === "true"
            ) {
                speechRecognition.stop();
                return;
            }

            originalText =
                elements.messageInput
                    ?.value || "";

            try {
                speechRecognition.start();
            } catch (error) {
                console.warn(
                    "Speech recognition could not start:",
                    error
                );
            }
        }
    );

    speechRecognition.addEventListener(
        "start",
        async () => {
            const uiModule =
                await import(
                    "./ui.js"
                );

            uiModule
                .setVoiceInputActive?.(
                    true
                );

            showToast({
                title: "Listening",

                message:
                    "Speak naturally. nexxorra will add your words to the message.",

                type: "info",

                duration: 1800
            });
        }
    );

    speechRecognition.addEventListener(
        "result",
        event => {
            let transcript = "";

            for (
                let index =
                    event.resultIndex;
                index <
                    event.results.length;
                index += 1
            ) {
                transcript +=
                    event.results[index][0]
                        .transcript;
            }

            if (!elements.messageInput) {
                return;
            }

            const spacing =
                originalText.trim()
                    ? " "
                    : "";

            elements.messageInput.value =
                `${originalText}${spacing}${transcript}`
                    .trimStart();

            resizeMessageInput();

            elements.sendMessageButton
                .disabled =
                !elements.messageInput
                    .value
                    .trim();
        }
    );

    speechRecognition.addEventListener(
        "end",
        async () => {
            const uiModule =
                await import(
                    "./ui.js"
                );

            uiModule
                .setVoiceInputActive?.(
                    false
                );
        }
    );

    speechRecognition.addEventListener(
        "error",
        async event => {
            const uiModule =
                await import(
                    "./ui.js"
                );

            uiModule
                .setVoiceInputActive?.(
                    false
                );

            if (
                event.error ===
                "not-allowed"
            ) {
                showToast({
                    title: "Microphone blocked",

                    message:
                        "Allow microphone access in your browser settings.",

                    type: "error"
                });

                return;
            }

            if (
                event.error !==
                "no-speech"
            ) {
                showToast({
                    title: "Voice input stopped",

                    message:
                        "nexxorra could not understand the audio.",

                    type: "warning"
                });
            }
        }
    );
}


/* =========================================================
   97. ATTACHMENT MESSAGE LIMITATION NOTICE
========================================================= */

function bindAttachmentNotice() {
    document
        .getElementById(
            "attachmentInput"
        )
        ?.addEventListener(
            "change",
            event => {
                const files =
                    event.target.files;

                if (!files?.length) {
                    return;
                }

                const unsupportedForGuest =
                    !appState
                        .isAuthenticated &&
                    [...files].some(
                        file =>
                            file.size >
                            5 *
                                1024 *
                                1024
                    );

                if (
                    unsupportedForGuest
                ) {
                    showToast({
                        title:
                            "Large guest attachment",

                        message:
                            "Large files may require a signed-in account.",

                        type: "warning",

                        duration: 3500
                    });
                }
            }
        );
}


/* =========================================================
   98. UNLOAD PROTECTION
========================================================= */

function handleBeforeUnload(
    event
) {
    if (!appState.generating) {
        return;
    }

    event.preventDefault();

    event.returnValue = "";
}


/* =========================================================
   99. ONLINE AND OFFLINE STATUS
========================================================= */

function bindNetworkStatusEvents() {
    window.addEventListener(
        "offline",
        () => {
            showToast({
                title: "You are offline",

                message:
                    "New AI responses will be unavailable until the connection returns.",

                type: "warning",

                duration: 0
            });
        }
    );

    window.addEventListener(
        "online",
        () => {
            showToast({
                title: "Back online",

                message:
                    "nexxorra can connect to the AI service again.",

                type: "success",

                duration: 2200
            });
        }
    );
}


/* =========================================================
   100. FINAL EVENT BINDINGS
========================================================= */

function bindFinalApplicationEvents() {
    document.addEventListener(
        "nexxorra:message-submit",
        handleAIMessageSubmission
    );

    document.addEventListener(
        "nexxorra:edited-message-ready",
        handleEditedMessageReady
    );

    document.addEventListener(
        "nexxorra:regenerate-response",
        event => {
            regenerateAssistantResponse({
                assistantMessageId:
                    event.detail
                        ?.messageId,

                conversationId:
                    event.detail
                        ?.conversationId
            });
        }
    );

    document.addEventListener(
        "nexxorra:response-feedback",
        syncResponseFeedback
    );

    document.addEventListener(
        "nexxorra:conversation-renamed",
        syncConversationRename
    );

    document.addEventListener(
        "nexxorra:conversation-delete",
        handleRemoteConversationDelete
    );

    document.addEventListener(
        "nexxorra:authentication-change",
        handleAuthenticationChange
    );

    document
        .getElementById(
            "shareConversationButton"
        )
        ?.addEventListener(
            "click",
            shareActiveConversation
        );

    window.addEventListener(
        "beforeunload",
        handleBeforeUnload
    );

    bindNetworkStatusEvents();
}


/* =========================================================
   101. FINAL INITIALIZATION
========================================================= */

function initializeFinalApplicationLayer() {
    bindEditedMessageInterceptor();
    bindFinalApplicationEvents();
    initializeVoiceInput();
    bindAttachmentNotice();

    if (
        appState.isAuthenticated
    ) {
        loadAuthenticatedConversations();
    }

    document.documentElement
        .classList.add(
            "nexxorra-ai-layer-ready"
        );
}


/* =========================================================
   102. START PART 3
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeFinalApplicationLayer,
        {
            once: true
        }
    );
} else {
    initializeFinalApplicationLayer();
}