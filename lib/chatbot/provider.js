const config = require("./config");
const systemInstruction = require("./prompt");

const callOpenAI = async (formattedPrompt, history = [], options = {}) => {
  if (!config.apiKey) {
    return {
      status: false,
      code: "NO_API_KEY",
      msg: "API Key is not configured (set CHATBOT_API_KEY / OPENAI_API_KEY / GROQ_API_KEY in .env)",
    };
  }

  const url = `${config.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const systemPrompt =
    typeof systemInstruction === "function"
      ? systemInstruction()
      : systemInstruction;

  const userContent = options.imageUrl
    ? [
        { type: "text", text: formattedPrompt },
        { type: "image_url", image_url: { url: options.imageUrl } },
      ]
    : formattedPrompt;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userContent },
  ];

  const sendRequest = async (msgs) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: msgs,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(config.chatTimeoutMs || 30_000),
    });
    return res;
  };

  let res;
  try {
    res = await sendRequest(messages);
    // Fallback to text-only if the configured model/endpoint rejects image_url
    if (!res.ok && options.imageUrl && res.status >= 400 && res.status < 500) {
      const textOnlyMessages = [
        ...messages.slice(0, -1),
        { role: "user", content: formattedPrompt },
      ];
      res = await sendRequest(textOnlyMessages);
    } else if (!res.ok && res.status >= 500 && res.status < 600) {
      await new Promise((r) => setTimeout(r, 500));
      res = await sendRequest(messages);
    }
  } catch (err) {
    const isTimeout =
      err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      status: false,
      code: isTimeout ? "TIMEOUT" : err.code || "FETCH_ERROR",
      msg: err.message,
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      status: false,
      code: res.status,
      msg: `Chatbot API ${res.status}: ${errText}`,
    };
  }

  const json = await res.json().catch(() => ({}));
  const rawResponse = json.choices?.[0]?.message?.content;
  if (!rawResponse) {
    return {
      status: false,
      code: "EMPTY_RESPONSE",
      msg: "Empty response from Chatbot API",
    };
  }

  return { status: true, data: rawResponse };
};

const parseResponse = (rawText) => {
  if (!rawText)
    return {
      cleanMessage: "",
      hasCommand: false,
      command: null,
      argument: null,
      hasSticker: false,
      stickerCategory: null,
      isSilent: true,
    };

  let cleanMessage = rawText;
  let hasCommand = false;
  let command = null;
  let argument = null;
  let hasSticker = false;
  let stickerCategory = null;

  // Handle silent decision token
  if (cleanMessage.includes("◡silent") || cleanMessage.trim() === "NO_REPLY") {
    return {
      cleanMessage: "",
      hasCommand: false,
      command: null,
      argument: null,
      hasSticker: false,
      stickerCategory: null,
      isSilent: true,
    };
  }

  if (cleanMessage.includes("◡cmd_")) {
    const [msgPart, cmdPart] = cleanMessage.split("◡cmd_");
    cleanMessage = msgPart || "";
    const trimmedCmd = (cmdPart || "").trim();
    const firstSpace = trimmedCmd.indexOf(" ");

    if (firstSpace === -1) {
      command = trimmedCmd;
      argument = "";
    } else {
      command = trimmedCmd.substring(0, firstSpace).trim();
      argument = trimmedCmd.substring(firstSpace + 1).trim();
    }
    hasCommand = Boolean(command);
    if (command) command = command.toLowerCase();
  }

  if (cleanMessage.includes("◡stk_")) {
    const [msgPart, stkPart] = cleanMessage.split("◡stk_");
    cleanMessage = msgPart || "";
    const cat = (stkPart || "").trim().split(/\s+/)[0];
    if (cat) {
      hasSticker = true;
      stickerCategory = cat.toLowerCase();
    }
  }

  return {
    cleanMessage: cleanMessage.trim(),
    hasCommand,
    command,
    argument,
    hasSticker,
    stickerCategory,
    isSilent: false,
  };
};

const MIME_EXT_MAP = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

const transcribeAudio = async (audioBuffer, options = {}) => {
  if (!config.sttApiKey) {
    return {
      status: false,
      code: "NO_API_KEY",
      msg: "STT API Key is not configured",
    };
  }
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return {
      status: false,
      code: "INVALID_AUDIO",
      msg: "Empty or invalid audio buffer",
    };
  }

  const rawMime = String(options.mimetype || "audio/ogg")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const ext = MIME_EXT_MAP[rawMime] || "ogg";
  const url = `${config.sttBaseURL.replace(/\/+$/, "")}/audio/transcriptions`;

  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBuffer], { type: rawMime || "audio/ogg" }),
    `voice.${ext}`,
  );
  form.append("model", options.model || config.sttModel);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sttApiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(config.sttTimeoutMs || 45_000),
    });
  } catch (err) {
    const isTimeout =
      err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      status: false,
      code: isTimeout ? "TIMEOUT" : err.code || "FETCH_ERROR",
      msg: err.message,
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      status: false,
      code: res.status,
      msg: `STT API ${res.status}: ${errText}`,
    };
  }

  const json = await res.json().catch(() => ({}));
  const text = typeof json.text === "string" ? json.text.trim() : "";
  return { status: true, text };
};

module.exports = {
  callOpenAI,
  parseResponse,
  transcribeAudio,
};
