module.exports = {
  baseURL:
    process.env.CHATBOT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.groq.com/openai/v1",
  apiKey:
    process.env.CHATBOT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    "",
  model:
    process.env.CHATBOT_MODEL || process.env.OPENAI_MODEL || "gemma2-9b-it",
  sttBaseURL:
    process.env.CHATBOT_STT_BASE_URL ||
    process.env.CHATBOT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.groq.com/openai/v1",
  sttApiKey:
    process.env.CHATBOT_STT_API_KEY ||
    process.env.CHATBOT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    "",
  sttModel:
    process.env.CHATBOT_STT_MODEL || "groq/whisper-large-v3-turbo",
  maxTokens: 1024,
  temperature: 0.7,
  historyLimit: 10,
  groupHistoryLimit: 16,
  chatTimeoutMs: 30_000,
  sttTimeoutMs: 45_000,
};
