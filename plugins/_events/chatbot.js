const {
  loadHistory,
  saveHistory,
  formatUserPrompt,
} = require("../../lib/chatbot/history");
const { callOpenAI, parseResponse } = require("../../lib/chatbot/provider");
const { getStickerUrl } = require("../../lib/chatbot/stickers");

module.exports = {
  run: async (
    m,
    {
      ctx,
      conn,
      store,
      body,
      plugins,
      database,
      env,
      groupSet,
      chats,
      users,
      setting,
      isOwner,
      isPrem,
      groupMetadata,
      participants,
      isAdmin,
      isBotAdmin,
      Func,
      Scraper,
    },
  ) => {
    try {
      if (m.fromMe) return;
      if (/reaction/i.test(m.mtype)) return;
      if (
        !body ||
        (env.evaluate_chars &&
          env.evaluate_chars.some((v) => body.startsWith(v)))
      )
        return;
      if (ctx?.isCommand) return;

      // Ignore if user is currently in a menfess session or anonymous chat
      if (conn.menfess && Object.values(conn.menfess).some((s) => s.check(m.sender))) return;
      if (conn.anonymous && Object.values(conn.anonymous).some((r) => r.check(m.sender) && r.state === 'CHATTING')) return;

      const botJid = conn.decodeJid(conn.user.id);
      const isMentioned =
        (m.mentionedJid && m.mentionedJid.includes(botJid)) ||
        (m.quoted && m.quoted.sender === botJid);

      // Check for passive keyword trigger in groups
      const keywordRegex = /\b(bot|botnya|kirara|hoshikita|moon)\b/i;
      const hasKeyword = keywordRegex.test(body);
      const isPassiveGroup = Boolean(m.isGroup && !isMentioned && hasKeyword && setting.chatbot);

      // Group: direct mention/quoted OR passive keyword when setting.chatbot is active
      // Private: when setting.chatbot active or directly mentioned
      if (m.isGroup && !isMentioned && !isPassiveGroup) return;
      if (!m.isGroup && !setting.chatbot && !isMentioned) return;

      // Cooldown check for group passive triggers (15 seconds per group)
      if (isPassiveGroup) {
        const now = Date.now();
        const COOLDOWN_MS = 15000;
        conn.chatbotCooldowns = conn.chatbotCooldowns || new Map();
        const lastTrigger = conn.chatbotCooldowns.get(m.chat) || 0;
        if (now - lastTrigger < COOLDOWN_MS) return;
      }

      const formattedPrompt = formatUserPrompt(m, body, { isPassiveGroup });
      if (!formattedPrompt) return;

      const history = loadHistory(m.chat);
      const res = await callOpenAI(formattedPrompt, history);
      if (!res.status) {
        console.error(`[Chatbot Error ${res.code}]:`, res.msg);
        return conn.reply(
          m.chat,
          Func.texted("bold", `🚩 [Chatbot Error ${res.code}]: ${res.msg}`),
          m,
        );
      }

      const {
        cleanMessage,
        hasCommand,
        command,
        argument,
        hasSticker,
        stickerCategory,
        isSilent,
      } = parseResponse(res.data);

      // Ignore if AI decided to stay silent or empty response
      if (isSilent || !cleanMessage) return;

      // Update cooldown timestamp if passive trigger succeeded and replied
      if (isPassiveGroup) {
        conn.chatbotCooldowns = conn.chatbotCooldowns || new Map();
        conn.chatbotCooldowns.set(m.chat, Date.now());
      }

      saveHistory(m.chat, [
        ...history,
        { role: "user", content: formattedPrompt },
        { role: "assistant", content: res.data },
      ]);

      if (cleanMessage) {
        await conn.reply(m.chat, cleanMessage, m);
      }

      if (hasSticker && !hasCommand && stickerCategory) {
        const stickerUrl = getStickerUrl(stickerCategory);
        if (stickerUrl) {
          await conn.sendSticker(m.chat, stickerUrl, m, {
            packname: setting?.sk_pack || "Hoshikita Kirara",
            author: setting?.sk_author || "moon-bot",
          });
        }
      }

      if (hasCommand && command) {
        const plugin =
          (ctx?.loadCmd && ctx.loadCmd.get(command)) ||
          [...plugins.values()].find(
            (p) =>
              (p.help && p.help.includes(command)) ||
              (p.aliases && p.aliases.includes(command)),
          );

        if (plugin && typeof plugin.run === "function") {
          const args = argument ? argument.trim().split(/\s+/) : [];
          const text = argument ? argument.trim() : "";
          const usedPrefix = ctx?.prefix || setting?.onlyprefix || "#";

          let targetM = m;
          const isCurrentMedia = /image|video|sticker/.test(m.mtype || "");
          const quotedType =
            m.quoted?.mtype ||
            (m.quoted?.message ? Object.keys(m.quoted.message)[0] : "");
          const isQuotedMedia = /image|video|sticker/.test(quotedType);

          const mediaCmds = new Set([
            "s",
            "sticker",
            "stiker",
            "remini",
            "hdvideo",
            "removebg",
            "toimg",
            "tovideo",
            "ocr",
            "toanime",
            "take",
            "ghibli",
            "smeta",
            "snobg",
          ]);
          const urlCmds = new Set([
            "tiktok",
            "ytmp4",
            "ytmp3",
            "ig",
            "igstory",
            "fb",
            "x",
            "threads",
            "capcut",
            "rednote",
            "douyin",
            "gdrive",
            "mediafire",
            "terabox",
            "shorten",
            "screenshot",
          ]);

          // Guardrails: skip running plugin if required inputs are missing
          if (mediaCmds.has(command) && !isCurrentMedia && !isQuotedMedia) {
            return;
          }
          if (urlCmds.has(command) && (!text || !/https?:\/\//i.test(text))) {
            return;
          }

          if (isCurrentMedia && !isQuotedMedia && m.quoted) {
            targetM = Object.create(m);
            targetM.quoted = false;
          }

          await plugin.run(targetM, {
            ctx,
            conn,
            store,
            body,
            usedPrefix,
            plugins,
            commands: ctx?.commands || [],
            args,
            command,
            text,
            prefixes: ctx?.prefixes || [usedPrefix],
            core: ctx?.core || {},
            isCommand: true,
            database,
            env,
            groupSet,
            chats,
            users,
            setting,
            isOwner,
            isPrem,
            groupMetadata,
            participants,
            isAdmin,
            isBotAdmin,
            Func,
            Scraper,
          });
        }
      }
    } catch (e) {
      console.error("[Chatbot Exception]:", e);
      return conn.reply(
        m.chat,
        Func.texted("bold", `🚩 [Chatbot Exception]: ${e.message || e}`),
        m,
      );
    }
  },
  error: false,
};
