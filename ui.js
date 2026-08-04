/* =========================================================
   NEXORA AI — UI CONTROLLER
   File: ui.js
========================================================= */

const uiState = {
    selectedConversationId: null,
    activeModalId: null,
    selectedResponseMode: "balanced",
    attachments: [],
    lastFocusedElement: null
};


/* =========================================================
   1. DOM HELPERS
========================================================= */

function getElement(id) {
    return document.getElementById(id);
}

function getElements(selector, parent = document) {
    return [...parent.querySelectorAll(selector)];
}

function setHidden(element, hidden) {
    if (!element) return;

    element.hidden = hidden;
}

function setExpanded(element, expanded) {
    if (!element) return;

    element.setAttribute("aria-expanded", String(expanded));
}

function setPressed(element, pressed) {
    if (!element) return;

    element.setAttribute("aria-pressed", String(pressed));
}

function focusElement(element) {
    if (!element) return;

    window.requestAnimationFrame(() => {
        element.focus();
    });
}


/* =========================================================
   2. TOAST NOTIFICATIONS
========================================================= */

export function showToast({
    title = "Nexora",
    message = "",
    type = "info",
    duration = 3200
} = {}) {
    const toastRegion = getElement("toastRegion");

    if (!toastRegion) return;

    const toast = document.createElement("article");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");

    const iconWrapper = document.createElement("span");
    iconWrapper.className = "toast-icon";

    const icon = document.createElement("i");
    icon.setAttribute("aria-hidden", "true");

    const iconClasses = {
        success: ["fa-solid", "fa-check"],
        error: ["fa-solid", "fa-triangle-exclamation"],
        warning: ["fa-solid", "fa-circle-exclamation"],
        info: ["fa-solid", "fa-circle-info"]
    };

    icon.classList.add(
        ...(iconClasses[type] || iconClasses.info)
    );

    iconWrapper.appendChild(icon);

    const content = document.createElement("div");
    content.className = "toast-content";

    const toastTitle = document.createElement("strong");
    toastTitle.textContent = title;

    const toastMessage = document.createElement("span");
    toastMessage.textContent = message;

    content.append(toastTitle);

    if (message) {
        content.append(toastMessage);
    }

    const closeButton = document.createElement("button");
    closeButton.className = "toast-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close notification");

    const closeIcon = document.createElement("i");
    closeIcon.className = "fa-solid fa-xmark";
    closeIcon.setAttribute("aria-hidden", "true");

    closeButton.appendChild(closeIcon);

    toast.append(iconWrapper, content, closeButton);
    toastRegion.appendChild(toast);

    let timeoutId = null;

    function removeToast() {
        if (!toast.isConnected) return;

        toast.style.opacity = "0";
        toast.style.transform = "translateX(12px)";

        window.setTimeout(() => {
            toast.remove();
        }, 170);
    }

    closeButton.addEventListener("click", removeToast);

    if (duration > 0) {
        timeoutId = window.setTimeout(removeToast, duration);
    }

    toast.addEventListener("mouseenter", () => {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
    });

    toast.addEventListener("mouseleave", () => {
        if (duration > 0) {
            timeoutId = window.setTimeout(removeToast, 1200);
        }
    });
}


/* =========================================================
   3. GLOBAL LOADER
========================================================= */

export function showGlobalLoader(text = "Loading Nexora") {
    const loader = getElement("globalLoader");

    if (!loader) return;

    const textNode = [...loader.childNodes].find(
        node => node.nodeType === Node.TEXT_NODE
    );

    if (textNode) {
        textNode.textContent = ` ${text}`;
    }

    loader.hidden = false;
}

export function hideGlobalLoader() {
    const loader = getElement("globalLoader");

    if (!loader) return;

    loader.hidden = true;
}


/* =========================================================
   4. MEMORY TRAY
========================================================= */

export function openMemoryTray() {
    const shell = getElement("nexoraShell");
    const memoryTray = getElement("memoryTray");
    const memoryTrayButton = getElement("memoryTrayButton");
    const mobileBackdrop = getElement("mobileTrayBackdrop");
    const searchInput = getElement("memorySearchInput");

    if (!shell || !memoryTray) return;

    shell.classList.add("memory-open");
    memoryTray.setAttribute("aria-hidden", "false");

    setExpanded(memoryTrayButton, true);

    if (mobileBackdrop && window.innerWidth > 760) {
        mobileBackdrop.hidden = false;
    }

    window.setTimeout(() => {
        searchInput?.focus();
    }, 220);
}

export function closeMemoryTray() {
    const shell = getElement("nexoraShell");
    const memoryTray = getElement("memoryTray");
    const memoryTrayButton = getElement("memoryTrayButton");
    const mobileBackdrop = getElement("mobileTrayBackdrop");

    if (!shell || !memoryTray) return;

    shell.classList.remove("memory-open");
    memoryTray.setAttribute("aria-hidden", "true");

    setExpanded(memoryTrayButton, false);

    if (mobileBackdrop) {
        mobileBackdrop.hidden = true;
    }
}

export function toggleMemoryTray() {
    const shell = getElement("nexoraShell");

    if (!shell) return;

    if (shell.classList.contains("memory-open")) {
        closeMemoryTray();
    } else {
        openMemoryTray();
    }
}


/* =========================================================
   5. MEMORY SEARCH
========================================================= */

function filterMemoryItems(query) {
    const memoryItems = getElements(".memory-item");
    const emptyState = getElement("memoryEmptyState");

    const normalizedQuery = query.trim().toLowerCase();
    let visibleCount = 0;

    memoryItems.forEach(item => {
        const title =
            item.querySelector(".memory-copy strong")
                ?.textContent
                ?.toLowerCase() || "";

        const preview =
            item.querySelector(".memory-copy small")
                ?.textContent
                ?.toLowerCase() || "";

        const matches =
            !normalizedQuery ||
            title.includes(normalizedQuery) ||
            preview.includes(normalizedQuery);

        item.hidden = !matches;

        if (matches) {
            visibleCount += 1;
        }
    });

    if (emptyState) {
        emptyState.hidden = visibleCount !== 0;
    }
}


/* =========================================================
   6. ACCOUNT DROPDOWN
========================================================= */

export function openAccountDropdown() {
    const trigger = getElement("accountTrigger");
    const dropdown = getElement("accountDropdown");

    if (!trigger || !dropdown) return;

    closeResponseModeMenu();

    dropdown.hidden = false;
    setExpanded(trigger, true);
}

export function closeAccountDropdown() {
    const trigger = getElement("accountTrigger");
    const dropdown = getElement("accountDropdown");

    if (!trigger || !dropdown) return;

    dropdown.hidden = true;
    setExpanded(trigger, false);
}

export function toggleAccountDropdown() {
    const dropdown = getElement("accountDropdown");

    if (!dropdown) return;

    if (dropdown.hidden) {
        openAccountDropdown();
    } else {
        closeAccountDropdown();
    }
}


/* =========================================================
   7. THEME
========================================================= */

function getPreferredTheme() {
    const storedTheme = localStorage.getItem("nexoraTheme");

    if (storedTheme === "light" || storedTheme === "dark") {
        return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
}

function applyTheme(theme) {
    const themeIcon = getElement("themeToggleIcon");

    document.documentElement.dataset.theme = theme;

    localStorage.setItem("nexoraTheme", theme);

    if (themeIcon) {
        themeIcon.className =
            theme === "light"
                ? "fa-regular fa-sun"
                : "fa-regular fa-moon";
    }
}

export function toggleTheme() {
    const currentTheme =
        document.documentElement.dataset.theme || "dark";

    const nextTheme =
        currentTheme === "dark"
            ? "light"
            : "dark";

    applyTheme(nextTheme);

    showToast({
        title: "Theme updated",
        message:
            nextTheme === "light"
                ? "Light theme is now active."
                : "Dark theme is now active.",
        type: "success",
        duration: 1800
    });
}


/* =========================================================
   8. MODALS
========================================================= */

export function openModal(modalId) {
    const modal = getElement(modalId);

    if (!modal) return;

    closeAccountDropdown();
    closeResponseModeMenu();
    closeConversationContextMenu();

    uiState.activeModalId = modalId;
    uiState.lastFocusedElement = document.activeElement;

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    const focusableElement = modal.querySelector(
        "input, textarea, select, button:not([disabled]), a[href]"
    );

    focusElement(focusableElement);
}

export function closeModal(modalId = uiState.activeModalId) {
    if (!modalId) return;

    const modal = getElement(modalId);

    if (!modal) return;

    modal.hidden = true;

    uiState.activeModalId = null;
    document.body.style.overflow = "";

    if (
        uiState.lastFocusedElement instanceof HTMLElement &&
        document.contains(uiState.lastFocusedElement)
    ) {
        uiState.lastFocusedElement.focus();
    }

    uiState.lastFocusedElement = null;
}

function trapModalFocus(event) {
    if (event.key !== "Tab" || !uiState.activeModalId) return;

    const modal = getElement(uiState.activeModalId);

    if (!modal || modal.hidden) return;

    const focusableElements = getElements(
        [
            "a[href]",
            "button:not([disabled])",
            "input:not([disabled])",
            "textarea:not([disabled])",
            "select:not([disabled])",
            '[tabindex]:not([tabindex="-1"])'
        ].join(","),
        modal
    ).filter(element => !element.hidden);

    if (!focusableElements.length) return;

    const firstElement = focusableElements[0];
    const lastElement =
        focusableElements[focusableElements.length - 1];

    if (
        event.shiftKey &&
        document.activeElement === firstElement
    ) {
        event.preventDefault();
        lastElement.focus();
    } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
    ) {
        event.preventDefault();
        firstElement.focus();
    }
}


/* =========================================================
   9. RENAME CONVERSATION
========================================================= */

export function openRenameConversationModal() {
    const titleElement = getElement("conversationTitle");
    const input = getElement("conversationNameInput");

    if (input && titleElement) {
        input.value =
            titleElement.textContent.trim() === "Untitled conversation"
                ? ""
                : titleElement.textContent.trim();
    }

    openModal("renameConversationModal");

    window.setTimeout(() => {
        input?.select();
    }, 120);
}

function saveConversationName(event) {
    event.preventDefault();

    const input = getElement("conversationNameInput");
    const titleElement = getElement("conversationTitle");

    if (!input || !titleElement) return;

    const newName = input.value.trim();

    if (!newName) {
        showToast({
            title: "Name required",
            message: "Enter a conversation name.",
            type: "warning"
        });

        input.focus();
        return;
    }

    titleElement.textContent = newName;

    const activeMemoryItem = document.querySelector(
        ".memory-item.active .memory-copy strong"
    );

    if (activeMemoryItem) {
        activeMemoryItem.textContent = newName;
    }

    closeModal("renameConversationModal");

    document.dispatchEvent(
        new CustomEvent("nexora:conversation-renamed", {
            detail: {
                conversationId: uiState.selectedConversationId,
                title: newName
            }
        })
    );

    showToast({
        title: "Conversation renamed",
        message: `Saved as “${newName}”.`,
        type: "success"
    });
}


/* =========================================================
   10. DELETE CONVERSATION
========================================================= */

export function openDeleteConversationModal() {
    openModal("deleteConversationModal");
}

function confirmDeleteConversation() {
    const selectedId =
        uiState.selectedConversationId ||
        document.querySelector(".memory-item.active")
            ?.dataset.conversationId ||
        null;

    document.dispatchEvent(
        new CustomEvent("nexora:conversation-delete", {
            detail: {
                conversationId: selectedId
            }
        })
    );

    closeModal("deleteConversationModal");

    showToast({
        title: "Conversation deleted",
        message: "The conversation was removed.",
        type: "success"
    });
}


/* =========================================================
   11. RESPONSE MODE MENU
========================================================= */

export function openResponseModeMenu() {
    const button = getElement("responseModeButton");
    const menu = getElement("responseModeMenu");

    if (!button || !menu) return;

    closeAccountDropdown();

    menu.hidden = false;
    setExpanded(button, true);
}

export function closeResponseModeMenu() {
    const button = getElement("responseModeButton");
    const menu = getElement("responseModeMenu");

    if (!button || !menu) return;

    menu.hidden = true;
    setExpanded(button, false);
}

export function toggleResponseModeMenu() {
    const menu = getElement("responseModeMenu");

    if (!menu) return;

    if (menu.hidden) {
        openResponseModeMenu();
    } else {
        closeResponseModeMenu();
    }
}

function selectResponseMode(option) {
    const mode = option.dataset.mode;
    const label =
        option.querySelector("strong")?.textContent?.trim() ||
        "Balanced";

    const options = getElements(".response-mode-option");
    const responseModeLabel = getElement("responseModeLabel");

    options.forEach(item => {
        const isActive = item === option;

        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
    });

    uiState.selectedResponseMode = mode;

    if (responseModeLabel) {
        responseModeLabel.textContent = label;
    }

    localStorage.setItem("nexoraResponseMode", mode);

    closeResponseModeMenu();

    document.dispatchEvent(
        new CustomEvent("nexora:response-mode-change", {
            detail: {
                mode,
                label
            }
        })
    );
}


/* =========================================================
   12. AUTO-GROWING TEXTAREA
========================================================= */

export function resizeMessageInput() {
    const input = getElement("messageInput");

    if (!input) return;

    input.style.height = "auto";

    const computedStyle = window.getComputedStyle(input);
    const maxHeight =
        Number.parseFloat(computedStyle.maxHeight) || 190;

    const nextHeight = Math.min(
        input.scrollHeight,
        maxHeight
    );

    input.style.height = `${nextHeight}px`;
    input.style.overflowY =
        input.scrollHeight > maxHeight
            ? "auto"
            : "hidden";
}

function updateSendButtonState() {
    const input = getElement("messageInput");
    const sendButton = getElement("sendMessageButton");

    if (!input || !sendButton) return;

    const hasText = input.value.trim().length > 0;
    const hasAttachments = uiState.attachments.length > 0;

    sendButton.disabled = !(hasText || hasAttachments);
}


/* =========================================================
   13. ATTACHMENT HANDLING
========================================================= */

function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const unitIndex = Math.floor(
        Math.log(bytes) / Math.log(1024)
    );

    const value =
        bytes / Math.pow(1024, unitIndex);

    return `${value.toFixed(
        unitIndex === 0 ? 0 : 1
    )} ${units[unitIndex]}`;
}

function getFileKey(file) {
    return `${file.name}-${file.size}-${file.lastModified}`;
}

function isAllowedFile(file) {
    const maxSize = 10 * 1024 * 1024;

    const allowedExtensions = [
        "txt",
        "md",
        "pdf",
        "doc",
        "docx",
        "png",
        "jpg",
        "jpeg",
        "webp"
    ];

    const extension =
        file.name.split(".").pop()?.toLowerCase() || "";

    if (!allowedExtensions.includes(extension)) {
        showToast({
            title: "Unsupported file",
            message: `${file.name} cannot be attached.`,
            type: "error"
        });

        return false;
    }

    if (file.size > maxSize) {
        showToast({
            title: "File is too large",
            message: `${file.name} exceeds the 10 MB limit.`,
            type: "error"
        });

        return false;
    }

    return true;
}

function createAttachmentPreview(file) {
    const template = getElement("attachmentPreviewTemplate");

    if (!template) return null;

    const fragment = template.content.cloneNode(true);
    const preview = fragment.querySelector(".attachment-token");

    if (!preview) return null;

    const fileKey = getFileKey(file);

    preview.dataset.fileKey = fileKey;

    const nameElement =
        preview.querySelector(".attachment-file-name");

    const sizeElement =
        preview.querySelector(".attachment-file-size");

    const icon =
        preview.querySelector(".attachment-token-icon i");

    if (nameElement) {
        nameElement.textContent = file.name;
    }

    if (sizeElement) {
        sizeElement.textContent = formatFileSize(file.size);
    }

    const extension =
        file.name.split(".").pop()?.toLowerCase();

    if (icon) {
        if (
            ["png", "jpg", "jpeg", "webp"].includes(extension)
        ) {
            icon.className = "fa-regular fa-image";
        } else if (extension === "pdf") {
            icon.className = "fa-regular fa-file-pdf";
        } else if (
            ["doc", "docx"].includes(extension)
        ) {
            icon.className = "fa-regular fa-file-word";
        } else {
            icon.className = "fa-regular fa-file-lines";
        }
    }

    const removeButton =
        preview.querySelector(".remove-attachment-button");

    removeButton?.addEventListener("click", () => {
        removeAttachment(fileKey);
    });

    return preview;
}

function renderAttachmentPreviews() {
    const container = getElement("attachmentPreviewList");

    if (!container) return;

    container.replaceChildren();

    uiState.attachments.forEach(file => {
        const preview = createAttachmentPreview(file);

        if (preview) {
            container.appendChild(preview);
        }
    });

    container.hidden = uiState.attachments.length === 0;

    updateSendButtonState();
}

function addAttachments(files) {
    const currentKeys = new Set(
        uiState.attachments.map(getFileKey)
    );

    const validFiles = [...files].filter(file => {
        const fileKey = getFileKey(file);

        return (
            !currentKeys.has(fileKey) &&
            isAllowedFile(file)
        );
    });

    uiState.attachments.push(...validFiles);

    renderAttachmentPreviews();

    if (validFiles.length > 0) {
        showToast({
            title: "Attachment added",
            message:
                validFiles.length === 1
                    ? validFiles[0].name
                    : `${validFiles.length} files attached.`,
            type: "success",
            duration: 1800
        });
    }
}

export function removeAttachment(fileKey) {
    uiState.attachments =
        uiState.attachments.filter(
            file => getFileKey(file) !== fileKey
        );

    renderAttachmentPreviews();
}

export function getSelectedAttachments() {
    return [...uiState.attachments];
}

export function clearAttachments() {
    const attachmentInput = getElement("attachmentInput");

    uiState.attachments = [];

    if (attachmentInput) {
        attachmentInput.value = "";
    }

    renderAttachmentPreviews();
}


/* =========================================================
   14. VOICE INPUT UI
========================================================= */

export function setVoiceInputActive(active) {
    const voiceButton = getElement("voiceInputButton");

    if (!voiceButton) return;

    setPressed(voiceButton, active);

    const icon = voiceButton.querySelector("i");

    if (icon) {
        icon.className = active
            ? "fa-solid fa-wave-square"
            : "fa-solid fa-microphone-lines";
    }
}


/* =========================================================
   15. MEMORY ITEM SELECTION
========================================================= */

function selectMemoryItem(item) {
    const memoryItems = getElements(".memory-item");
    const title =
        item.querySelector(".memory-copy strong")
            ?.textContent
            ?.trim() || "Untitled conversation";

    memoryItems.forEach(memoryItem => {
        memoryItem.classList.toggle(
            "active",
            memoryItem === item
        );
    });

    uiState.selectedConversationId =
        item.dataset.conversationId || null;

    const conversationTitle = getElement("conversationTitle");

    if (conversationTitle) {
        conversationTitle.textContent = title;
    }

    document.dispatchEvent(
        new CustomEvent("nexora:conversation-select", {
            detail: {
                conversationId:
                    uiState.selectedConversationId,
                title
            }
        })
    );

    if (window.innerWidth <= 760) {
        closeMemoryTray();
    }
}


/* =========================================================
   16. CONTEXT MENU
========================================================= */

export function openConversationContextMenu({
    x,
    y,
    conversationId
}) {
    const menu = getElement("conversationContextMenu");

    if (!menu) return;

    uiState.selectedConversationId = conversationId;

    menu.hidden = false;

    const menuWidth = 160;
    const menuHeight = 90;
    const viewportPadding = 10;

    const safeX = Math.min(
        x,
        window.innerWidth -
            menuWidth -
            viewportPadding
    );

    const safeY = Math.min(
        y,
        window.innerHeight -
            menuHeight -
            viewportPadding
    );

    menu.style.left =
        `${Math.max(viewportPadding, safeX)}px`;

    menu.style.top =
        `${Math.max(viewportPadding, safeY)}px`;
}

export function closeConversationContextMenu() {
    const menu = getElement("conversationContextMenu");

    if (!menu) return;

    menu.hidden = true;
}


/* =========================================================
   17. NEW CHAT UI
========================================================= */

function resetNewChatInterface() {
    const conversationTitle = getElement("conversationTitle");
    const welcomeState = getElement("welcomeState");
    const stream = getElement("conversationStream");
    const typingIndicator = getElement("typingIndicator");
    const input = getElement("messageInput");

    uiState.selectedConversationId = null;

    if (conversationTitle) {
        conversationTitle.textContent =
            "Untitled conversation";
    }

    if (welcomeState) {
        welcomeState.hidden = false;
    }

    if (stream) {
        stream.hidden = true;
        stream.replaceChildren();
    }

    if (typingIndicator) {
        typingIndicator.hidden = true;
    }

    getElements(".memory-item").forEach(item => {
        item.classList.remove("active");
    });

    clearAttachments();

    if (input) {
        input.value = "";
        resizeMessageInput();
        updateSendButtonState();
        input.focus();
    }

    closeMemoryTray();

    document.dispatchEvent(
        new CustomEvent("nexora:new-chat")
    );
}


/* =========================================================
   18. KEYBOARD SHORTCUTS
========================================================= */

function handleKeyboardShortcuts(event) {
    const isInputFocused =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement;

    if (event.key === "Escape") {
        if (uiState.activeModalId) {
            closeModal();
            return;
        }

        closeMemoryTray();
        closeAccountDropdown();
        closeResponseModeMenu();
        closeConversationContextMenu();
        return;
    }

    if (
        event.ctrlKey &&
        event.key.toLowerCase() === "k"
    ) {
        event.preventDefault();
        resetNewChatInterface();
        return;
    }

    if (
        event.key === "/" &&
        !isInputFocused
    ) {
        event.preventDefault();
        openMemoryTray();

        window.setTimeout(() => {
            getElement("memorySearchInput")?.focus();
        }, 200);
    }

    if (
        event.key === "Enter" &&
        !event.shiftKey &&
        event.target === getElement("messageInput")
    ) {
        const messageForm = getElement("messageForm");

        if (!messageForm) return;

        event.preventDefault();

        const sendButton = getElement("sendMessageButton");

        if (!sendButton?.disabled) {
            messageForm.requestSubmit();
        }
    }
}


/* =========================================================
   19. OUTSIDE CLICK HANDLING
========================================================= */

function handleOutsideClick(event) {
    const accountMenu = document.querySelector(".account-menu");
    const responseModeButton =
        getElement("responseModeButton");

    const responseModeMenu =
        getElement("responseModeMenu");

    const contextMenu =
        getElement("conversationContextMenu");

    if (
        accountMenu &&
        !accountMenu.contains(event.target)
    ) {
        closeAccountDropdown();
    }

    if (
        responseModeMenu &&
        responseModeButton &&
        !responseModeMenu.contains(event.target) &&
        !responseModeButton.contains(event.target)
    ) {
        closeResponseModeMenu();
    }

    if (
        contextMenu &&
        !contextMenu.contains(event.target) &&
        !event.target.closest(".memory-options-button")
    ) {
        closeConversationContextMenu();
    }
}


/* =========================================================
   20. RESIZE HANDLING
========================================================= */

function handleWindowResize() {
    if (window.innerWidth > 760) {
        const mobileBackdrop =
            getElement("mobileTrayBackdrop");

        if (mobileBackdrop) {
            mobileBackdrop.hidden = true;
        }
    }

    closeConversationContextMenu();
}


/* =========================================================
   21. EVENT BINDINGS
========================================================= */

function bindMemoryTrayEvents() {
    getElement("memoryTrayButton")
        ?.addEventListener("click", toggleMemoryTray);

    getElement("mobileMemoryButton")
        ?.addEventListener("click", openMemoryTray);

    getElement("closeMemoryTrayButton")
        ?.addEventListener("click", closeMemoryTray);

    getElement("mobileTrayBackdrop")
        ?.addEventListener("click", closeMemoryTray);

    getElement("memorySearchInput")
        ?.addEventListener("input", event => {
            filterMemoryItems(event.target.value);
        });

    getElements(".memory-item").forEach(item => {
        item
            .querySelector(".memory-open-button")
            ?.addEventListener("click", () => {
                selectMemoryItem(item);
            });

        item
            .querySelector(".memory-options-button")
            ?.addEventListener("click", event => {
                event.stopPropagation();

                const rect =
                    event.currentTarget
                        .getBoundingClientRect();

                openConversationContextMenu({
                    x: rect.right - 160,
                    y: rect.bottom + 5,
                    conversationId:
                        item.dataset.conversationId
                });
            });
    });
}

function bindAccountEvents() {
    getElement("accountTrigger")
        ?.addEventListener(
            "click",
            toggleAccountDropdown
        );

    getElement("railProfileButton")
        ?.addEventListener(
            "click",
            toggleAccountDropdown
        );
}

function bindThemeEvents() {
    getElement("themeToggleButton")
        ?.addEventListener("click", toggleTheme);
}

function bindModalEvents() {
    getElement("renameConversationButton")
        ?.addEventListener(
            "click",
            openRenameConversationModal
        );

    getElement("deleteConversationButton")
        ?.addEventListener(
            "click",
            openDeleteConversationModal
        );

    getElement("renameConversationForm")
        ?.addEventListener(
            "submit",
            saveConversationName
        );

    getElement("confirmDeleteConversationButton")
        ?.addEventListener(
            "click",
            confirmDeleteConversation
        );

    getElement("renameContextButton")
        ?.addEventListener("click", () => {
            closeConversationContextMenu();
            openRenameConversationModal();
        });

    getElement("deleteContextButton")
        ?.addEventListener("click", () => {
            closeConversationContextMenu();
            openDeleteConversationModal();
        });

    getElements("[data-close-modal]").forEach(button => {
        button.addEventListener("click", () => {
            closeModal(
                button.dataset.closeModal
            );
        });
    });
}

function bindResponseModeEvents() {
    getElement("responseModeButton")
        ?.addEventListener(
            "click",
            toggleResponseModeMenu
        );

    getElements(".response-mode-option")
        .forEach(option => {
            option.addEventListener("click", () => {
                selectResponseMode(option);
            });
        });
}

function bindComposerEvents() {
    const messageInput = getElement("messageInput");
    const attachmentInput =
        getElement("attachmentInput");

    messageInput?.addEventListener("input", () => {
        resizeMessageInput();
        updateSendButtonState();
    });

    getElement("attachmentButton")
        ?.addEventListener("click", () => {
            attachmentInput?.click();
        });

    attachmentInput?.addEventListener(
        "change",
        event => {
            const files = event.target.files;

            if (files?.length) {
                addAttachments(files);
            }

            event.target.value = "";
        }
    );
}

function bindNewChatEvent() {
    getElement("newChatButton")
        ?.addEventListener(
            "click",
            resetNewChatInterface
        );
}

function bindGlobalEvents() {
    document.addEventListener(
        "keydown",
        handleKeyboardShortcuts
    );

    document.addEventListener(
        "keydown",
        trapModalFocus
    );

    document.addEventListener(
        "click",
        handleOutsideClick
    );

    window.addEventListener(
        "resize",
        handleWindowResize
    );
}


/* =========================================================
   22. INITIAL RESPONSE MODE
========================================================= */

function restoreResponseMode() {
    const storedMode =
        localStorage.getItem("nexoraResponseMode") ||
        "balanced";

    const option = document.querySelector(
        `.response-mode-option[data-mode="${storedMode}"]`
    );

    if (option) {
        selectResponseMode(option);
    }
}


/* =========================================================
   23. INITIALIZATION
========================================================= */

export function initializeUI() {
    applyTheme(getPreferredTheme());

    bindMemoryTrayEvents();
    bindAccountEvents();
    bindThemeEvents();
    bindModalEvents();
    bindResponseModeEvents();
    bindComposerEvents();
    bindNewChatEvent();
    bindGlobalEvents();

    restoreResponseMode();
    resizeMessageInput();
    updateSendButtonState();

    const activeMemoryItem =
        document.querySelector(".memory-item.active");

    if (activeMemoryItem) {
        uiState.selectedConversationId =
            activeMemoryItem.dataset.conversationId ||
            null;
    }

    document.documentElement.classList.add(
        "nexora-ui-ready"
    );
}


/* =========================================================
   24. AUTOMATIC START
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeUI,
        { once: true }
    );
} else {
    initializeUI();
}