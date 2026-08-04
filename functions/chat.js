/* =========================================================
   NEXORA AI — GEMINI BACKEND
   File: functions/chat.js
========================================================= */

const GEMINI_API_BASE =
    "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash-lite";

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_TOTAL_CHARACTERS = 80000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const ALLOWED_ROLES = new Set([
    "user",
    "assistant",
    "system"
]);

const ALLOWED_FILE_TYPES = new Set([
    "text/plain",
    "text/markdown",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp"
]);


/* =========================================================
   RESPONSE HELPERS
========================================================= */

function jsonResponse(
    body,
    status = 200,
    additionalHeaders = {}
) {
    return new Response(
        JSON.stringify(body),
        {
            status,

            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "no-store",

                "X-Content-Type-Options":
                    "nosniff",

                ...additionalHeaders
            }
        }
    );
}

function errorResponse(
    message,
    {
        status = 500,
        code = "server_error",
        retryable = false,
        details = null
    } = {}
) {
    return jsonResponse(
        {
            error: {
                message,
                code,
                status,
                retryable,
                details
            }
        },
        status
    );
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

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

function createRequestId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
}

function mapGeminiRole(role) {
    return role === "assistant"
        ? "model"
        : "user";
}

function bufferToBase64(buffer) {
    const bytes =
        new Uint8Array(buffer);

    let binary = "";

    const chunkSize = 8192;

    for (
        let index = 0;
        index < bytes.length;
        index += chunkSize
    ) {
        binary += String.fromCharCode(
            ...bytes.subarray(
                index,
                index + chunkSize
            )
        );
    }

    return btoa(binary);
}


/* =========================================================
   REQUEST BODY PARSING
========================================================= */

async function parseRequestBody(request) {
    const contentType =
        request.headers
            .get("content-type")
            ?.toLowerCase() || "";

    if (
        contentType.includes(
            "multipart/form-data"
        )
    ) {
        return await parseMultipartBody(
            request
        );
    }

    if (
        !contentType.includes(
            "application/json"
        )
    ) {
        throw {
            status: 415,
            code: "unsupported_content_type",
            message:
                "Use application/json or multipart/form-data."
        };
    }

    let body;

    try {
        body = await request.json();
    } catch {
        throw {
            status: 400,
            code: "invalid_json",
            message:
                "The request body is not valid JSON."
        };
    }

    return {
        payload: body,
        files: []
    };
}

async function parseMultipartBody(request) {
    let formData;

    try {
        formData =
            await request.formData();
    } catch {
        throw {
            status: 400,
            code: "invalid_multipart_body",
            message:
                "The attachment request could not be read."
        };
    }

    const payloadText =
        formData.get("payload");

    if (
        typeof payloadText !== "string"
    ) {
        throw {
            status: 400,
            code: "missing_payload",
            message:
                "The multipart payload is missing."
        };
    }

    let payload;

    try {
        payload =
            JSON.parse(payloadText);
    } catch {
        throw {
            status: 400,
            code: "invalid_payload_json",
            message:
                "The multipart payload is not valid JSON."
        };
    }

    const files =
        formData
            .getAll("attachments")
            .filter(
                item =>
                    typeof File !== "undefined" &&
                    item instanceof File
            );

    return {
        payload,
        files
    };
}


/* =========================================================
   PAYLOAD VALIDATION
========================================================= */

function validatePayload(
    payload,
    files
) {
    if (!isPlainObject(payload)) {
        throw {
            status: 400,
            code: "invalid_payload",
            message:
                "The chat payload is invalid."
        };
    }

    if (!Array.isArray(payload.messages)) {
        throw {
            status: 400,
            code: "invalid_messages",
            message:
                "Messages must be an array."
        };
    }

    if (!payload.messages.length) {
        throw {
            status: 400,
            code: "empty_conversation",
            message:
                "At least one message is required."
        };
    }

    const messages =
        payload.messages.slice(
            -MAX_MESSAGES
        );

    let totalCharacters = 0;

    const normalizedMessages =
        messages.map(
            (message, index) => {
                if (
                    !isPlainObject(message)
                ) {
                    throw {
                        status: 400,
                        code: "invalid_message",
                        message:
                            `Message ${index + 1} is invalid.`
                    };
                }

                const role =
                    normalizeText(
                        message.role
                    ).toLowerCase();

                const content =
                    normalizeText(
                        message.content
                    );

                if (
                    !ALLOWED_ROLES.has(role)
                ) {
                    throw {
                        status: 400,
                        code: "invalid_role",
                        message:
                            `Message ${index + 1} has an invalid role.`
                    };
                }

                if (!content) {
                    throw {
                        status: 400,
                        code: "empty_message",
                        message:
                            `Message ${index + 1} is empty.`
                    };
                }

                if (
                    content.length >
                    MAX_MESSAGE_LENGTH
                ) {
                    throw {
                        status: 413,
                        code: "message_too_long",
                        message:
                            `Message ${index + 1} is too long.`
                    };
                }

                totalCharacters +=
                    content.length;

                return {
                    role,
                    content
                };
            }
        );

    if (
        totalCharacters >
        MAX_TOTAL_CHARACTERS
    ) {
        throw {
            status: 413,
            code: "context_too_large",
            message:
                "The conversation context is too large."
        };
    }

    if (
        files.length >
        MAX_ATTACHMENTS
    ) {
        throw {
            status: 413,
            code: "too_many_attachments",
            message:
                `A maximum of ${MAX_ATTACHMENTS} attachments is allowed.`
        };
    }

    files.forEach(file => {
        if (
            file.size >
            MAX_ATTACHMENT_SIZE
        ) {
            throw {
                status: 413,
                code: "attachment_too_large",
                message:
                    `${file.name} is larger than 10 MB.`
            };
        }

        if (
            !ALLOWED_FILE_TYPES.has(
                file.type
            )
        ) {
            throw {
                status: 415,
                code:
                    "unsupported_attachment_type",

                message:
                    `${file.name} is not a supported attachment type.`
            };
        }
    });

    return {
        messages:
            normalizedMessages,

        files,

        responseMode:
            normalizeResponseMode(
                payload.responseMode
            ),

        conversationId:
            normalizeText(
                payload.conversationId
            ) || null,

        messageId:
            normalizeText(
                payload.messageId
            ) || null,

        requestId:
            normalizeText(
                payload.requestId
            ) ||
            createRequestId()
    };
}

function normalizeResponseMode(mode) {
    const normalized =
        normalizeText(mode)
            .toLowerCase();

    return [
        "fast",
        "balanced",
        "deep"
    ].includes(normalized)
        ? normalized
        : "balanced";
}


/* =========================================================
   GEMINI CONFIGURATION
========================================================= */

function getGenerationConfig(
    responseMode
) {
    const configurations = {
        fast: {
            temperature: 0.5,
            topP: 0.85,
            maxOutputTokens: 1200
        },

        balanced: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 2400
        },

        deep: {
            temperature: 0.65,
            topP: 0.95,
            maxOutputTokens: 4096
        }
    };

    return configurations[
        responseMode
    ] || configurations.balanced;
}

function createSystemInstruction(
    responseMode
) {
    const modeInstructions = {
        fast:
            "Keep answers direct, concise, and practical.",

        balanced:
            "Give a clear, accurate, well-structured answer with useful detail.",

        deep:
            "Reason carefully, explain important steps, and provide a thorough answer without unnecessary repetition."
    };

    return {
        parts: [
            {
                text: [
                    "You are Nexora AI, a helpful AI assistant.",
                    "Answer accurately and clearly.",
                    "Use Markdown when it improves readability.",
                    "Put programming code inside fenced code blocks.",
                    "Do not claim to have performed actions you did not perform.",
                    modeInstructions[
                        responseMode
                    ]
                ].join(" ")
            }
        ]
    };
}


/* =========================================================
   GEMINI CONTENT CONVERSION
========================================================= */

function buildGeminiContents(
    messages
) {
    const contents = [];
    const systemMessages = [];

    messages.forEach(message => {
        if (
            message.role === "system"
        ) {
            systemMessages.push(
                message.content
            );

            return;
        }

        const mappedRole =
            mapGeminiRole(
                message.role
            );

        const previous =
            contents[
                contents.length - 1
            ];

        /*
           Gemini expects alternating user/model turns.
           Consecutive messages with the same role are merged.
        */

        if (
            previous &&
            previous.role ===
                mappedRole
        ) {
            previous.parts[0].text +=
                `\n\n${message.content}`;

            return;
        }

        contents.push({
            role: mappedRole,

            parts: [
                {
                    text:
                        message.content
                }
            ]
        });
    });

    return {
        contents,

        additionalSystemText:
            systemMessages.join("\n\n")
    };
}


/* =========================================================
   ATTACHMENTS
========================================================= */

async function addAttachmentsToContents(
    contents,
    files
) {
    if (!files.length) {
        return contents;
    }

    let lastUserContent = null;

    for (
        let index =
            contents.length - 1;
        index >= 0;
        index -= 1
    ) {
        if (
            contents[index].role ===
            "user"
        ) {
            lastUserContent =
                contents[index];

            break;
        }
    }

    if (!lastUserContent) {
        lastUserContent = {
            role: "user",
            parts: [
                {
                    text:
                        "Review the attached files."
                }
            ]
        };

        contents.push(
            lastUserContent
        );
    }

    for (const file of files) {
        if (
            file.type === "text/plain" ||
            file.type ===
                "text/markdown"
        ) {
            const fileText =
                await file.text();

            lastUserContent.parts.push({
                text:
                    `\n\nAttachment: ${file.name}\n${fileText.slice(
                        0,
                        50000
                    )}`
            });

            continue;
        }

        const buffer =
            await file.arrayBuffer();

        lastUserContent.parts.push({
            inlineData: {
                mimeType:
                    file.type,

                data:
                    bufferToBase64(
                        buffer
                    )
            }
        });
    }

    return contents;
}


/* =========================================================
   GEMINI RESPONSE PARSING
========================================================= */

function extractGeminiText(data) {
    const parts =
        data?.candidates?.[0]
            ?.content?.parts;

    if (!Array.isArray(parts)) {
        return "";
    }

    return parts
        .map(part => {
            return typeof part?.text ===
                "string"
                ? part.text
                : "";
        })
        .join("")
        .trim();
}

function getGeminiFinishReason(data) {
    return (
        data?.candidates?.[0]
            ?.finishReason ||
        null
    );
}


/* =========================================================
   GEMINI API ERROR
========================================================= */

async function parseGeminiError(
    response
) {
    let data = null;

    try {
        data =
            await response.json();
    } catch {
        // Gemini may return an empty error response.
    }

    const message =
        data?.error?.message ||
        `Gemini request failed with status ${response.status}.`;

    if (response.status === 400) {
        return {
            status: 400,
            code:
                "invalid_gemini_request",
            message,
            retryable: false
        };
    }

    if (
        response.status === 401 ||
        response.status === 403
    ) {
        return {
            status: response.status,
            code:
                "invalid_gemini_key",
            message:
                "The Gemini API key is missing, invalid, or not permitted.",
            retryable: false
        };
    }

    if (response.status === 429) {
        return {
            status: 429,
            code:
                "gemini_rate_limit",
            message:
                "The free Gemini request limit was reached. Try again later.",
            retryable: true
        };
    }

    if (response.status >= 500) {
        return {
            status: response.status,
            code:
                "gemini_service_error",
            message:
                "Gemini is temporarily unavailable.",
            retryable: true
        };
    }

    return {
        status:
            response.status,

        code:
            "gemini_api_error",

        message,

        retryable: false
    };
}


/* =========================================================
   CALL GEMINI
========================================================= */

async function callGemini({
    messages,
    files,
    responseMode,
    requestId
}) {
    const apiKey =
        process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw {
            status: 500,
            code:
                "missing_gemini_api_key",

            message:
                "GEMINI_API_KEY is not configured in Netlify.",

            retryable: false
        };
    }

    const {
        contents,
        additionalSystemText
    } = buildGeminiContents(
        messages
    );

    await addAttachmentsToContents(
        contents,
        files
    );

    if (!contents.length) {
        throw {
            status: 400,
            code:
                "empty_gemini_contents",
            message:
                "No valid conversation content was provided."
        };
    }

    const baseSystemInstruction =
        createSystemInstruction(
            responseMode
        );

    if (additionalSystemText) {
        baseSystemInstruction.parts.push({
            text:
                additionalSystemText
        });
    }

    const endpoint =
        `${GEMINI_API_BASE}/${encodeURIComponent(
            DEFAULT_MODEL
        )}:generateContent`;

    const controller =
        new AbortController();

    const timeoutId =
        setTimeout(
            () => {
                controller.abort();
            },
            85000
        );

    let response;

    try {
        response = await fetch(
            endpoint,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "x-goog-api-key":
                        apiKey,

                    "X-Nexora-Request-ID":
                        requestId
                },

                body: JSON.stringify({
                    systemInstruction:
                        baseSystemInstruction,

                    contents,

                    generationConfig:
                        getGenerationConfig(
                            responseMode
                        )
                }),

                signal:
                    controller.signal
            }
        );
    } catch (error) {
        if (
            error?.name ===
            "AbortError"
        ) {
            throw {
                status: 504,
                code:
                    "gemini_timeout",
                message:
                    "Gemini took too long to respond.",
                retryable: true
            };
        }

        throw {
            status: 502,
            code:
                "gemini_network_error",
            message:
                "Nexora could not connect to Gemini.",
            retryable: true
        };
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw await parseGeminiError(
            response
        );
    }

    const data =
        await response.json();

    const content =
        extractGeminiText(data);

    if (!content) {
        const blockReason =
            data?.promptFeedback
                ?.blockReason;

        throw {
            status: 502,

            code:
                blockReason
                    ? "gemini_content_blocked"
                    : "empty_gemini_response",

            message:
                blockReason
                    ? "Gemini could not answer this request."
                    : "Gemini returned an empty response.",

            retryable:
                !blockReason
        };
    }

    return {
        content,

        model:
            DEFAULT_MODEL,

        finishReason:
            getGeminiFinishReason(
                data
            ),

        usage:
            data.usageMetadata ||
            null
    };
}


/* =========================================================
   NETLIFY HANDLER
========================================================= */

export default async (
    request,
    context
) => {
    if (
        request.method === "OPTIONS"
    ) {
        return new Response(null, {
            status: 204,

            headers: {
                "Allow":
                    "POST, OPTIONS",

                "Access-Control-Allow-Methods":
                    "POST, OPTIONS",

                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization, X-Nexora-Request-ID"
            }
        });
    }

    if (request.method !== "POST") {
        return errorResponse(
            "Only POST requests are allowed.",
            {
                status: 405,
                code:
                    "method_not_allowed"
            }
        );
    }

    const requestId =
        request.headers.get(
            "X-Nexora-Request-ID"
        ) ||
        createRequestId();

    try {
        const {
            payload,
            files
        } = await parseRequestBody(
            request
        );

        const validated =
            validatePayload(
                payload,
                files
            );

        const result =
            await callGemini({
                messages:
                    validated.messages,

                files:
                    validated.files,

                responseMode:
                    validated.responseMode,

                requestId
            });

        return jsonResponse({
            content:
                result.content,

            conversationId:
                validated
                    .conversationId,

            messageId:
                validated.messageId,

            model:
                result.model,

            usage:
                result.usage,

            metadata: {
                requestId,

                responseMode:
                    validated
                        .responseMode,

                finishReason:
                    result.finishReason,

                provider:
                    "google-gemini"
            }
        });
    } catch (error) {
        console.error(
            "Nexora Gemini function error:",
            {
                requestId,
                code:
                    error?.code,
                message:
                    error?.message
            }
        );

        return errorResponse(
            error?.message ||
                "Nexora could not generate a response.",
            {
                status:
                    Number(
                        error?.status
                    ) || 500,

                code:
                    error?.code ||
                    "chat_function_error",

                retryable:
                    Boolean(
                        error?.retryable
                    ),

                details: {
                    requestId
                }
            }
        );
    }
};