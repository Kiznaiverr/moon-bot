const fs = require("fs");
const path = require("path");
const config = require("./config");

const CACHE_DIR = path.join(process.cwd(), ".cache", "chatbot");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const cleanExpired = () => {
  const now = Date.now();
  const TTL = 24 * 60 * 60 * 1000;
  try {
    for (const file of fs.readdirSync(CACHE_DIR)) {
      if (!file.endsWith(".json")) continue;
      const stat = fs.statSync(path.join(CACHE_DIR, file));
      if (now - stat.mtimeMs > TTL) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
  } catch {}
};
cleanExpired();
setInterval(cleanExpired, 60 * 60 * 1000);

const getFilePath = (id) => {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safeId}.json`);
};

const loadHistory = (id) => {
  const file = getFilePath(id);
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  return [];
};

const saveHistory = (id, history) => {
  const file = getFilePath(id);
  try {
    const limited = history.slice(-config.historyLimit);
    fs.writeFileSync(file, JSON.stringify(limited, null, 2));
  } catch (e) {
    console.error(`[Chatbot] Save history failed for ${id}:`, e.message);
  }
};

const extractQuotedText = (quoted) => {
  if (!quoted) return "";
  return (
    quoted.text ||
    quoted.body ||
    quoted.message?.conversation ||
    quoted.message?.extendedTextMessage?.text ||
    quoted.message?.imageMessage?.caption ||
    quoted.message?.videoMessage?.caption ||
    ""
  ).trim();
};

const formatUserPrompt = (m, body) => {
  const cleanBody = (body || "").replace(/@\d+/g, "").trim();
  const quotedText = extractQuotedText(m?.quoted);

  const promptParts = [];

  if (m?.quoted) {
    const qMtype =
      m.quoted.mtype ||
      (m.quoted.message ? Object.keys(m.quoted.message)[0] : "");
    if (/image/.test(qMtype))
      promptParts.push("[Quoted Message Attachment: Image/Photo]");
    else if (/video/.test(qMtype))
      promptParts.push("[Quoted Message Attachment: Video]");
    else if (/sticker/.test(qMtype))
      promptParts.push("[Quoted Message Attachment: Sticker]");
    else if (/audio/.test(qMtype))
      promptParts.push("[Quoted Message Attachment: Audio]");
  }

  if (quotedText) {
    promptParts.push(`[Quoted Message Text]: "${quotedText}"`);
  }

  if (m?.mtype) {
    if (/image/.test(m.mtype))
      promptParts.push("[Current Message Attachment: Image/Photo]");
    else if (/video/.test(m.mtype))
      promptParts.push("[Current Message Attachment: Video]");
    else if (/sticker/.test(m.mtype))
      promptParts.push("[Current Message Attachment: Sticker]");
    else if (/audio/.test(m.mtype))
      promptParts.push("[Current Message Attachment: Audio]");
  }

  promptParts.push(`[User Message]: "${cleanBody}"`);
  return promptParts.join("\n");
};

module.exports = {
  loadHistory,
  saveHistory,
  formatUserPrompt,
  extractQuotedText,
};
