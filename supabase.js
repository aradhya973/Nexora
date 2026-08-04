/* =========================================================
   NEXORA AI — SUPABASE DATABASE CLIENT
   File: supabase.js
========================================================= */

import {
    createClient
} from "https://esm.sh/@supabase/supabase-js@2";

import {
    SUPABASE_CONFIG,
    DATABASE_TABLES,
    DEFAULT_USER_SETTINGS,
    isSupabaseConfigured,
    validateSupabaseConfig
} from "./config.js";


/* =========================================================
   1. CLIENT STATE
========================================================= */

let supabaseClient = null;

let cachedSession = null;
let cachedUser = null;

let authListenerSubscription = null;


/* =========================================================
   2. CUSTOM ERROR
========================================================= */

export class NexoraDatabaseError extends Error {
    constructor(
        message,
        {
            code = "database_error",
            status = 0,
            details = null,
            cause = null
        } = {}
    ) {
        super(message);

        this.name = "NexoraDatabaseError";
        this.code = code;
        this.status = status;
        this.details = details;

        if (cause) {
            this.cause = cause;
        }
    }
}


/* =========================================================
   3. GENERAL HELPERS
========================================================= */

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function normalizeText(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function currentTimestamp() {
    return new Date().toISOString();
}

function isUUID(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "")
    );
}

function safeArray(value) {
    return Array.isArray(value)
        ? value
        : [];
}

function safeObject(value) {
    return isPlainObject(value)
        ? value
        : {};
}

function normalizeResponseMode(mode) {
    return ["balanced", "fast", "deep"].includes(mode)
        ? mode
        : "balanced";
}

function createDatabaseError(
    error,
    fallbackMessage = "A database request failed."
) {
    if (error instanceof NexoraDatabaseError) {
        return error;
    }

    return new NexoraDatabaseError(
        error?.message || fallbackMessage,
        {
            code:
                error?.code ||
                "supabase_error",

            status:
                Number(error?.status) || 0,

            details:
                error?.details ||
                error?.hint ||
                null,

            cause: error
        }
    );
}

function throwIfError(
    error,
    fallbackMessage
) {
    if (!error) return;

    throw createDatabaseError(
        error,
        fallbackMessage
    );
}


/* =========================================================
   4. CLIENT INITIALIZATION
========================================================= */

export function initializeSupabase() {
    if (supabaseClient) {
        return supabaseClient;
    }

    const validation =
        validateSupabaseConfig();

    if (
        !isSupabaseConfigured() ||
        !validation.valid
    ) {
        throw new NexoraDatabaseError(
            validation.errors.join(" ") ||
                "Supabase is not configured.",
            {
                code:
                    "supabase_not_configured"
            }
        );
    }

    supabaseClient = createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
            auth: {
                persistSession:
                    SUPABASE_CONFIG.auth
                        .persistSession,

                autoRefreshToken:
                    SUPABASE_CONFIG.auth
                        .autoRefreshToken,

                detectSessionInUrl:
                    SUPABASE_CONFIG.auth
                        .detectSessionInUrl,

                flowType:
                    SUPABASE_CONFIG.auth
                        .flowType,

                storageKey:
                    SUPABASE_CONFIG.auth
                        .storageKey
            },

            global: {
                headers: {
                    "X-Client-Info":
                        "nexora-web"
                }
            }
        }
    );

    return supabaseClient;
}

export function getSupabaseClient() {
    return (
        supabaseClient ||
        initializeSupabase()
    );
}


/* =========================================================
   5. SESSION
========================================================= */

export async function getCurrentSession() {
    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client.auth.getSession();

    throwIfError(
        error,
        "The current session could not be loaded."
    );

    cachedSession =
        data?.session || null;

    cachedUser =
        cachedSession?.user || null;

    return {
        session: cachedSession,
        user: cachedUser
    };
}

export async function getCurrentUser() {
    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client.auth.getUser();

    throwIfError(
        error,
        "The signed-in user could not be loaded."
    );

    cachedUser =
        data?.user || null;

    return cachedUser;
}

export async function getAccessToken() {
    const {
        session
    } = await getCurrentSession();

    return (
        session?.access_token ||
        null
    );
}

export async function requireAuthenticatedUser() {
    const {
        session,
        user
    } = await getCurrentSession();

    if (!session || !user) {
        throw new NexoraDatabaseError(
            "You must be logged in.",
            {
                code:
                    "authentication_required",
                status: 401
            }
        );
    }

    return {
        session,
        user
    };
}


/* =========================================================
   6. AUTH STATE LISTENER
========================================================= */

export function listenToAuthChanges() {
    if (authListenerSubscription) {
        return authListenerSubscription;
    }

    const client =
        getSupabaseClient();

    const {
        data
    } = client.auth.onAuthStateChange(
        (
            event,
            session
        ) => {
            cachedSession =
                session || null;

            cachedUser =
                session?.user || null;

            document.dispatchEvent(
                new CustomEvent(
                    "nexora:auth-session",
                    {
                        detail: {
                            event,
                            session:
                                cachedSession,
                            user:
                                cachedUser
                        }
                    }
                )
            );

            if (event === "SIGNED_OUT") {
                document.dispatchEvent(
                    new CustomEvent(
                        "nexora:logout"
                    )
                );
            }
        }
    );

    authListenerSubscription =
        data.subscription;

    return authListenerSubscription;
}

export function stopAuthListener() {
    authListenerSubscription
        ?.unsubscribe();

    authListenerSubscription = null;
}


/* =========================================================
   7. PROFILE
========================================================= */

export async function getProfile() {
    const {
        user
    } = await requireAuthenticatedUser();

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.profiles
        )
        .select(
            [
                "user_id",
                "full_name",
                "username",
                "avatar_url",
                "bio",
                "created_at",
                "updated_at"
            ].join(",")
        )
        .eq(
            "user_id",
            user.id
        )
        .maybeSingle();

    throwIfError(
        error,
        "Your profile could not be loaded."
    );

    return data || null;
}

export async function ensureProfile() {
    const {
        user
    } = await requireAuthenticatedUser();

    const existingProfile =
        await getProfile();

    if (existingProfile) {
        return existingProfile;
    }

    const metadata =
        safeObject(
            user.user_metadata
        );

    const fullName =
        metadata.full_name ||
        metadata.name ||
        user.email?.split("@")[0] ||
        null;

    const avatarURL =
        metadata.avatar_url ||
        metadata.picture ||
        null;

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.profiles
        )
        .upsert(
            {
                user_id: user.id,
                full_name:
                    fullName,
                avatar_url:
                    avatarURL
            },
            {
                onConflict:
                    "user_id"
            }
        )
        .select()
        .single();

    throwIfError(
        error,
        "Your profile could not be created."
    );

    return data;
}

export async function updateProfile(
    updates = {}
) {
    const {
        user
    } = await requireAuthenticatedUser();

    const allowedUpdates = {};

    if ("full_name" in updates) {
        allowedUpdates.full_name =
            normalizeText(
                updates.full_name
            ) || null;
    }

    if ("username" in updates) {
        allowedUpdates.username =
            normalizeText(
                updates.username
            ).toLowerCase() || null;
    }

    if ("avatar_url" in updates) {
        allowedUpdates.avatar_url =
            normalizeText(
                updates.avatar_url
            ) || null;
    }

    if ("bio" in updates) {
        allowedUpdates.bio =
            String(
                updates.bio || ""
            ).trim() || null;
    }

    if (
        Object.keys(
            allowedUpdates
        ).length === 0
    ) {
        return await getProfile();
    }

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.profiles
        )
        .update(
            allowedUpdates
        )
        .eq(
            "user_id",
            user.id
        )
        .select()
        .single();

    throwIfError(
        error,
        "Your profile could not be updated."
    );

    return data;
}


/* =========================================================
   8. USER SETTINGS
========================================================= */

function normalizeSettingsRow(
    settings
) {
    return {
        theme:
            ["system", "dark", "light"]
                .includes(settings?.theme)
                ? settings.theme
                : DEFAULT_USER_SETTINGS.theme,

        preferred_model:
            normalizeText(
                settings?.preferred_model
            ) ||
            DEFAULT_USER_SETTINGS
                .preferredModel,

        response_style:
            normalizeResponseMode(
                settings?.response_style
            ),

        language:
            normalizeText(
                settings?.language
            ) ||
            DEFAULT_USER_SETTINGS
                .language,

        save_history:
            settings?.save_history !== false,

        enter_to_send:
            settings?.enter_to_send !== false,

        voice_language:
            normalizeText(
                settings?.voice_language
            ) ||
            DEFAULT_USER_SETTINGS
                .voiceLanguage
    };
}

export async function getUserSettings() {
    const {
        user
    } = await requireAuthenticatedUser();

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.userSettings
        )
        .select("*")
        .eq(
            "user_id",
            user.id
        )
        .maybeSingle();

    throwIfError(
        error,
        "Your settings could not be loaded."
    );

    if (data) {
        return data;
    }

    return await ensureUserSettings();
}

export async function ensureUserSettings() {
    const {
        user
    } = await requireAuthenticatedUser();

    const client =
        getSupabaseClient();

    const defaultRow =
        normalizeSettingsRow({
            theme:
                DEFAULT_USER_SETTINGS.theme,

            preferred_model:
                DEFAULT_USER_SETTINGS
                    .preferredModel,

            response_style:
                DEFAULT_USER_SETTINGS
                    .responseStyle,

            language:
                DEFAULT_USER_SETTINGS
                    .language,

            save_history:
                DEFAULT_USER_SETTINGS
                    .saveHistory,

            enter_to_send:
                DEFAULT_USER_SETTINGS
                    .enterToSend,

            voice_language:
                DEFAULT_USER_SETTINGS
                    .voiceLanguage
        });

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.userSettings
        )
        .upsert(
            {
                user_id: user.id,
                ...defaultRow
            },
            {
                onConflict:
                    "user_id",
                ignoreDuplicates: true
            }
        )
        .select()
        .maybeSingle();

    throwIfError(
        error,
        "Default settings could not be created."
    );

    if (data) {
        return data;
    }

    const {
        data: existingData,
        error: existingError
    } = await client
        .from(
            DATABASE_TABLES.userSettings
        )
        .select("*")
        .eq(
            "user_id",
            user.id
        )
        .single();

    throwIfError(
        existingError,
        "Your settings could not be loaded."
    );

    return existingData;
}

export async function updateUserSettings(
    updates = {}
) {
    const {
        user
    } = await requireAuthenticatedUser();

    const currentSettings =
        await getUserSettings();

    const normalized =
        normalizeSettingsRow({
            ...currentSettings,
            ...updates
        });

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.userSettings
        )
        .upsert(
            {
                user_id: user.id,
                ...normalized
            },
            {
                onConflict:
                    "user_id"
            }
        )
        .select()
        .single();

    throwIfError(
        error,
        "Your settings could not be updated."
    );

    return data;
}


/* =========================================================
   9. DATABASE CONVERSATION NORMALIZATION
========================================================= */

function normalizeDatabaseMessage(
    row
) {
    const metadata =
        safeObject(row.metadata);

    return {
        id:
            metadata.client_message_id ||
            row.id,

        databaseId:
            row.id,

        conversationId:
            row.conversation_id,

        role:
            row.role,

        content:
            row.content || "",

        status:
            row.status ||
            "completed",

        attachments:
            safeArray(
                row.attachments
            ),

        metadata,

        createdAt:
            row.created_at
    };
}

function normalizeDatabaseConversation(
    row
) {
    return {
        id: row.id,

        userId:
            row.user_id,

        title:
            row.title ||
            "Untitled conversation",

        model:
            row.model ||
            "gemini",

        responseMode:
            normalizeResponseMode(
                row.response_mode
            ),

        isPinned:
            Boolean(row.is_pinned),

        isArchived:
            Boolean(row.is_archived),

        createdAt:
            row.created_at,

        updatedAt:
            row.updated_at,

        source:
            "supabase",

        messages:
            safeArray(row.messages)
                .map(
                    normalizeDatabaseMessage
                )
                .sort(
                    (
                        first,
                        second
                    ) => {
                        return (
                            new Date(
                                first.createdAt
                            ).getTime() -
                            new Date(
                                second.createdAt
                            ).getTime()
                        );
                    }
                )
    };
}


/* =========================================================
   10. GET CONVERSATIONS
========================================================= */

export async function getConversations({
    limit = 100,
    includeArchived = false
} = {}) {
    await requireAuthenticatedUser();

    const client =
        getSupabaseClient();

    let query = client
        .from(
            DATABASE_TABLES.conversations
        )
        .select(
            `
                id,
                user_id,
                title,
                model,
                response_mode,
                is_pinned,
                is_archived,
                created_at,
                updated_at,
                messages (
                    id,
                    conversation_id,
                    user_id,
                    role,
                    content,
                    status,
                    attachments,
                    metadata,
                    created_at
                )
            `
        )
        .order(
            "is_pinned",
            {
                ascending: false
            }
        )
        .order(
            "updated_at",
            {
                ascending: false
            }
        )
        .limit(
            Math.min(
                Math.max(
                    Number(limit) || 100,
                    1
                ),
                500
            )
        );

    if (!includeArchived) {
        query = query.eq(
            "is_archived",
            false
        );
    }

    const {
        data,
        error
    } = await query;

    throwIfError(
        error,
        "Your conversations could not be loaded."
    );

    return safeArray(data).map(
        normalizeDatabaseConversation
    );
}

export const loadUserConversations =
    getConversations;


/* =========================================================
   11. GET ONE CONVERSATION
========================================================= */

export async function getConversation(
    conversationId
) {
    await requireAuthenticatedUser();

    if (!isUUID(conversationId)) {
        return null;
    }

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .select(
            `
                id,
                user_id,
                title,
                model,
                response_mode,
                is_pinned,
                is_archived,
                created_at,
                updated_at,
                messages (
                    id,
                    conversation_id,
                    user_id,
                    role,
                    content,
                    status,
                    attachments,
                    metadata,
                    created_at
                )
            `
        )
        .eq(
            "id",
            conversationId
        )
        .maybeSingle();

    throwIfError(
        error,
        "The conversation could not be loaded."
    );

    return data
        ? normalizeDatabaseConversation(
              data
          )
        : null;
}


/* =========================================================
   12. CONVERSATION ROW
========================================================= */

function createConversationRow(
    conversation,
    userId
) {
    return {
        user_id: userId,

        title:
            normalizeText(
                conversation?.title
            ) ||
            "Untitled conversation",

        model:
            normalizeText(
                conversation?.model
            ) ||
            "gemini",

        response_mode:
            normalizeResponseMode(
                conversation?.responseMode
            ),

        is_pinned:
            Boolean(
                conversation?.isPinned
            ),

        is_archived:
            Boolean(
                conversation?.isArchived
            )
    };
}


/* =========================================================
   13. SAVE CONVERSATION
========================================================= */

export async function saveConversation(
    conversation
) {
    const {
        user
    } = await requireAuthenticatedUser();

    if (!conversation) {
        throw new NexoraDatabaseError(
            "A conversation is required.",
            {
                code:
                    "invalid_conversation"
            }
        );
    }

    const client =
        getSupabaseClient();

    const conversationRow =
        createConversationRow(
            conversation,
            user.id
        );

    let savedConversation = null;

    if (isUUID(conversation.id)) {
        const {
            data,
            error
        } = await client
            .from(
                DATABASE_TABLES.conversations
            )
            .update(
                conversationRow
            )
            .eq(
                "id",
                conversation.id
            )
            .select()
            .maybeSingle();

        throwIfError(
            error,
            "The conversation could not be updated."
        );

        savedConversation = data;
    }

    if (!savedConversation) {
        const {
            data,
            error
        } = await client
            .from(
                DATABASE_TABLES.conversations
            )
            .insert(
                conversationRow
            )
            .select()
            .single();

        throwIfError(
            error,
            "The conversation could not be created."
        );

        savedConversation = data;
    }

    await replaceConversationMessages(
        savedConversation.id,
        safeArray(
            conversation.messages
        ),
        user.id
    );

    return await getConversation(
        savedConversation.id
    );
}

export const upsertConversation =
    saveConversation;


/* =========================================================
   14. REPLACE CONVERSATION MESSAGES
========================================================= */

async function replaceConversationMessages(
    conversationId,
    messages,
    userId
) {
    const client =
        getSupabaseClient();

    const {
        error: deleteError
    } = await client
        .from(
            DATABASE_TABLES.messages
        )
        .delete()
        .eq(
            "conversation_id",
            conversationId
        );

    throwIfError(
        deleteError,
        "Existing messages could not be synchronized."
    );

    if (!messages.length) {
        return [];
    }

    const rows = messages
        .filter(message => {
            return (
                message &&
                ["user", "assistant", "system"]
                    .includes(message.role)
            );
        })
        .map(message => {
            const metadata = {
                ...safeObject(
                    message.metadata
                )
            };

            if (message.id) {
                metadata.client_message_id =
                    message.id;
            }

            return {
                conversation_id:
                    conversationId,

                user_id:
                    userId,

                role:
                    message.role,

                content:
                    String(
                        message.content || ""
                    ),

                status:
                    [
                        "generating",
                        "completed",
                        "stopped",
                        "error"
                    ].includes(
                        message.status
                    )
                        ? message.status
                        : "completed",

                attachments:
                    safeArray(
                        message.attachments
                    ),

                metadata,

                created_at:
                    message.createdAt ||
                    currentTimestamp()
            };
        });

    if (!rows.length) {
        return [];
    }

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.messages
        )
        .insert(rows)
        .select();

    throwIfError(
        error,
        "Conversation messages could not be saved."
    );

    return data || [];
}


/* =========================================================
   15. RENAME CONVERSATION
========================================================= */

export async function renameConversation(
    conversationId,
    title
) {
    await requireAuthenticatedUser();

    if (!isUUID(conversationId)) {
        throw new NexoraDatabaseError(
            "The conversation has not been synchronized yet.",
            {
                code:
                    "conversation_not_synced"
            }
        );
    }

    const normalizedTitle =
        normalizeText(title);

    if (!normalizedTitle) {
        throw new NexoraDatabaseError(
            "A conversation name is required.",
            {
                code:
                    "conversation_title_required"
            }
        );
    }

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .update({
            title:
                normalizedTitle.slice(
                    0,
                    80
                )
        })
        .eq(
            "id",
            conversationId
        )
        .select()
        .single();

    throwIfError(
        error,
        "The conversation could not be renamed."
    );

    return data;
}


/* =========================================================
   16. DELETE CONVERSATION
========================================================= */

export async function deleteConversation(
    conversationId
) {
    await requireAuthenticatedUser();

    if (!isUUID(conversationId)) {
        return true;
    }

    const client =
        getSupabaseClient();

    const {
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .delete()
        .eq(
            "id",
            conversationId
        );

    throwIfError(
        error,
        "The conversation could not be deleted."
    );

    return true;
}


/* =========================================================
   17. ARCHIVE AND PIN
========================================================= */

export async function archiveConversation(
    conversationId,
    archived = true
) {
    await requireAuthenticatedUser();

    if (!isUUID(conversationId)) {
        return null;
    }

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .update({
            is_archived:
                Boolean(archived)
        })
        .eq(
            "id",
            conversationId
        )
        .select()
        .single();

    throwIfError(
        error,
        "The conversation archive status could not be updated."
    );

    return data;
}

export async function pinConversation(
    conversationId,
    pinned = true
) {
    await requireAuthenticatedUser();

    if (!isUUID(conversationId)) {
        return null;
    }

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .update({
            is_pinned:
                Boolean(pinned)
        })
        .eq(
            "id",
            conversationId
        )
        .select()
        .single();

    throwIfError(
        error,
        "The conversation pin status could not be updated."
    );

    return data;
}


/* =========================================================
   18. SEARCH CONVERSATIONS
========================================================= */

export async function searchConversations(
    searchText,
    {
        limit = 50
    } = {}
) {
    await requireAuthenticatedUser();

    const queryText =
        normalizeText(searchText);

    if (!queryText) {
        return await getConversations({
            limit
        });
    }

    const escapedQuery =
        queryText
            .replace(/[%_]/g, "");

    const client =
        getSupabaseClient();

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .select(
            `
                id,
                user_id,
                title,
                model,
                response_mode,
                is_pinned,
                is_archived,
                created_at,
                updated_at
            `
        )
        .ilike(
            "title",
            `%${escapedQuery}%`
        )
        .eq(
            "is_archived",
            false
        )
        .order(
            "updated_at",
            {
                ascending: false
            }
        )
        .limit(
            Math.min(
                Number(limit) || 50,
                100
            )
        );

    throwIfError(
        error,
        "Conversation search failed."
    );

    return safeArray(data).map(
        row => ({
            ...normalizeDatabaseConversation(
                {
                    ...row,
                    messages: []
                }
            )
        })
    );
}


/* =========================================================
   19. RESPONSE FEEDBACK
========================================================= */

export async function saveResponseFeedback({
    conversationId,
    messageId,
    feedback
}) {
    await requireAuthenticatedUser();

    if (
        !conversationId ||
        !messageId ||
        !["positive", "negative"]
            .includes(feedback)
    ) {
        return null;
    }

    const client =
        getSupabaseClient();

    let query = client
        .from(
            DATABASE_TABLES.messages
        )
        .select(
            "id, metadata"
        )
        .eq(
            "conversation_id",
            conversationId
        );

    if (isUUID(messageId)) {
        query = query.eq(
            "id",
            messageId
        );
    } else {
        query = query.contains(
            "metadata",
            {
                client_message_id:
                    messageId
            }
        );
    }

    const {
        data: messageRow,
        error: selectError
    } = await query.maybeSingle();

    throwIfError(
        selectError,
        "The response could not be found."
    );

    if (!messageRow) {
        return null;
    }

    const metadata = {
        ...safeObject(
            messageRow.metadata
        ),

        feedback,

        feedback_at:
            currentTimestamp()
    };

    const {
        data,
        error
    } = await client
        .from(
            DATABASE_TABLES.messages
        )
        .update({
            metadata
        })
        .eq(
            "id",
            messageRow.id
        )
        .select()
        .single();

    throwIfError(
        error,
        "Response feedback could not be saved."
    );

    return data;
}


/* =========================================================
   20. DELETE ALL USER CHAT DATA
========================================================= */

export async function deleteAllConversations() {
    const {
        user
    } = await requireAuthenticatedUser();

    const client =
        getSupabaseClient();

    const {
        error
    } = await client
        .from(
            DATABASE_TABLES.conversations
        )
        .delete()
        .eq(
            "user_id",
            user.id
        );

    throwIfError(
        error,
        "Your conversations could not be deleted."
    );

    return true;
}


/* =========================================================
   21. CONNECTION TEST
========================================================= */

export async function testSupabaseConnection() {
    try {
        const client =
            getSupabaseClient();

        const {
            error
        } = await client
            .from(
                DATABASE_TABLES.profiles
            )
            .select(
                "user_id",
                {
                    head: true,
                    count: "exact"
                }
            )
            .limit(1);

        if (
            error &&
            ![
                "PGRST301",
                "42501"
            ].includes(error.code)
        ) {
            throw error;
        }

        return {
            connected: true,
            configured: true
        };
    } catch (error) {
        return {
            connected: false,

            configured:
                isSupabaseConfigured(),

            error:
                createDatabaseError(
                    error
                )
        };
    }
}


/* =========================================================
   22. INITIAL STARTUP
========================================================= */

function initializeSupabaseLayer() {
    if (!isSupabaseConfigured()) {
        console.warn(
            "Nexora Supabase configuration is missing."
        );

        return;
    }

    try {
        initializeSupabase();
        listenToAuthChanges();

        getCurrentSession()
            .then(
                ({
                    session,
                    user
                }) => {
                    document.dispatchEvent(
                        new CustomEvent(
                            "nexora:auth-session",
                            {
                                detail: {
                                    event:
                                        "INITIAL_SESSION",

                                    session,
                                    user
                                }
                            }
                        )
                    );
                }
            )
            .catch(error => {
                console.warn(
                    "Initial Supabase session could not be restored:",
                    error
                );
            });

        document.documentElement
            .classList
            .add(
                "nexora-supabase-ready"
            );
    } catch (error) {
        console.error(
            "Supabase initialization failed:",
            error
        );
    }
}


/* =========================================================
   23. AUTOMATIC INITIALIZATION
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeSupabaseLayer,
        {
            once: true
        }
    );
} else {
    initializeSupabaseLayer();
}


/* =========================================================
   24. DEFAULT EXPORT
========================================================= */

const NexoraSupabase =
    Object.freeze({
        client:
            getSupabaseClient,

        session:
            getCurrentSession,

        user:
            getCurrentUser,

        accessToken:
            getAccessToken,

        profile: {
            get:
                getProfile,

            ensure:
                ensureProfile,

            update:
                updateProfile
        },

        settings: {
            get:
                getUserSettings,

            ensure:
                ensureUserSettings,

            update:
                updateUserSettings
        },

        conversations: {
            getAll:
                getConversations,

            getOne:
                getConversation,

            save:
                saveConversation,

            rename:
                renameConversation,

            delete:
                deleteConversation,

            deleteAll:
                deleteAllConversations,

            archive:
                archiveConversation,

            pin:
                pinConversation,

            search:
                searchConversations
        },

        feedback:
            saveResponseFeedback,

        test:
            testSupabaseConnection
    });

export default NexoraSupabase;