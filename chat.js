/* =========================================================
   nexxorra AI — CHAT API CLIENT
   File: chat.js
   Part 1: Configuration, Validation, Request Builder,
           Authentication and Fetch Layer
========================================================= */


/* =========================================================
   1. CHAT CLIENT CONFIGURATION
========================================================= */

const CHAT_CONFIG = Object.freeze({
    endpoint: "/.netlify/functions/chat",

    methods: {
        chat: "POST"
    },

    headers: {
        contentType: "application/json",
        acceptStream: "text/event-stream",
        acceptJSON: "application/json"
    },

    request: {
        timeout: 90000,
        maximumMessages: 30,
        maximumMessageLength: 12000,
        maximumTotalCharacters: 80000,
        maximumAttachments: 5,
        maximumAttachmentSize: 10 * 1024 * 1024
    },

    retry: {
        maximumAttempts: 2,
        initialDelay: 850,
        maximumDelay: 4000
    },

    responseModes: [
        "balanced",
        "fast",
        "deep"
    ],

    allowedRoles: [
        "system",
        "user",
        "assistant"
    ],

    allowedAttachmentExtensions: [
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
});


/* =========================================================
   2. CUSTOM CHAT ERROR
========================================================= */

export class nexxorraChatError extends Error {
    constructor(
        message,
        {
            code = "chat_error",
            status = 0,
            retryable = false,
            details = null,
            cause = null
        } = {}
    ) {
        super(message);

        this.name = "nexxorraChatError";
        this.code = code;
        this.status = status;
        this.statusCode = status;
        this.retryable = retryable;
        this.details = details;

        if (cause) {
            this.cause = cause;
        }
    }
}


/* =========================================================
   3. GENERAL HELPERS
========================================================= */

function wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(createAbortError());
            return;
        }

        const timeoutId = window.setTimeout(
            resolve,
            milliseconds
        );

        signal?.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timeoutId);
                reject(createAbortError());
            },
            {
                once: true
            }
        );
    });
}

function createAbortError() {
    try {
        return new DOMException(
            "The request was aborted.",
            "AbortError"
        );
    } catch {
        const error = new Error(
            "The request was aborted."
        );

        error.name = "AbortError";

        return error;
    }
}

function normalizeText(value) {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .trim();
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function safeParseJSON(value, fallback = null) {
    if (typeof value !== "string") {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function createRequestId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return [
        Date.now(),
        Math.random()
            .toString(16)
            .slice(2)
    ].join("-");
}

function getFileExtension(filename) {
    const parts = String(filename || "")
        .toLowerCase()
        .split(".");

    return parts.length > 1
        ? parts.pop()
        : "";
}

function isFile(value) {
    return (
        typeof File !== "undefined" &&
        value instanceof File
    );
}


/* =========================================================
   4. RESPONSE MODE VALIDATION
========================================================= */

function normalizeResponseMode(mode) {
    const normalizedMode =
        String(mode || "")
            .trim()
            .toLowerCase();

    return CHAT_CONFIG.responseModes.includes(
        normalizedMode
    )
        ? normalizedMode
        : "balanced";
}


/* =========================================================
   5. MESSAGE VALIDATION
========================================================= */

function normalizeMessage(message, index) {
    if (!isPlainObject(message)) {
        throw new nexxorraChatError(
            `Message ${index + 1} is invalid.`,
            {
                code: "invalid_message"
            }
        );
    }

    const role = String(
        message.role || ""
    )
        .trim()
        .toLowerCase();

    if (
        !CHAT_CONFIG.allowedRoles.includes(role)
    ) {
        throw new nexxorraChatError(
            `Message ${index + 1} has an unsupported role.`,
            {
                code: "invalid_message_role"
            }
        );
    }

    const content = normalizeText(
        message.content
    );

    if (!content) {
        throw new nexxorraChatError(
            `Message ${index + 1} has no content.`,
            {
                code: "empty_message"
            }
        );
    }

    if (
        content.length >
        CHAT_CONFIG.request.maximumMessageLength
    ) {
        throw new nexxorraChatError(
            `Message ${index + 1} is too long.`,
            {
                code: "message_too_long",
                details: {
                    maximumLength:
                        CHAT_CONFIG.request
                            .maximumMessageLength
                }
            }
        );
    }

    return {
        role,
        content
    };
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) {
        throw new nexxorraChatError(
            "Conversation messages must be an array.",
            {
                code: "invalid_messages"
            }
        );
    }

    if (messages.length === 0) {
        throw new nexxorraChatError(
            "At least one message is required.",
            {
                code: "empty_conversation"
            }
        );
    }

    const limitedMessages = messages.slice(
        -CHAT_CONFIG.request.maximumMessages
    );

    const normalizedMessages =
        limitedMessages.map(
            normalizeMessage
        );

    const totalCharacters =
        normalizedMessages.reduce(
            (total, message) => {
                return (
                    total +
                    message.content.length
                );
            },
            0
        );

    if (
        totalCharacters >
        CHAT_CONFIG.request.maximumTotalCharacters
    ) {
        throw new nexxorraChatError(
            "The conversation context is too large.",
            {
                code: "context_too_large",
                details: {
                    maximumCharacters:
                        CHAT_CONFIG.request
                            .maximumTotalCharacters,

                    receivedCharacters:
                        totalCharacters
                }
            }
        );
    }

    return normalizedMessages;
}


/* =========================================================
   6. ATTACHMENT VALIDATION
========================================================= */

function validateAttachmentFile(file) {
    if (!isFile(file)) {
        throw new nexxorraChatError(
            "An attachment is not a valid browser file.",
            {
                code: "invalid_attachment"
            }
        );
    }

    const extension = getFileExtension(
        file.name
    );

    if (
        !CHAT_CONFIG
            .allowedAttachmentExtensions
            .includes(extension)
    ) {
        throw new nexxorraChatError(
            `${file.name} is not a supported file type.`,
            {
                code:
                    "unsupported_attachment_type",

                details: {
                    filename: file.name,
                    extension
                }
            }
        );
    }

    if (
        file.size >
        CHAT_CONFIG.request
            .maximumAttachmentSize
    ) {
        throw new nexxorraChatError(
            `${file.name} exceeds the attachment size limit.`,
            {
                code:
                    "attachment_too_large",

                details: {
                    filename:
                        file.name,

                    maximumSize:
                        CHAT_CONFIG.request
                            .maximumAttachmentSize,

                    receivedSize:
                        file.size
                }
            }
        );
    }

    return file;
}

function normalizeAttachmentFiles(
    attachments
) {
    if (!attachments) {
        return [];
    }

    const files = Array.isArray(attachments)
        ? attachments
        : [...attachments];

    if (
        files.length >
        CHAT_CONFIG.request
            .maximumAttachments
    ) {
        throw new nexxorraChatError(
            `A maximum of ${CHAT_CONFIG.request.maximumAttachments} attachments is allowed.`,
            {
                code: "too_many_attachments"
            }
        );
    }

    return files.map(
        validateAttachmentFile
    );
}


/* =========================================================
   7. CHAT PAYLOAD VALIDATION
========================================================= */

export function validateChatPayload(payload) {
    if (!isPlainObject(payload)) {
        throw new nexxorraChatError(
            "The chat request is invalid.",
            {
                code: "invalid_payload"
            }
        );
    }

    const conversationId =
        normalizeText(
            payload.conversationId
        );

    const messageId =
        normalizeText(
            payload.messageId
        );

    const guestId =
        normalizeText(
            payload.guestId
        );

    const responseMode =
        normalizeResponseMode(
            payload.responseMode
        );

    const messages =
        normalizeMessages(
            payload.messages
        );

    const attachmentFiles =
        normalizeAttachmentFiles(
            payload.attachments
        );

    const metadata =
        isPlainObject(payload.metadata)
            ? {
                  ...payload.metadata
              }
            : {};

    return {
        conversationId:
            conversationId || null,

        messageId:
            messageId || null,

        guestId:
            guestId || null,

        responseMode,

        messages,

        attachmentFiles,

        metadata
    };
}


/* =========================================================
   8. SESSION TOKEN RESOLUTION
========================================================= */

let cachedAccessToken = null;

export function setChatAccessToken(token) {
    const normalizedToken =
        normalizeText(token);

    cachedAccessToken =
        normalizedToken || null;
}

export function clearChatAccessToken() {
    cachedAccessToken = null;
}

async function resolveTokenFromAuthModule() {
    try {
        const authModule =
            await import("./auth.js");

        if (
            typeof authModule
                .getAccessToken ===
            "function"
        ) {
            const accessToken =
                await authModule
                    .getAccessToken();

            if (accessToken) {
                return accessToken;
            }
        }

        if (
            typeof authModule
                .getCurrentSession ===
            "function"
        ) {
            const result =
                await authModule
                    .getCurrentSession();

            const session =
                result?.session ||
                result ||
                null;

            return (
                session?.access_token ||
                null
            );
        }
    } catch (error) {
        console.info(
            "No authenticated chat session was found.",
            error
        );
    }

    return null;
}

async function resolveTokenFromSupabaseModule() {
    try {
        const supabaseModule =
            await import("./supabase.js");

        if (
            typeof supabaseModule
                .getCurrentSession ===
            "function"
        ) {
            const result =
                await supabaseModule
                    .getCurrentSession();

            const session =
                result?.session ||
                result?.data?.session ||
                result ||
                null;

            return (
                session?.access_token ||
                null
            );
        }
    } catch (error) {
        console.info(
            "Supabase chat session is unavailable.",
            error
        );
    }

    return null;
}

export async function getChatAccessToken() {
    if (cachedAccessToken) {
        return cachedAccessToken;
    }

    const authToken =
        await resolveTokenFromAuthModule();

    if (authToken) {
        cachedAccessToken = authToken;
        return authToken;
    }

    const supabaseToken =
        await resolveTokenFromSupabaseModule();

    if (supabaseToken) {
        cachedAccessToken = supabaseToken;
        return supabaseToken;
    }

    return null;
}


/* =========================================================
   9. REQUEST HEADERS
========================================================= */

async function createRequestHeaders({
    streaming = false,
    isMultipart = false,
    requestId
} = {}) {
    const headers = new Headers();

    headers.set(
        "Accept",
        streaming
            ? CHAT_CONFIG.headers.acceptStream
            : CHAT_CONFIG.headers.acceptJSON
    );

    headers.set(
        "X-nexxorra-Request-ID",
        requestId || createRequestId()
    );

    headers.set(
        "X-nexxorra-Client",
        "web"
    );

    if (!isMultipart) {
        headers.set(
            "Content-Type",
            CHAT_CONFIG.headers.contentType
        );
    }

    const accessToken =
        await getChatAccessToken();

    if (accessToken) {
        headers.set(
            "Authorization",
            `Bearer ${accessToken}`
        );
    }

    return headers;
}


/* =========================================================
   10. SERIALIZABLE REQUEST PAYLOAD
========================================================= */

function createSerializablePayload(
    validatedPayload,
    {
        streaming = false,
        requestId
    } = {}
) {
    return {
        conversationId:
            validatedPayload.conversationId,

        messageId:
            validatedPayload.messageId,

        guestId:
            validatedPayload.guestId,

        responseMode:
            validatedPayload.responseMode,

        messages:
            validatedPayload.messages,

        stream:
            Boolean(streaming),

        requestId,

        metadata: {
            ...validatedPayload.metadata,

            attachmentCount:
                validatedPayload
                    .attachmentFiles
                    .length,

            client:
                "nexxorra-web",

            clientTimestamp:
                new Date()
                    .toISOString()
        }
    };
}


/* =========================================================
   11. JSON REQUEST BODY
========================================================= */

function createJSONRequestBody(
    validatedPayload,
    options
) {
    const serializablePayload =
        createSerializablePayload(
            validatedPayload,
            options
        );

    return JSON.stringify(
        serializablePayload
    );
}


/* =========================================================
   12. MULTIPART REQUEST BODY
========================================================= */

function createMultipartRequestBody(
    validatedPayload,
    options
) {
    const formData =
        new FormData();

    const serializablePayload =
        createSerializablePayload(
            validatedPayload,
            options
        );

    formData.append(
        "payload",
        JSON.stringify(
            serializablePayload
        )
    );

    validatedPayload
        .attachmentFiles
        .forEach(
            (file, index) => {
                formData.append(
                    "attachments",
                    file,
                    file.name
                );

                formData.append(
                    `attachment_${index}_metadata`,
                    JSON.stringify({
                        name:
                            file.name,

                        size:
                            file.size,

                        type:
                            file.type ||
                            "application/octet-stream",

                        lastModified:
                            file.lastModified
                    })
                );
            }
        );

    return formData;
}


/* =========================================================
   13. REQUEST CONFIGURATION BUILDER
========================================================= */

export async function createChatRequest(
    payload,
    {
        streaming = false,
        signal = null
    } = {}
) {
    const validatedPayload =
        validateChatPayload(payload);

    const requestId =
        createRequestId();

    const isMultipart =
        validatedPayload
            .attachmentFiles
            .length > 0;

    const headers =
        await createRequestHeaders({
            streaming,
            isMultipart,
            requestId
        });

    const body = isMultipart
        ? createMultipartRequestBody(
              validatedPayload,
              {
                  streaming,
                  requestId
              }
          )
        : createJSONRequestBody(
              validatedPayload,
              {
                  streaming,
                  requestId
              }
          );

    return {
        url: CHAT_CONFIG.endpoint,

        requestId,

        validatedPayload,

        fetchOptions: {
            method:
                CHAT_CONFIG.methods.chat,

            headers,

            body,

            signal,

            credentials: "same-origin",

            cache: "no-store",

            redirect: "error",

            referrerPolicy:
                "strict-origin-when-cross-origin"
        }
    };
}


/* =========================================================
   14. COMBINED ABORT SIGNAL
========================================================= */

function createRequestSignal({
    externalSignal = null,
    timeout =
        CHAT_CONFIG.request.timeout
} = {}) {
    const timeoutController =
        new AbortController();

    let timeoutId = null;
    let externalAbortHandler = null;

    if (
        Number.isFinite(timeout) &&
        timeout > 0
    ) {
        timeoutId = window.setTimeout(
            () => {
                timeoutController.abort(
                    new nexxorraChatError(
                        "The AI request timed out.",
                        {
                            code:
                                "request_timeout",

                            retryable: true
                        }
                    )
                );
            },
            timeout
        );
    }

    if (externalSignal) {
        if (externalSignal.aborted) {
            timeoutController.abort(
                externalSignal.reason ||
                createAbortError()
            );
        } else {
            externalAbortHandler = () => {
                timeoutController.abort(
                    externalSignal.reason ||
                    createAbortError()
                );
            };

            externalSignal.addEventListener(
                "abort",
                externalAbortHandler,
                {
                    once: true
                }
            );
        }
    }

    function cleanup() {
        if (timeoutId) {
            window.clearTimeout(
                timeoutId
            );
        }

        if (
            externalSignal &&
            externalAbortHandler
        ) {
            externalSignal
                .removeEventListener(
                    "abort",
                    externalAbortHandler
                );
        }
    }

    return {
        signal:
            timeoutController.signal,

        cleanup
    };
}


/* =========================================================
   15. RESPONSE CONTENT TYPE HELPERS
========================================================= */

function getResponseContentType(response) {
    return (
        response.headers
            .get("content-type") ||
        ""
    ).toLowerCase();
}

function isJSONResponse(response) {
    return getResponseContentType(
        response
    ).includes("application/json");
}

function isEventStreamResponse(response) {
    return getResponseContentType(
        response
    ).includes("text/event-stream");
}


/* =========================================================
   16. ERROR RESPONSE PARSING
========================================================= */

async function readErrorResponse(response) {
    const contentType =
        getResponseContentType(response);

    let errorData = null;
    let errorText = "";

    try {
        if (
            contentType.includes(
                "application/json"
            )
        ) {
            errorData =
                await response.json();

            errorText =
                errorData?.error?.message ||
                errorData?.message ||
                "";
        } else {
            errorText =
                await response.text();

            const parsed =
                safeParseJSON(
                    errorText,
                    null
                );

            if (parsed) {
                errorData = parsed;

                errorText =
                    parsed?.error?.message ||
                    parsed?.message ||
                    errorText;
            }
        }
    } catch (error) {
        console.warn(
            "The server error response could not be parsed.",
            error
        );
    }

    return {
        data: errorData,
        message:
            normalizeText(errorText)
    };
}


/* =========================================================
   17. HTTP STATUS ERROR MAPPING
========================================================= */

function getHTTPErrorDetails(
    status
) {
    if (status === 400) {
        return {
            code: "invalid_request",
            message:
                "The AI request was not valid.",
            retryable: false
        };
    }

    if (status === 401) {
        return {
            code: "unauthorized",
            message:
                "Your session could not be verified.",
            retryable: false
        };
    }

    if (status === 403) {
        return {
            code: "forbidden",
            message:
                "This AI request is not permitted.",
            retryable: false
        };
    }

    if (status === 404) {
        return {
            code: "endpoint_not_found",
            message:
                "The nexxorra chat endpoint was not found.",
            retryable: false
        };
    }

    if (status === 408) {
        return {
            code: "request_timeout",
            message:
                "The AI request timed out.",
            retryable: true
        };
    }

    if (status === 413) {
        return {
            code: "payload_too_large",
            message:
                "The message or attachment is too large.",
            retryable: false
        };
    }

    if (status === 422) {
        return {
            code: "unprocessable_request",
            message:
                "The server could not process this conversation.",
            retryable: false
        };
    }

    if (status === 429) {
        return {
            code: "rate_limit",
            message:
                "Too many AI requests were sent.",
            retryable: true
        };
    }

    if (status >= 500) {
        return {
            code: "server_error",
            message:
                "The AI service is temporarily unavailable.",
            retryable: true
        };
    }

    return {
        code: "http_error",
        message:
            "The AI request failed.",
        retryable: false
    };
}


/* =========================================================
   18. RESPONSE VALIDATION
========================================================= */

async function ensureSuccessfulResponse(
    response
) {
    if (response.ok) {
        return response;
    }

    const errorResponse =
        await readErrorResponse(
            response
        );

    const mappedError =
        getHTTPErrorDetails(
            response.status
        );

    const serverCode =
        errorResponse.data?.error?.code ||
        errorResponse.data?.code ||
        mappedError.code;

    throw new nexxorraChatError(
        errorResponse.message ||
            mappedError.message,
        {
            code: serverCode,

            status:
                response.status,

            retryable:
                mappedError.retryable,

            details:
                errorResponse.data
        }
    );
}


/* =========================================================
   19. NETWORK ERROR NORMALIZATION
========================================================= */

function normalizeFetchError(error) {
    if (
        error?.name === "AbortError"
    ) {
        return error;
    }

    if (
        error instanceof nexxorraChatError
    ) {
        return error;
    }

    if (
        error instanceof TypeError
    ) {
        return new nexxorraChatError(
            "nexxorra could not connect to the AI service.",
            {
                code: "network_error",
                retryable: true,
                cause: error
            }
        );
    }

    return new nexxorraChatError(
        error?.message ||
            "The AI request failed.",
        {
            code: "unknown_chat_error",
            retryable: false,
            cause: error
        }
    );
}


/* =========================================================
   20. RETRY DECISION
========================================================= */

function shouldRetryRequest(
    error,
    attempt,
    maximumAttempts
) {
    if (
        error?.name === "AbortError"
    ) {
        return false;
    }

    if (
        attempt >= maximumAttempts
    ) {
        return false;
    }

    return Boolean(
        error?.retryable
    );
}

function getRetryDelay(
    attempt,
    response = null
) {
    const retryAfter =
        response?.headers?.get(
            "retry-after"
        );

    if (retryAfter) {
        const retryAfterSeconds =
            Number(retryAfter);

        if (
            Number.isFinite(
                retryAfterSeconds
            )
        ) {
            return Math.min(
                retryAfterSeconds * 1000,
                CHAT_CONFIG.retry
                    .maximumDelay
            );
        }

        const retryDate =
            new Date(retryAfter);

        if (
            !Number.isNaN(
                retryDate.getTime()
            )
        ) {
            return Math.min(
                Math.max(
                    retryDate.getTime() -
                        Date.now(),
                    0
                ),
                CHAT_CONFIG.retry
                    .maximumDelay
            );
        }
    }

    const exponentialDelay =
        CHAT_CONFIG.retry
            .initialDelay *
        2 ** Math.max(0, attempt - 1);

    const randomJitter =
        Math.floor(
            Math.random() * 250
        );

    return Math.min(
        exponentialDelay +
            randomJitter,
        CHAT_CONFIG.retry
            .maximumDelay
    );
}


/* =========================================================
   21. LOW-LEVEL FETCH EXECUTION
========================================================= */

export async function executeChatFetch(
    payload,
    {
        streaming = false,
        signal = null,
        timeout =
            CHAT_CONFIG.request.timeout,
        maximumAttempts =
            CHAT_CONFIG.retry
                .maximumAttempts
    } = {}
) {
    let attempt = 0;
    let latestError = null;

    while (
        attempt < maximumAttempts
    ) {
        attempt += 1;

        const requestSignal =
            createRequestSignal({
                externalSignal: signal,
                timeout
            });

        try {
            const request =
                await createChatRequest(
                    payload,
                    {
                        streaming,
                        signal:
                            requestSignal
                                .signal
                    }
                );

            const response =
                await fetch(
                    request.url,
                    request.fetchOptions
                );

            await ensureSuccessfulResponse(
                response
            );

            requestSignal.cleanup();

            return {
                response,

                requestId:
                    request.requestId,

                validatedPayload:
                    request
                        .validatedPayload,

                contentType:
                    getResponseContentType(
                        response
                    ),

                isJSON:
                    isJSONResponse(
                        response
                    ),

                isEventStream:
                    isEventStreamResponse(
                        response
                    )
            };
        } catch (error) {
            requestSignal.cleanup();

            latestError =
                normalizeFetchError(
                    error
                );

            if (
                !shouldRetryRequest(
                    latestError,
                    attempt,
                    maximumAttempts
                )
            ) {
                throw latestError;
            }

            const retryDelay =
                getRetryDelay(
                    attempt
                );

            await wait(
                retryDelay,
                signal
            );
        }
    }

    throw (
        latestError ||
        new nexxorraChatError(
            "The AI request could not be completed.",
            {
                code:
                    "request_failed"
            }
        )
    );
}


/* =========================================================
   22. JSON RESPONSE READER
========================================================= */

export async function readJSONChatResponse(
    response
) {
    if (!response) {
        throw new nexxorraChatError(
            "The AI server returned no response.",
            {
                code: "missing_response"
            }
        );
    }

    const text =
        await response.text();

    if (!text.trim()) {
        throw new nexxorraChatError(
            "The AI server returned an empty response.",
            {
                code: "empty_response"
            }
        );
    }

    const parsed =
        safeParseJSON(
            text,
            null
        );

    if (!parsed) {
        throw new nexxorraChatError(
            "The AI response was not valid JSON.",
            {
                code: "invalid_json_response",
                details: {
                    preview:
                        text.slice(0, 200)
                }
            }
        );
    }

    return parsed;
}


/* =========================================================
   23. CHAT RESULT NORMALIZATION
========================================================= */

export function normalizeChatResponseData(
    data
) {
    if (typeof data === "string") {
        return {
            content: data,
            metadata: {}
        };
    }

    if (!isPlainObject(data)) {
        throw new nexxorraChatError(
            "The AI response has an invalid structure.",
            {
                code:
                    "invalid_response_structure"
            }
        );
    }

    if (data.error) {
        const errorMessage =
            typeof data.error === "string"
                ? data.error
                : data.error.message;

        throw new nexxorraChatError(
            errorMessage ||
                "The AI request failed.",
            {
                code:
                    data.error.code ||
                    "server_response_error",

                status:
                    Number(
                        data.error.status
                    ) || 0,

                retryable:
                    Boolean(
                        data.error.retryable
                    ),

                details:
                    data.error
            }
        );
    }

    const content =
        data.content ??
        data.response ??
        data.message?.content ??
        data.message ??
        data.output_text ??
        data.output ??
        data.text ??
        "";

    const normalizedContent =
        typeof content === "string"
            ? content
            : String(content || "");

    if (
        !normalizedContent.trim()
    ) {
        throw new nexxorraChatError(
            "The AI server returned an empty response.",
            {
                code: "empty_response"
            }
        );
    }

    return {
        content:
            normalizedContent,

        conversationId:
            data.conversationId ||
            data.conversation_id ||
            null,

        messageId:
            data.messageId ||
            data.message_id ||
            null,

        model:
            data.model || null,

        usage:
            data.usage || null,

        metadata:
            isPlainObject(
                data.metadata
            )
                ? data.metadata
                : {}
    };
}


/* =========================================================
   24. COMPLETE NON-STREAMING REQUEST
========================================================= */

export async function sendChatRequest(
    payload,
    {
        signal = null,
        timeout =
            CHAT_CONFIG.request.timeout
    } = {}
) {
    const result =
        await executeChatFetch(
            payload,
            {
                streaming: false,
                signal,
                timeout
            }
        );

    const responseData =
        await readJSONChatResponse(
            result.response
        );

    const normalizedResponse =
        normalizeChatResponseData(
            responseData
        );

    return {
        ...normalizedResponse,

        metadata: {
            ...normalizedResponse
                .metadata,

            requestId:
                result.requestId
        }
    };
}


/* =========================================================
   25. PART 1 EXPORTS
========================================================= */

export {
    CHAT_CONFIG,

    createAbortError,

    normalizeResponseMode,

    normalizeMessages,

    normalizeAttachmentFiles,

    getResponseContentType,

    isJSONResponse,

    isEventStreamResponse,

    safeParseJSON
};

/* =========================================================
   nexxorra AI — CHAT API CLIENT
   File: chat.js
   Part 2: Streaming Parser, SSE Handling and Stream Lifecycle
========================================================= */


/* =========================================================
   26. STREAM TEXT NORMALIZATION
========================================================= */

function normalizeStreamChunk(value) {
    if (typeof value === "string") {
        return value;
    }

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value);
}


/* =========================================================
   27. STREAM EVENT FACTORY
========================================================= */

function createStreamEvent({
    event = "message",
    data = "",
    id = null,
    retry = null
} = {}) {
    return {
        event:
            normalizeStreamChunk(event)
                .trim() || "message",

        data:
            normalizeStreamChunk(data),

        id:
            id === null ||
            id === undefined
                ? null
                : normalizeStreamChunk(id),

        retry:
            Number.isFinite(Number(retry))
                ? Number(retry)
                : null
    };
}


/* =========================================================
   28. SSE EVENT BLOCK PARSER
========================================================= */

function parseSSEEventBlock(block) {
    const lines = String(block || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");

    let eventName = "message";
    let eventId = null;
    let retryValue = null;

    const dataLines = [];

    lines.forEach(line => {
        if (!line) {
            return;
        }

        if (line.startsWith(":")) {
            return;
        }

        const separatorIndex =
            line.indexOf(":");

        let field = "";
        let value = "";

        if (separatorIndex === -1) {
            field = line;
        } else {
            field =
                line.slice(
                    0,
                    separatorIndex
                );

            value =
                line.slice(
                    separatorIndex + 1
                );

            if (value.startsWith(" ")) {
                value = value.slice(1);
            }
        }

        switch (field) {
            case "event":
                eventName =
                    value || "message";
                break;

            case "data":
                dataLines.push(value);
                break;

            case "id":
                eventId = value;
                break;

            case "retry": {
                const parsedRetry =
                    Number(value);

                if (
                    Number.isFinite(
                        parsedRetry
                    )
                ) {
                    retryValue =
                        parsedRetry;
                }

                break;
            }

            default:
                break;
        }
    });

    return createStreamEvent({
        event: eventName,
        data: dataLines.join("\n"),
        id: eventId,
        retry: retryValue
    });
}


/* =========================================================
   29. SSE BUFFER EXTRACTION
========================================================= */

function extractSSEBlocks(buffer) {
    const normalizedBuffer =
        String(buffer || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

    const blocks = [];

    let remainder =
        normalizedBuffer;

    let boundaryIndex =
        remainder.indexOf("\n\n");

    while (boundaryIndex !== -1) {
        const block =
            remainder.slice(
                0,
                boundaryIndex
            );

        remainder =
            remainder.slice(
                boundaryIndex + 2
            );

        if (block.trim()) {
            blocks.push(block);
        }

        boundaryIndex =
            remainder.indexOf("\n\n");
    }

    return {
        blocks,
        remainder
    };
}


/* =========================================================
   30. STREAM DATA JSON PARSING
========================================================= */

function parseStreamData(data) {
    const normalizedData =
        String(data || "").trim();

    if (!normalizedData) {
        return null;
    }

    if (
        normalizedData === "[DONE]" ||
        normalizedData === "DONE"
    ) {
        return {
            type: "done"
        };
    }

    const parsed =
        safeParseJSON(
            normalizedData,
            null
        );

    if (parsed !== null) {
        return parsed;
    }

    return {
        type: "text",
        content: normalizedData
    };
}


/* =========================================================
   31. STREAM ERROR NORMALIZATION
========================================================= */

function createStreamError(data) {
    if (
        data instanceof Error
    ) {
        return data;
    }

    if (typeof data === "string") {
        return new nexxorraChatError(
            data ||
                "The AI stream failed.",
            {
                code:
                    "stream_error"
            }
        );
    }

    const errorData =
        data?.error || data || {};

    return new nexxorraChatError(
        errorData.message ||
            errorData.detail ||
            "The AI stream failed.",
        {
            code:
                errorData.code ||
                "stream_error",

            status:
                Number(
                    errorData.status
                ) || 0,

            retryable:
                Boolean(
                    errorData.retryable
                ),

            details:
                errorData
        }
    );
}


/* =========================================================
   32. EXTRACT STREAM TEXT DELTA
========================================================= */

function extractStreamTextDelta(data) {
    if (
        data === null ||
        data === undefined
    ) {
        return "";
    }

    if (typeof data === "string") {
        return data;
    }

    if (!isPlainObject(data)) {
        return "";
    }

    const directCandidates = [
        data.delta,
        data.content,
        data.text,
        data.token,
        data.output_text
    ];

    for (const candidate of directCandidates) {
        if (typeof candidate === "string") {
            return candidate;
        }
    }

    if (
        typeof data.message?.content ===
        "string"
    ) {
        return data.message.content;
    }

    if (
        typeof data.choices?.[0]
            ?.delta?.content ===
        "string"
    ) {
        return (
            data.choices[0]
                .delta.content
        );
    }

    if (
        typeof data.choices?.[0]
            ?.message?.content ===
        "string"
    ) {
        return (
            data.choices[0]
                .message.content
        );
    }

    if (
        Array.isArray(data.output)
    ) {
        for (
            const outputItem of
            data.output
        ) {
            if (
                typeof outputItem?.content ===
                "string"
            ) {
                return outputItem.content;
            }

            if (
                Array.isArray(
                    outputItem?.content
                )
            ) {
                for (
                    const contentItem of
                    outputItem.content
                ) {
                    if (
                        typeof contentItem?.text ===
                        "string"
                    ) {
                        return contentItem.text;
                    }
                }
            }
        }
    }

    return "";
}


/* =========================================================
   33. STREAM COMPLETION DETECTION
========================================================= */

function isStreamCompletionEvent(
    eventName,
    data
) {
    const normalizedEventName =
        String(eventName || "")
            .trim()
            .toLowerCase();

    if (
        [
            "done",
            "complete",
            "completed",
            "response.completed",
            "message.completed",
            "end"
        ].includes(
            normalizedEventName
        )
    ) {
        return true;
    }

    const type =
        String(
            data?.type || ""
        )
            .trim()
            .toLowerCase();

    return [
        "done",
        "complete",
        "completed",
        "response.completed",
        "message.completed",
        "end"
    ].includes(type);
}


/* =========================================================
   34. STREAM ERROR DETECTION
========================================================= */

function isStreamErrorEvent(
    eventName,
    data
) {
    const normalizedEventName =
        String(eventName || "")
            .trim()
            .toLowerCase();

    if (
        [
            "error",
            "response.error",
            "message.error",
            "failed"
        ].includes(
            normalizedEventName
        )
    ) {
        return true;
    }

    const type =
        String(
            data?.type || ""
        )
            .trim()
            .toLowerCase();

    return [
        "error",
        "response.error",
        "message.error",
        "failed"
    ].includes(type);
}


/* =========================================================
   35. STREAM METADATA EXTRACTION
========================================================= */

function extractStreamMetadata(data) {
    if (!isPlainObject(data)) {
        return {};
    }

    const metadata =
        isPlainObject(data.metadata)
            ? data.metadata
            : {};

    return {
        ...metadata,

        conversationId:
            data.conversationId ||
            data.conversation_id ||
            metadata.conversationId ||
            metadata.conversation_id ||
            null,

        messageId:
            data.messageId ||
            data.message_id ||
            metadata.messageId ||
            metadata.message_id ||
            null,

        model:
            data.model ||
            metadata.model ||
            null,

        usage:
            data.usage ||
            metadata.usage ||
            null
    };
}


/* =========================================================
   36. MERGE STREAM METADATA
========================================================= */

function mergeStreamMetadata(
    currentMetadata,
    nextMetadata
) {
    const merged = {
        ...(currentMetadata || {})
    };

    Object.entries(
        nextMetadata || {}
    ).forEach(
        ([key, value]) => {
            if (
                value !== null &&
                value !== undefined
            ) {
                merged[key] = value;
            }
        }
    );

    return merged;
}


/* =========================================================
   37. PROCESS SINGLE STREAM EVENT
========================================================= */

function processStreamEvent(
    streamEvent,
    streamState,
    callbacks
) {
    const parsedData =
        parseStreamData(
            streamEvent.data
        );

    if (parsedData === null) {
        return;
    }

    if (
        isStreamErrorEvent(
            streamEvent.event,
            parsedData
        )
    ) {
        throw createStreamError(
            parsedData
        );
    }

    if (
        isStreamCompletionEvent(
            streamEvent.event,
            parsedData
        )
    ) {
        streamState.completed = true;

        streamState.metadata =
            mergeStreamMetadata(
                streamState.metadata,
                extractStreamMetadata(
                    parsedData
                )
            );

        callbacks.onEvent?.({
            type: "complete",
            event:
                streamEvent.event,
            data:
                parsedData
        });

        return;
    }

    const metadata =
        extractStreamMetadata(
            parsedData
        );

    streamState.metadata =
        mergeStreamMetadata(
            streamState.metadata,
            metadata
        );

    const textDelta =
        extractStreamTextDelta(
            parsedData
        );

    if (textDelta) {
        streamState.content +=
            textDelta;

        callbacks.onChunk?.(
            textDelta,
            {
                accumulatedContent:
                    streamState.content,

                event:
                    streamEvent.event,

                data:
                    parsedData
            }
        );
    }

    callbacks.onEvent?.({
        type:
            textDelta
                ? "chunk"
                : "event",

        event:
            streamEvent.event,

        data:
            parsedData
    });
}


/* =========================================================
   38. READABLE STREAM VALIDATION
========================================================= */

function ensureReadableBody(response) {
    if (!response?.body) {
        throw new nexxorraChatError(
            "The AI server returned no readable stream.",
            {
                code:
                    "missing_stream_body"
            }
        );
    }

    if (
        typeof response.body
            .getReader !== "function"
    ) {
        throw new nexxorraChatError(
            "Streaming is not supported by this browser response.",
            {
                code:
                    "unsupported_stream"
            }
        );
    }

    return response.body;
}


/* =========================================================
   39. STREAM READER CLEANUP
========================================================= */

async function safelyCancelReader(
    reader
) {
    if (!reader) {
        return;
    }

    try {
        await reader.cancel();
    } catch {
        // Reader may already be closed.
    }

    try {
        reader.releaseLock();
    } catch {
        // Lock may already be released.
    }
}


/* =========================================================
   40. SSE RESPONSE READER
========================================================= */

export async function readSSEChatResponse(
    response,
    {
        signal = null,
        onChunk = null,
        onEvent = null
    } = {}
) {
    const body =
        ensureReadableBody(response);

    const reader =
        body.getReader();

    const decoder =
        new TextDecoder(
            "utf-8"
        );

    const streamState = {
        content: "",
        metadata: {},
        completed: false,
        eventCount: 0
    };

    let buffer = "";

    const abortHandler = async () => {
        await safelyCancelReader(
            reader
        );
    };

    signal?.addEventListener(
        "abort",
        abortHandler,
        {
            once: true
        }
    );

    try {
        while (true) {
            if (signal?.aborted) {
                throw createAbortError();
            }

            const {
                value,
                done
            } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(
                value,
                {
                    stream: true
                }
            );

            const extraction =
                extractSSEBlocks(
                    buffer
                );

            buffer =
                extraction.remainder;

            for (
                const block of
                extraction.blocks
            ) {
                if (signal?.aborted) {
                    throw createAbortError();
                }

                const streamEvent =
                    parseSSEEventBlock(
                        block
                    );

                streamState.eventCount += 1;

                processStreamEvent(
                    streamEvent,
                    streamState,
                    {
                        onChunk,
                        onEvent
                    }
                );
            }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
            const streamEvent =
                parseSSEEventBlock(
                    buffer
                );

            streamState.eventCount += 1;

            processStreamEvent(
                streamEvent,
                streamState,
                {
                    onChunk,
                    onEvent
                }
            );
        }

        if (
            !streamState.content.trim()
        ) {
            throw new nexxorraChatError(
                "The AI stream returned no response content.",
                {
                    code:
                        "empty_stream_response"
                }
            );
        }

        return {
            content:
                streamState.content,

            conversationId:
                streamState
                    .metadata
                    .conversationId ||
                null,

            messageId:
                streamState
                    .metadata
                    .messageId ||
                null,

            model:
                streamState
                    .metadata
                    .model ||
                null,

            usage:
                streamState
                    .metadata
                    .usage ||
                null,

            metadata: {
                ...streamState.metadata,

                completed:
                    streamState.completed,

                eventCount:
                    streamState.eventCount
            }
        };
    } catch (error) {
        if (
            signal?.aborted ||
            error?.name === "AbortError"
        ) {
            throw createAbortError();
        }

        if (
            error instanceof
            nexxorraChatError
        ) {
            throw error;
        }

        throw new nexxorraChatError(
            error?.message ||
                "The AI stream could not be read.",
            {
                code:
                    "stream_read_error",

                retryable: true,

                cause: error
            }
        );
    } finally {
        signal?.removeEventListener(
            "abort",
            abortHandler
        );

        try {
            reader.releaseLock();
        } catch {
            // Lock may already be released.
        }
    }
}


/* =========================================================
   41. RAW TEXT STREAM READER
========================================================= */

export async function readTextChatStream(
    response,
    {
        signal = null,
        onChunk = null
    } = {}
) {
    const body =
        ensureReadableBody(response);

    const reader =
        body.getReader();

    const decoder =
        new TextDecoder(
            "utf-8"
        );

    let content = "";

    const abortHandler = async () => {
        await safelyCancelReader(
            reader
        );
    };

    signal?.addEventListener(
        "abort",
        abortHandler,
        {
            once: true
        }
    );

    try {
        while (true) {
            if (signal?.aborted) {
                throw createAbortError();
            }

            const {
                value,
                done
            } = await reader.read();

            if (done) {
                break;
            }

            const chunk =
                decoder.decode(
                    value,
                    {
                        stream: true
                    }
                );

            if (!chunk) {
                continue;
            }

            content += chunk;

            onChunk?.(
                chunk,
                {
                    accumulatedContent:
                        content
                }
            );
        }

        const finalChunk =
            decoder.decode();

        if (finalChunk) {
            content += finalChunk;

            onChunk?.(
                finalChunk,
                {
                    accumulatedContent:
                        content
                }
            );
        }

        if (!content.trim()) {
            throw new nexxorraChatError(
                "The AI stream returned no text.",
                {
                    code:
                        "empty_text_stream"
                }
            );
        }

        return {
            content,
            metadata: {
                streamType:
                    "text"
            }
        };
    } catch (error) {
        if (
            signal?.aborted ||
            error?.name === "AbortError"
        ) {
            throw createAbortError();
        }

        if (
            error instanceof
            nexxorraChatError
        ) {
            throw error;
        }

        throw new nexxorraChatError(
            error?.message ||
                "The text stream could not be read.",
            {
                code:
                    "text_stream_error",

                retryable: true,

                cause: error
            }
        );
    } finally {
        signal?.removeEventListener(
            "abort",
            abortHandler
        );

        try {
            reader.releaseLock();
        } catch {
            // Lock may already be released.
        }
    }
}


/* =========================================================
   42. NEWLINE JSON STREAM PARSER
========================================================= */

function extractJSONLines(buffer) {
    const normalizedBuffer =
        String(buffer || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

    const lines =
        normalizedBuffer.split("\n");

    const remainder =
        lines.pop() || "";

    return {
        lines:
            lines.filter(
                line =>
                    line.trim()
            ),

        remainder
    };
}


/* =========================================================
   43. PROCESS JSON LINE EVENT
========================================================= */

function processJSONLine(
    line,
    streamState,
    callbacks
) {
    const trimmedLine =
        String(line || "").trim();

    if (!trimmedLine) {
        return;
    }

    const parsed =
        safeParseJSON(
            trimmedLine,
            null
        );

    if (parsed === null) {
        const textDelta =
            trimmedLine;

        streamState.content +=
            textDelta;

        callbacks.onChunk?.(
            textDelta,
            {
                accumulatedContent:
                    streamState.content
            }
        );

        return;
    }

    if (
        isStreamErrorEvent(
            parsed.type,
            parsed
        )
    ) {
        throw createStreamError(
            parsed
        );
    }

    if (
        isStreamCompletionEvent(
            parsed.type,
            parsed
        )
    ) {
        streamState.completed = true;

        streamState.metadata =
            mergeStreamMetadata(
                streamState.metadata,
                extractStreamMetadata(
                    parsed
                )
            );

        callbacks.onEvent?.({
            type: "complete",
            data: parsed
        });

        return;
    }

    const textDelta =
        extractStreamTextDelta(
            parsed
        );

    streamState.metadata =
        mergeStreamMetadata(
            streamState.metadata,
            extractStreamMetadata(
                parsed
            )
        );

    if (textDelta) {
        streamState.content +=
            textDelta;

        callbacks.onChunk?.(
            textDelta,
            {
                accumulatedContent:
                    streamState.content,

                data: parsed
            }
        );
    }

    callbacks.onEvent?.({
        type:
            textDelta
                ? "chunk"
                : "event",

        data: parsed
    });
}


/* =========================================================
   44. JSON LINE STREAM READER
========================================================= */

export async function readJSONLineChatStream(
    response,
    {
        signal = null,
        onChunk = null,
        onEvent = null
    } = {}
) {
    const body =
        ensureReadableBody(response);

    const reader =
        body.getReader();

    const decoder =
        new TextDecoder(
            "utf-8"
        );

    const streamState = {
        content: "",
        metadata: {},
        completed: false
    };

    let buffer = "";

    const abortHandler = async () => {
        await safelyCancelReader(
            reader
        );
    };

    signal?.addEventListener(
        "abort",
        abortHandler,
        {
            once: true
        }
    );

    try {
        while (true) {
            if (signal?.aborted) {
                throw createAbortError();
            }

            const {
                value,
                done
            } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(
                value,
                {
                    stream: true
                }
            );

            const extraction =
                extractJSONLines(
                    buffer
                );

            buffer =
                extraction.remainder;

            for (
                const line of
                extraction.lines
            ) {
                processJSONLine(
                    line,
                    streamState,
                    {
                        onChunk,
                        onEvent
                    }
                );
            }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
            processJSONLine(
                buffer,
                streamState,
                {
                    onChunk,
                    onEvent
                }
            );
        }

        if (
            !streamState.content.trim()
        ) {
            throw new nexxorraChatError(
                "The AI JSON stream returned no content.",
                {
                    code:
                        "empty_json_stream"
                }
            );
        }

        return {
            content:
                streamState.content,

            conversationId:
                streamState
                    .metadata
                    .conversationId ||
                null,

            messageId:
                streamState
                    .metadata
                    .messageId ||
                null,

            model:
                streamState
                    .metadata
                    .model ||
                null,

            usage:
                streamState
                    .metadata
                    .usage ||
                null,

            metadata: {
                ...streamState.metadata,

                completed:
                    streamState.completed,

                streamType:
                    "json-lines"
            }
        };
    } catch (error) {
        if (
            signal?.aborted ||
            error?.name === "AbortError"
        ) {
            throw createAbortError();
        }

        if (
            error instanceof
            nexxorraChatError
        ) {
            throw error;
        }

        throw new nexxorraChatError(
            error?.message ||
                "The AI JSON stream could not be read.",
            {
                code:
                    "json_stream_error",

                retryable: true,

                cause: error
            }
        );
    } finally {
        signal?.removeEventListener(
            "abort",
            abortHandler
        );

        try {
            reader.releaseLock();
        } catch {
            // Lock may already be released.
        }
    }
}


/* =========================================================
   45. JSON RESPONSE FALLBACK DURING STREAM REQUEST
========================================================= */

async function readStreamingJSONFallback(
    response,
    {
        onChunk = null
    } = {}
) {
    const data =
        await readJSONChatResponse(
            response
        );

    const normalized =
        normalizeChatResponseData(
            data
        );

    if (normalized.content) {
        onChunk?.(
            normalized.content,
            {
                accumulatedContent:
                    normalized.content,

                fallback:
                    "json"
            }
        );
    }

    return normalized;
}


/* =========================================================
   46. STREAM CONTENT TYPE ROUTING
========================================================= */

async function routeStreamingResponse(
    fetchResult,
    {
        signal = null,
        onChunk = null,
        onEvent = null
    } = {}
) {
    const {
        response,
        contentType,
        isJSON,
        isEventStream
    } = fetchResult;

    if (isEventStream) {
        return await readSSEChatResponse(
            response,
            {
                signal,
                onChunk,
                onEvent
            }
        );
    }

    if (
        contentType.includes(
            "application/x-ndjson"
        ) ||
        contentType.includes(
            "application/ndjson"
        ) ||
        contentType.includes(
            "application/json-seq"
        )
    ) {
        return await readJSONLineChatStream(
            response,
            {
                signal,
                onChunk,
                onEvent
            }
        );
    }

    if (isJSON) {
        return await readStreamingJSONFallback(
            response,
            {
                onChunk
            }
        );
    }

    return await readTextChatStream(
        response,
        {
            signal,
            onChunk
        }
    );
}


/* =========================================================
   47. STREAM CALLBACK SAFETY
========================================================= */

function createSafeCallback(
    callback,
    callbackName
) {
    if (
        typeof callback !== "function"
    ) {
        return null;
    }

    return (...argumentsList) => {
        try {
            callback(
                ...argumentsList
            );
        } catch (error) {
            console.error(
                `${callbackName} callback failed:`,
                error
            );
        }
    };
}


/* =========================================================
   48. STREAMING CHAT RESPONSE
========================================================= */

export async function streamChatResponse(
    payload,
    {
        signal = null,
        timeout =
            CHAT_CONFIG.request.timeout,
        onChunk = null,
        onEvent = null,
        onStart = null,
        onComplete = null
    } = {}
) {
    const safeOnChunk =
        createSafeCallback(
            onChunk,
            "onChunk"
        );

    const safeOnEvent =
        createSafeCallback(
            onEvent,
            "onEvent"
        );

    const safeOnStart =
        createSafeCallback(
            onStart,
            "onStart"
        );

    const safeOnComplete =
        createSafeCallback(
            onComplete,
            "onComplete"
        );

    safeOnStart?.({
        startedAt:
            new Date().toISOString()
    });

    const fetchResult =
        await executeChatFetch(
            payload,
            {
                streaming: true,
                signal,
                timeout
            }
        );

    safeOnEvent?.({
        type: "connected",

        requestId:
            fetchResult.requestId,

        contentType:
            fetchResult.contentType
    });

    try {
        const result =
            await routeStreamingResponse(
                fetchResult,
                {
                    signal,
                    onChunk:
                        safeOnChunk,

                    onEvent:
                        safeOnEvent
                }
            );

        const finalResult = {
            ...result,

            metadata: {
                ...(result.metadata ||
                    {}),

                requestId:
                    fetchResult
                        .requestId,

                contentType:
                    fetchResult
                        .contentType,

                completedAt:
                    new Date()
                        .toISOString()
            }
        };

        safeOnComplete?.(
            finalResult
        );

        return finalResult;
    } catch (error) {
        if (
            error?.name === "AbortError"
        ) {
            throw error;
        }

        if (
            error instanceof
            nexxorraChatError
        ) {
            throw error;
        }

        throw new nexxorraChatError(
            error?.message ||
                "The streaming AI request failed.",
            {
                code:
                    "stream_request_error",

                retryable: true,

                cause: error
            }
        );
    }
}


/* =========================================================
   49. STREAM SUPPORT CHECK
========================================================= */

export function supportsStreamingResponses() {
    return Boolean(
        typeof ReadableStream !==
            "undefined" &&
        typeof TextDecoder !==
            "undefined" &&
        typeof Response !==
            "undefined" &&
        Response.prototype.body !==
            undefined
    );
}


/* =========================================================
   50. REQUEST WITH AUTOMATIC STREAM FALLBACK
========================================================= */

export async function requestAIResponse(
    payload,
    {
        signal = null,
        timeout =
            CHAT_CONFIG.request.timeout,
        streaming = true,
        onChunk = null,
        onEvent = null
    } = {}
) {
    const shouldStream =
        Boolean(streaming) &&
        supportsStreamingResponses();

    if (shouldStream) {
        try {
            return await streamChatResponse(
                payload,
                {
                    signal,
                    timeout,
                    onChunk,
                    onEvent
                }
            );
        } catch (error) {
            if (
                error?.name ===
                "AbortError"
            ) {
                throw error;
            }

            const canFallback =
                error?.code ===
                    "unsupported_stream" ||
                error?.code ===
                    "missing_stream_body" ||
                error?.code ===
                    "invalid_json_response";

            if (!canFallback) {
                throw error;
            }

            console.warn(
                "Streaming failed. nexxorra is using a complete response fallback.",
                error
            );
        }
    }

    const result =
        await sendChatRequest(
            payload,
            {
                signal,
                timeout
            }
        );

    if (
        result.content &&
        typeof onChunk === "function"
    ) {
        onChunk(
            result.content,
            {
                accumulatedContent:
                    result.content,

                fallback:
                    "complete-response"
            }
        );
    }

    return result;
}


/* =========================================================
   51. STREAM CONNECTION TEST
========================================================= */

export async function testChatConnection({
    signal = null,
    timeout = 12000
} = {}) {
    const testPayload = {
        conversationId:
            "connection-test",

        messageId:
            "connection-test-message",

        guestId:
            "connection-test-guest",

        responseMode:
            "fast",

        messages: [
            {
                role: "user",
                content:
                    "Reply with the word connected."
            }
        ],

        attachments: [],

        metadata: {
            connectionTest: true
        }
    };

    try {
        const result =
            await requestAIResponse(
                testPayload,
                {
                    signal,
                    timeout,
                    streaming: false
                }
            );

        return {
            connected: true,

            content:
                result.content,

            metadata:
                result.metadata ||
                {}
        };
    } catch (error) {
        return {
            connected: false,

            error: {
                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    "Connection test failed.",

                code:
                    error?.code ||
                    "connection_test_failed",

                status:
                    error?.status ||
                    0
            }
        };
    }
}


/* =========================================================
   52. PART 2 EXPORTS
========================================================= */

export {
    parseSSEEventBlock,

    extractSSEBlocks,

    parseStreamData,

    extractStreamTextDelta,

    extractStreamMetadata,

    createStreamError,

    routeStreamingResponse
};
/* =========================================================
   nexxorra AI — CHAT API CLIENT
   File: chat.js
   Part 3: Request Queue, Duplicate Prevention, Retry,
           Attachment Utilities, Diagnostics and Final API
========================================================= */


/* =========================================================
   53. CHAT CLIENT STATE
========================================================= */

const chatClientState = {
    activeRequests: new Map(),
    recentRequestHashes: new Map(),
    requestQueue: [],
    processingQueue: false,
    online: navigator.onLine,
    lastSuccessfulRequestAt: null,
    lastFailedRequestAt: null
};


/* =========================================================
   54. REQUEST HASHING
========================================================= */

function createSimpleHash(value) {
    const source = String(value || "");

    let hash = 0;

    for (
        let index = 0;
        index < source.length;
        index += 1
    ) {
        hash =
            (hash << 5) -
            hash +
            source.charCodeAt(index);

        hash |= 0;
    }

    return Math.abs(hash)
        .toString(36);
}

function createPayloadHash(payload) {
    const messages = Array.isArray(
        payload?.messages
    )
        ? payload.messages
        : [];

    const normalizedMessages =
        messages.map(message => ({
            role: message.role,
            content: normalizeText(
                message.content
            )
        }));

    const attachmentSummary =
        Array.isArray(payload?.attachments)
            ? payload.attachments.map(
                  attachment => ({
                      name:
                          attachment?.name ||
                          "",
                      size:
                          attachment?.size ||
                          0,
                      type:
                          attachment?.type ||
                          ""
                  })
              )
            : [];

    const source = JSON.stringify({
        conversationId:
            payload?.conversationId ||
            null,

        responseMode:
            normalizeResponseMode(
                payload?.responseMode
            ),

        messages:
            normalizedMessages,

        attachments:
            attachmentSummary
    });

    return createSimpleHash(source);
}


/* =========================================================
   55. DUPLICATE REQUEST DETECTION
========================================================= */

function cleanupRecentRequestHashes() {
    const currentTime = Date.now();
    const retentionTime = 5000;

    chatClientState
        .recentRequestHashes
        .forEach(
            (timestamp, hash) => {
                if (
                    currentTime -
                        timestamp >
                    retentionTime
                ) {
                    chatClientState
                        .recentRequestHashes
                        .delete(hash);
                }
            }
        );
}

function isDuplicateRequest(
    payload,
    windowMilliseconds = 1200
) {
    cleanupRecentRequestHashes();

    const payloadHash =
        createPayloadHash(payload);

    const previousTimestamp =
        chatClientState
            .recentRequestHashes
            .get(payloadHash);

    const currentTimestamp =
        Date.now();

    if (
        previousTimestamp &&
        currentTimestamp -
            previousTimestamp <
            windowMilliseconds
    ) {
        return true;
    }

    chatClientState
        .recentRequestHashes
        .set(
            payloadHash,
            currentTimestamp
        );

    return false;
}


/* =========================================================
   56. ACTIVE REQUEST REGISTRY
========================================================= */

function registerActiveRequest({
    requestId,
    controller,
    payload,
    streaming
}) {
    chatClientState.activeRequests.set(
        requestId,
        {
            requestId,
            controller,
            payload,
            streaming,
            startedAt:
                new Date().toISOString()
        }
    );
}

function unregisterActiveRequest(
    requestId
) {
    if (!requestId) return;

    chatClientState.activeRequests.delete(
        requestId
    );
}

export function getActiveChatRequests() {
    return [
        ...chatClientState
            .activeRequests
            .values()
    ].map(request => ({
        requestId:
            request.requestId,

        streaming:
            request.streaming,

        startedAt:
            request.startedAt,

        conversationId:
            request.payload
                ?.conversationId ||
            null
    }));
}


/* =========================================================
   57. REQUEST CANCELLATION
========================================================= */

export function cancelChatRequest(
    requestId
) {
    const activeRequest =
        chatClientState
            .activeRequests
            .get(requestId);

    if (!activeRequest) {
        return false;
    }

    activeRequest.controller.abort(
        createAbortError()
    );

    unregisterActiveRequest(
        requestId
    );

    return true;
}

export function cancelAllChatRequests() {
    const activeRequests = [
        ...chatClientState
            .activeRequests
            .values()
    ];

    activeRequests.forEach(
        activeRequest => {
            activeRequest.controller.abort(
                createAbortError()
            );
        }
    );

    chatClientState
        .activeRequests
        .clear();

    return activeRequests.length;
}


/* =========================================================
   58. SIGNAL COMBINATION
========================================================= */

function combineAbortSignals(
    signals = []
) {
    const validSignals =
        signals.filter(Boolean);

    if (!validSignals.length) {
        return {
            signal: null,
            cleanup() {}
        };
    }

    const controller =
        new AbortController();

    const listeners = [];

    validSignals.forEach(signal => {
        if (signal.aborted) {
            controller.abort(
                signal.reason ||
                createAbortError()
            );

            return;
        }

        const listener = () => {
            if (
                !controller
                    .signal
                    .aborted
            ) {
                controller.abort(
                    signal.reason ||
                    createAbortError()
                );
            }
        };

        signal.addEventListener(
            "abort",
            listener,
            {
                once: true
            }
        );

        listeners.push({
            signal,
            listener
        });
    });

    function cleanup() {
        listeners.forEach(
            ({
                signal,
                listener
            }) => {
                signal.removeEventListener(
                    "abort",
                    listener
                );
            }
        );
    }

    return {
        signal:
            controller.signal,

        cleanup
    };
}


/* =========================================================
   59. NETWORK STATUS
========================================================= */

function updateNetworkState() {
    chatClientState.online =
        navigator.onLine;
}

window.addEventListener(
    "online",
    updateNetworkState
);

window.addEventListener(
    "offline",
    updateNetworkState
);

export function isChatClientOnline() {
    return Boolean(
        chatClientState.online
    );
}


/* =========================================================
   60. OFFLINE VALIDATION
========================================================= */

function ensureOnline() {
    if (
        !chatClientState.online
    ) {
        throw new nexxorraChatError(
            "You are currently offline.",
            {
                code: "offline",
                retryable: true
            }
        );
    }
}


/* =========================================================
   61. MANUAL RETRY POLICY
========================================================= */

function shouldManuallyRetry(error) {
    if (!error) {
        return false;
    }

    if (
        error.name === "AbortError"
    ) {
        return false;
    }

    const retryableCodes = [
        "network_error",
        "server_error",
        "rate_limit",
        "request_timeout",
        "stream_read_error",
        "stream_request_error",
        "json_stream_error",
        "text_stream_error"
    ];

    return (
        Boolean(error.retryable) ||
        retryableCodes.includes(
            error.code
        )
    );
}

function calculateManualRetryDelay(
    attempt
) {
    const baseDelay =
        CHAT_CONFIG.retry
            .initialDelay;

    const exponentialDelay =
        baseDelay *
        2 ** Math.max(
            0,
            attempt - 1
        );

    const jitter =
        Math.floor(
            Math.random() * 300
        );

    return Math.min(
        exponentialDelay +
            jitter,
        CHAT_CONFIG.retry
            .maximumDelay
    );
}


/* =========================================================
   62. RETRY WRAPPER
========================================================= */

export async function withChatRetry(
    callback,
    {
        signal = null,
        maximumAttempts = 2,
        onRetry = null
    } = {}
) {
    if (
        typeof callback !==
        "function"
    ) {
        throw new nexxorraChatError(
            "A retry callback is required.",
            {
                code:
                    "invalid_retry_callback"
            }
        );
    }

    let attempt = 0;
    let latestError = null;

    while (
        attempt < maximumAttempts
    ) {
        attempt += 1;

        if (signal?.aborted) {
            throw createAbortError();
        }

        try {
            return await callback({
                attempt,
                signal
            });
        } catch (error) {
            latestError =
                error instanceof
                nexxorraChatError
                    ? error
                    : normalizeFetchError(
                          error
                      );

            if (
                attempt >=
                    maximumAttempts ||
                !shouldManuallyRetry(
                    latestError
                )
            ) {
                throw latestError;
            }

            const delay =
                calculateManualRetryDelay(
                    attempt
                );

            try {
                onRetry?.({
                    attempt,
                    delay,
                    error:
                        latestError
                });
            } catch (callbackError) {
                console.error(
                    "Retry callback failed:",
                    callbackError
                );
            }

            await wait(
                delay,
                signal
            );
        }
    }

    throw (
        latestError ||
        new nexxorraChatError(
            "The request could not be retried.",
            {
                code:
                    "retry_failed"
            }
        )
    );
}


/* =========================================================
   63. QUEUED REQUEST FACTORY
========================================================= */

function createQueuedRequest({
    payload,
    options,
    resolve,
    reject
}) {
    return {
        id: createRequestId(),
        payload,
        options,
        resolve,
        reject,
        queuedAt:
            new Date().toISOString()
    };
}


/* =========================================================
   64. REQUEST QUEUE
========================================================= */

export function queueChatRequest(
    payload,
    options = {}
) {
    return new Promise(
        (resolve, reject) => {
            const queuedRequest =
                createQueuedRequest({
                    payload,
                    options,
                    resolve,
                    reject
                });

            chatClientState
                .requestQueue
                .push(
                    queuedRequest
                );

            processChatQueue();
        }
    );
}

async function processChatQueue() {
    if (
        chatClientState
            .processingQueue
    ) {
        return;
    }

    chatClientState.processingQueue =
        true;

    try {
        while (
            chatClientState
                .requestQueue
                .length
        ) {
            const queuedRequest =
                chatClientState
                    .requestQueue
                    .shift();

            try {
                const result =
                    await requestChat({
                        payload:
                            queuedRequest
                                .payload,

                        ...queuedRequest
                            .options
                    });

                queuedRequest.resolve(
                    result
                );
            } catch (error) {
                queuedRequest.reject(
                    error
                );
            }
        }
    } finally {
        chatClientState.processingQueue =
            false;
    }
}

export function clearChatQueue() {
    const queuedRequests =
        chatClientState
            .requestQueue
            .splice(0);

    queuedRequests.forEach(
        queuedRequest => {
            queuedRequest.reject(
                new nexxorraChatError(
                    "The queued request was cancelled.",
                    {
                        code:
                            "queue_cancelled"
                    }
                )
            );
        }
    );

    return queuedRequests.length;
}


/* =========================================================
   65. HIGH-LEVEL CHAT REQUEST
========================================================= */

export async function requestChat({
    payload,
    signal = null,
    streaming = true,
    timeout =
        CHAT_CONFIG.request.timeout,
    preventDuplicates = true,
    onChunk = null,
    onEvent = null,
    onStart = null,
    onComplete = null,
    onRetry = null
} = {}) {
    ensureOnline();

    if (
        preventDuplicates &&
        isDuplicateRequest(payload)
    ) {
        throw new nexxorraChatError(
            "This message was already sent.",
            {
                code:
                    "duplicate_request",
                retryable: false
            }
        );
    }

    const internalController =
        new AbortController();

    const combinedSignal =
        combineAbortSignals([
            signal,
            internalController.signal
        ]);

    const clientRequestId =
        createRequestId();

    registerActiveRequest({
        requestId:
            clientRequestId,

        controller:
            internalController,

        payload,

        streaming
    });

    try {
        const result =
            await withChatRetry(
                async () => {
                    return await requestAIResponse(
                        payload,
                        {
                            signal:
                                combinedSignal
                                    .signal,

                            timeout,

                            streaming,

                            onChunk,

                            onEvent
                        }
                    );
                },
                {
                    signal:
                        combinedSignal
                            .signal,

                    maximumAttempts:
                        CHAT_CONFIG.retry
                            .maximumAttempts,

                    onRetry
                }
            );

        chatClientState
            .lastSuccessfulRequestAt =
            new Date().toISOString();

        onComplete?.(result);

        return {
            ...result,

            metadata: {
                ...(result.metadata ||
                    {}),

                clientRequestId
            }
        };
    } catch (error) {
        chatClientState
            .lastFailedRequestAt =
            new Date().toISOString();

        throw error;
    } finally {
        unregisterActiveRequest(
            clientRequestId
        );

        combinedSignal.cleanup();
    }
}


/* =========================================================
   66. CONVERSATION CONTEXT TRIMMING
========================================================= */

export function trimConversationContext(
    messages,
    {
        maximumMessages =
            CHAT_CONFIG.request
                .maximumMessages,

        maximumCharacters =
            CHAT_CONFIG.request
                .maximumTotalCharacters
    } = {}
) {
    if (!Array.isArray(messages)) {
        return [];
    }

    const validMessages =
        messages
            .filter(message => {
                return (
                    message &&
                    CHAT_CONFIG
                        .allowedRoles
                        .includes(
                            message.role
                        ) &&
                    typeof message.content ===
                        "string" &&
                    message.content
                        .trim()
                );
            })
            .slice(
                -maximumMessages
            );

    const selectedMessages = [];
    let characterCount = 0;

    for (
        let index =
            validMessages.length - 1;
        index >= 0;
        index -= 1
    ) {
        const message =
            validMessages[index];

        const messageLength =
            message.content.length;

        if (
            characterCount +
                messageLength >
                maximumCharacters &&
            selectedMessages.length
        ) {
            break;
        }

        selectedMessages.unshift({
            role:
                message.role,

            content:
                message.content
        });

        characterCount +=
            messageLength;
    }

    return selectedMessages;
}


/* =========================================================
   67. ATTACHMENT METADATA
========================================================= */

export function createAttachmentMetadata(
    file
) {
    validateAttachmentFile(file);

    return {
        name: file.name,
        size: file.size,
        type:
            file.type ||
            "application/octet-stream",

        extension:
            getFileExtension(
                file.name
            ),

        lastModified:
            file.lastModified
    };
}

export function createAttachmentMetadataList(
    files
) {
    return normalizeAttachmentFiles(
        files
    ).map(
        createAttachmentMetadata
    );
}


/* =========================================================
   68. TEXT FILE READER
========================================================= */

export async function readTextAttachment(
    file,
    {
        maximumCharacters = 50000
    } = {}
) {
    validateAttachmentFile(file);

    const extension =
        getFileExtension(
            file.name
        );

    if (
        !["txt", "md"].includes(
            extension
        )
    ) {
        throw new nexxorraChatError(
            "Only TXT and Markdown files can be read directly in the browser.",
            {
                code:
                    "unsupported_text_read"
            }
        );
    }

    try {
        const content =
            await file.text();

        if (
            content.length >
            maximumCharacters
        ) {
            return {
                content:
                    content.slice(
                        0,
                        maximumCharacters
                    ),

                truncated: true,

                originalLength:
                    content.length
            };
        }

        return {
            content,
            truncated: false,
            originalLength:
                content.length
        };
    } catch (error) {
        throw new nexxorraChatError(
            `Could not read ${file.name}.`,
            {
                code:
                    "attachment_read_error",

                cause: error
            }
        );
    }
}


/* =========================================================
   69. IMAGE ATTACHMENT PREVIEW
========================================================= */

export function createImagePreviewURL(
    file
) {
    validateAttachmentFile(file);

    const extension =
        getFileExtension(
            file.name
        );

    if (
        ![
            "png",
            "jpg",
            "jpeg",
            "webp"
        ].includes(extension)
    ) {
        throw new nexxorraChatError(
            "The selected file is not a supported image.",
            {
                code:
                    "invalid_image_attachment"
            }
        );
    }

    return URL.createObjectURL(
        file
    );
}

export function revokeImagePreviewURL(
    url
) {
    if (!url) return;

    URL.revokeObjectURL(url);
}


/* =========================================================
   70. REQUEST SIZE ESTIMATION
========================================================= */

export function estimateChatRequestSize(
    payload
) {
    const messages =
        Array.isArray(
            payload?.messages
        )
            ? payload.messages
            : [];

    const messageBytes =
        new Blob([
            JSON.stringify(
                messages
            )
        ]).size;

    const attachmentBytes =
        Array.isArray(
            payload?.attachments
        )
            ? payload.attachments.reduce(
                  (
                      total,
                      attachment
                  ) => {
                      return (
                          total +
                          Number(
                              attachment
                                  ?.size ||
                                  0
                          )
                      );
                  },
                  0
              )
            : 0;

    return {
        messageBytes,
        attachmentBytes,
        totalBytes:
            messageBytes +
            attachmentBytes
    };
}


/* =========================================================
   71. REQUEST PAYLOAD SUMMARY
========================================================= */

export function summarizeChatPayload(
    payload
) {
    const messages =
        Array.isArray(
            payload?.messages
        )
            ? payload.messages
            : [];

    const attachments =
        Array.isArray(
            payload?.attachments
        )
            ? payload.attachments
            : [];

    const lastMessage =
        messages[
            messages.length - 1
        ] || null;

    return {
        conversationId:
            payload?.conversationId ||
            null,

        responseMode:
            normalizeResponseMode(
                payload?.responseMode
            ),

        messageCount:
            messages.length,

        attachmentCount:
            attachments.length,

        lastRole:
            lastMessage?.role ||
            null,

        lastMessagePreview:
            normalizeText(
                lastMessage?.content
            ).slice(0, 100),

        estimatedSize:
            estimateChatRequestSize(
                payload
            )
    };
}


/* =========================================================
   72. HEALTH STATUS
========================================================= */

export function getChatClientStatus() {
    return {
        online:
            chatClientState.online,

        activeRequestCount:
            chatClientState
                .activeRequests
                .size,

        queuedRequestCount:
            chatClientState
                .requestQueue
                .length,

        processingQueue:
            chatClientState
                .processingQueue,

        lastSuccessfulRequestAt:
            chatClientState
                .lastSuccessfulRequestAt,

        lastFailedRequestAt:
            chatClientState
                .lastFailedRequestAt,

        streamingSupported:
            supportsStreamingResponses(),

        endpoint:
            CHAT_CONFIG.endpoint
    };
}


/* =========================================================
   73. CHAT CLIENT DIAGNOSTICS
========================================================= */

export async function runChatDiagnostics({
    includeConnectionTest = false,
    signal = null
} = {}) {
    const diagnostics = {
        timestamp:
            new Date().toISOString(),

        online:
            navigator.onLine,

        streamingSupported:
            supportsStreamingResponses(),

        fetchSupported:
            typeof fetch ===
            "function",

        formDataSupported:
            typeof FormData !==
            "undefined",

        fileSupported:
            typeof File !==
            "undefined",

        abortControllerSupported:
            typeof AbortController !==
            "undefined",

        textDecoderSupported:
            typeof TextDecoder !==
            "undefined",

        endpoint:
            CHAT_CONFIG.endpoint,

        accessTokenAvailable:
            Boolean(
                await getChatAccessToken()
            ),

        connectionTest: null
    };

    if (includeConnectionTest) {
        diagnostics.connectionTest =
            await testChatConnection({
                signal
            });
    }

    return diagnostics;
}


/* =========================================================
   74. SAFE ERROR SERIALIZATION
========================================================= */

export function serializeChatError(
    error
) {
    return {
        name:
            error?.name ||
            "Error",

        message:
            error?.message ||
            "Unknown error",

        code:
            error?.code ||
            "unknown_error",

        status:
            Number(
                error?.status ||
                error?.statusCode
            ) || 0,

        retryable:
            Boolean(
                error?.retryable
            ),

        details:
            error?.details ||
            null
    };
}


/* =========================================================
   75. HUMAN-READABLE ERROR
========================================================= */

export function getChatErrorMessage(
    error
) {
    const code =
        String(
            error?.code || ""
        ).toLowerCase();

    if (
        error?.name ===
        "AbortError"
    ) {
        return "The response was stopped.";
    }

    const messages = {
        offline:
            "You are offline. Check your connection.",

        network_error:
            "nexxorra could not connect to the server.",

        request_timeout:
            "The AI request took too long.",

        rate_limit:
            "Too many requests were sent. Try again shortly.",

        unauthorized:
            "Your session has expired. Log in again.",

        forbidden:
            "This request is not allowed.",

        payload_too_large:
            "The message or attachment is too large.",

        context_too_large:
            "The conversation is too long. Start a new chat.",

        duplicate_request:
            "This message was already sent.",

        server_error:
            "The AI service is temporarily unavailable.",

        empty_response:
            "The AI returned an empty response.",

        empty_stream_response:
            "The AI stream returned no response."
    };

    return (
        messages[code] ||
        error?.message ||
        "nexxorra could not complete the request."
    );
}


/* =========================================================
   76. SESSION EVENT BRIDGE
========================================================= */

document.addEventListener(
    "nexxorra:auth-session",
    event => {
        const accessToken =
            event.detail
                ?.session
                ?.access_token ||
            null;

        if (accessToken) {
            setChatAccessToken(
                accessToken
            );
        } else {
            clearChatAccessToken();
        }
    }
);

document.addEventListener(
    "nexxorra:logout",
    () => {
        clearChatAccessToken();
        cancelAllChatRequests();
        clearChatQueue();
    }
);


/* =========================================================
   77. PAGE VISIBILITY HANDLING
========================================================= */

document.addEventListener(
    "visibilitychange",
    () => {
        if (
            document.visibilityState ===
            "visible"
        ) {
            updateNetworkState();
        }
    }
);


/* =========================================================
   78. PAGE UNLOAD CLEANUP
========================================================= */

window.addEventListener(
    "pagehide",
    () => {
        cancelAllChatRequests();
        clearChatQueue();
    }
);


/* =========================================================
   79. DEFAULT CLIENT API
========================================================= */

const nexxorraChatClient =
    Object.freeze({
        request:
            requestChat,

        queue:
            queueChatRequest,

        stream:
            streamChatResponse,

        send:
            sendChatRequest,

        requestAI:
            requestAIResponse,

        cancel:
            cancelChatRequest,

        cancelAll:
            cancelAllChatRequests,

        clearQueue:
            clearChatQueue,

        validate:
            validateChatPayload,

        trimContext:
            trimConversationContext,

        testConnection:
            testChatConnection,

        diagnostics:
            runChatDiagnostics,

        status:
            getChatClientStatus,

        serializeError:
            serializeChatError,

        getErrorMessage:
            getChatErrorMessage,

        setAccessToken:
            setChatAccessToken,

        clearAccessToken:
            clearChatAccessToken
    });


/* =========================================================
   80. DEFAULT EXPORT
========================================================= */

export default nexxorraChatClient;