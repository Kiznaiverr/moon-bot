const config = require("./config");
const systemInstruction = require("./prompt");

const callOpenAI = async (formattedPrompt, history = []) => {
  if (!config.apiKey) {
    return {
      status: false,
      code: "NO_API_KEY",
      msg: "API Key is not configured (set CHATBOT_API_KEY / OPENAI_API_KEY / GROQ_API_KEY in .env)",
    };
  }

  const url = `${config.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const messages = [
    { role: "system", content: systemInstruction },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: formattedPrompt },
  ];

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      }),
    });
  } catch (err) {
    return { status: false, code: err.code || "FETCH_ERROR", msg: err.message };
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
    };

  if (rawText.includes("◡cmd_")) {
    const [msgPart, cmdPart] = rawText.split("◡cmd_");
    const trimmedCmd = (cmdPart || "").trim();
    const firstSpace = trimmedCmd.indexOf(" ");

    let command = "";
    let argument = "";

    if (firstSpace === -1) {
      command = trimmedCmd;
      argument = "";
    } else {
      command = trimmedCmd.substring(0, firstSpace).trim();
      argument = trimmedCmd.substring(firstSpace + 1).trim();
    }

    return {
      cleanMessage: (msgPart || "").trim(),
      hasCommand: Boolean(command),
      command: command ? command.toLowerCase() : null,
      argument: argument,
    };
  }

  return {
    cleanMessage: rawText.trim(),
    hasCommand: false,
    command: null,
    argument: null,
  };
};

module.exports = {
  callOpenAI,
  parseResponse,
};
