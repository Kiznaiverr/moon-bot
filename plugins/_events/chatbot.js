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
      if (
        !body ||
        (env.evaluate_chars &&
          env.evaluate_chars.some((v) => body.startsWith(v)))
      )
        return;
      if (ctx?.isCommand) return;

      const botJid = conn.decodeJid(conn.user.id);
      const isMentioned =
        (m.mentionedJid && m.mentionedJid.includes(botJid)) ||
        (m.quoted && m.quoted.sender === botJid);

      // Group: only when tagged or quoted. Private: when setting.chatbot active or directly chatted
      if (m.isGroup && !isMentioned) return;
      if (!m.isGroup && !setting.chatbot && !isMentioned) return;

      const formattedPrompt = formatUserPrompt(m, body);
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
      } = parseResponse(res.data);

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
            packname: setting?.sk_pack || "Luna",
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
