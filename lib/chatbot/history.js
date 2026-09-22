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

const formatUserPrompt = (body, quoted) => {
  const cleanBody = (body || "").replace(/@\d+/g, "").trim();
  const quotedText = extractQuotedText(quoted);

  if (quotedText) {
    return `[Pesan yang di-reply]: "${quotedText}"\n[Pesan user]: "${cleanBody}"`;
  }
  return cleanBody;
};

module.exports = {
  loadHistory,
  saveHistory,
  formatUserPrompt,
  extractQuotedText,
};
