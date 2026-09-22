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
  maxTokens: 1024,
  temperature: 0.7,
  historyLimit: 10,
};
