const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function fail(message, status = 500, code = "server_error", retryable = false) {
  return json({ error: { message, status, code, retryable } }, status);
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw Object.assign(new Error("At least one message is required."), { status: 400, code: "empty_conversation" });
  }
  return messages.slice(-30).map((message, index) => {
    const role = String(message?.role || "").toLowerCase();
    const content = String(message?.content || "").trim();
    if (!["user", "assistant", "system"].includes(role) || !content) {
      throw Object.assign(new Error(`Message ${index + 1} is invalid.`), { status: 400, code: "invalid_message" });
    }
    if (content.length > 12000) {
      throw Object.assign(new Error(`Message ${index + 1} is too long.`), { status: 413, code: "message_too_long" });
    }
    return { role, content };
  });
}

function toGemini(messages) {
  const system = [];
  const contents = [];
  for (const message of messages) {
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }
    const role = message.role === "assistant" ? "model" : "user";
    const previous = contents.at(-1);
    if (previous?.role === role) {
      previous.parts[0].text += `\n\n${message.content}`;
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }
  return { system, contents };
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim();
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "allow": "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return fail("Only POST requests are allowed.", 405, "method_not_allowed");
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fail("GEMINI_API_KEY is not configured in Netlify.", 500, "missing_gemini_api_key");
  }

  try {
    const payload = await request.json();
    const messages = cleanMessages(payload.messages);
    const mode = ["fast", "balanced", "deep"].includes(payload.responseMode) ? payload.responseMode : "balanced";
    const { system, contents } = toGemini(messages);
    const modeText = mode === "fast"
      ? "Be concise and direct."
      : mode === "deep"
        ? "Give a thorough, carefully structured answer without unnecessary repetition."
        : "Give a clear, useful, well-structured answer.";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 85000);
    let response;
    try {
      response = await fetch(`${API_BASE}/${encodeURIComponent(MODEL)}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                "You are Nexxorra AI, a helpful assistant.",
                "Answer accurately and clearly.",
                "Use Markdown where useful and fenced code blocks for code.",
                modeText,
                ...system
              ].join("\n")
            }]
          },
          contents,
          generationConfig: {
            temperature: mode === "fast" ? 0.45 : 0.7,
            topP: 0.9,
            maxOutputTokens: mode === "deep" ? 4096 : mode === "fast" ? 1200 : 2400
          }
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const raw = data?.error?.message || `Gemini request failed (${response.status}).`;
      if (response.status === 400 && /api key not valid/i.test(raw)) {
        return fail("The Gemini API key is invalid. Create a new key in Google AI Studio and update GEMINI_API_KEY in Netlify.", 401, "invalid_gemini_key");
      }
      if (response.status === 404) {
        return fail(`Gemini model '${MODEL}' is unavailable. Set GEMINI_MODEL to a supported model.`, 502, "invalid_gemini_model");
      }
      if (response.status === 429) {
        return fail("The Gemini free quota has been reached. Try again later.", 429, "gemini_rate_limit", true);
      }
      return fail(raw, response.status, "gemini_api_error", response.status >= 500);
    }

    const content = extractText(data);
    if (!content) {
      return fail("Gemini returned an empty response.", 502, "empty_gemini_response", true);
    }

    return json({
      content,
      model: MODEL,
      conversationId: payload.conversationId || null,
      messageId: payload.messageId || null,
      usage: data.usageMetadata || null,
      metadata: { provider: "google-gemini", responseMode: mode }
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return fail("Gemini took too long to respond.", 504, "gemini_timeout", true);
    }
    return fail(error?.message || "Nexxorra could not generate a response.", error?.status || 500, error?.code || "chat_function_error");
  }
}
