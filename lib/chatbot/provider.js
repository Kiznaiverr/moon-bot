const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
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
      hasTts: false,
      ttsLang: "id",
      ttsText: null,
      isSilent: true,
    };

  let cleanMessage = rawText;
  let hasCommand = false;
  let command = null;
  let argument = null;
  let hasSticker = false;
  let stickerCategory = null;
  let hasTts = false;
  let ttsLang = "id";
  let ttsText = null;

  // Handle silent decision token
  if (cleanMessage.includes("◡silent") || cleanMessage.trim() === "NO_REPLY") {
    return {
      cleanMessage: "",
      hasCommand: false,
      command: null,
      argument: null,
      hasSticker: false,
      stickerCategory: null,
      hasTts: false,
      ttsLang: "id",
      ttsText: null,
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

  if (cleanMessage.includes("◡tts_")) {
    const [msgPart, ttsPart] = cleanMessage.split("◡tts_");
    cleanMessage = msgPart || "";
    const rawTts = (ttsPart || "").trim();
    const sepIdx = rawTts.indexOf("|");
    if (sepIdx !== -1) {
      const langCandidate = rawTts.slice(0, sepIdx).trim().toLowerCase();
      if (/^[a-z]{2}$/.test(langCandidate)) ttsLang = langCandidate;
      ttsText = rawTts.slice(sepIdx + 1).trim();
    } else {
      ttsText = rawTts;
    }
    if (ttsText) {
      ttsText = ttsText.slice(0, config.ttsMaxLength || 4500).trim();
      hasTts = Boolean(ttsText);
    }
  }

  return {
    cleanMessage: cleanMessage.trim(),
    hasCommand,
    command,
    argument,
    hasSticker,
    stickerCategory,
    hasTts,
    ttsLang,
    ttsText,
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

const EDGE_VOICE_MAP = {
  id: "id-ID-GadisNeural",
  jv: "jv-ID-SitiNeural",
  ms: "ms-MY-YasminNeural",
  ja: "ja-JP-NanamiNeural",
  en: "en-US-AvaNeural",
  ko: "ko-KR-SunHiNeural",
  zh: "zh-CN-XiaoyiNeural",
  ar: "ar-SA-ZariyahNeural",
  th: "th-TH-PremwadeeNeural",
  vi: "vi-VN-HoaiMyNeural",
  fr: "fr-FR-DeniseNeural",
  es: "es-ES-ElviraNeural",
  de: "de-DE-KatjaNeural",
  ru: "ru-RU-SvetlanaNeural",
};

const synthesizeWithEdge = async (text, lang = "id") => {
  const voice = EDGE_VOICE_MAP[lang] || EDGE_VOICE_MAP.id;
  const tts = new MsEdgeTTS();
  const timeoutMs = config.ttsTimeoutMs || 25_000;
  let timer;

  try {
    const run = (async () => {
      await tts.setMetadata(
        voice,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );
      const { audioStream } = tts.toStream(text);
      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    })();

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Edge TTS timed out")), timeoutMs);
    });

    const audio = await Promise.race([run, timeout]);
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      return { status: false, msg: "Edge TTS returned empty audio" };
    }
    return { status: true, audio, provider: "edge-tts" };
  } catch (err) {
    return { status: false, msg: err.message };
  } finally {
    if (timer) clearTimeout(timer);
    try {
      tts.close();
    } catch {}
  }
};

const synthesizeWithEndpoint = async (text) => {
  if (!config.ttsModel || !config.ttsBaseURL || !config.ttsApiKey) {
    return { status: false, msg: "TTS fallback endpoint not configured" };
  }
  const url = `${config.ttsBaseURL.replace(/\/+$/, "")}/audio/speech`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ttsApiKey}`,
      },
      body: JSON.stringify({
        model: config.ttsModel,
        input: text,
      }),
      signal: AbortSignal.timeout(config.ttsTimeoutMs || 25_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { status: false, msg: `TTS API ${res.status}: ${errText}` };
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await res.json().catch(() => ({}));
      if (typeof json.audio === "string" && json.audio) {
        return {
          status: true,
          audio: Buffer.from(json.audio, "base64"),
          provider: "openai-tts",
        };
      }
      return { status: false, msg: "TTS JSON missing audio field" };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) return { status: false, msg: "Empty TTS audio" };
    return { status: true, audio, provider: "openai-tts" };
  } catch (err) {
    return { status: false, msg: err.message };
  }
};

const synthesizeSpeech = async (text, lang = "id") => {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    return { status: false, code: "EMPTY_TEXT", msg: "Empty TTS text" };
  }

  const edgeRes = await synthesizeWithEdge(cleanText, lang);
  if (edgeRes.status) {
    if (edgeRes.audio.length > (config.ttsMaxBytes || 2 * 1024 * 1024)) {
      return { status: false, code: "TTS_TOO_LONG", msg: "TTS audio exceeds 5 minutes limit" };
    }
    return edgeRes;
  }

  const endpointRes = await synthesizeWithEndpoint(cleanText);
  if (endpointRes.status) {
    if (endpointRes.audio.length > (config.ttsMaxBytes || 2 * 1024 * 1024)) {
      return { status: false, code: "TTS_TOO_LONG", msg: "TTS audio exceeds 5 minutes limit" };
    }
    return endpointRes;
  }

  if (global.Api && typeof global.Api.get === "function") {
    try {
      const json = await global.Api.get("/tools/tts", {
        text: cleanText,
        iso: lang || "id",
      });
      if (json?.status && json?.data?.url) {
        const audioRes = await fetch(json.data.url, {
          signal: AbortSignal.timeout(config.ttsTimeoutMs || 25_000),
        });
        if (audioRes.ok) {
          const audio = Buffer.from(await audioRes.arrayBuffer());
          if (audio.length > 0) {
            return { status: true, audio, provider: "alyachan-tts" };
          }
        }
      }
    } catch {}
  }

  return {
    status: false,
    code: "TTS_FAILED",
    msg: edgeRes.msg || endpointRes.msg || "All TTS providers failed",
  };
};

module.exports = {
  callOpenAI,
  parseResponse,
  transcribeAudio,
  synthesizeSpeech,
};
