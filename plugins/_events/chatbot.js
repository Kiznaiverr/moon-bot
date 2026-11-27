const chatbotConfig = require("../../lib/chatbot/config");
const {
  loadHistory,
  saveHistory,
  formatUserPrompt,
} = require("../../lib/chatbot/history");
const {
  callOpenAI,
  parseResponse,
  transcribeAudio,
  synthesizeSpeech,
} = require("../../lib/chatbot/provider");
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

      const isCurrentVoiceNote =
        m.mtype === "audioMessage" &&
        Boolean(m.msg?.ptt || m.ptt || m.message?.audioMessage?.ptt);

      if (!body && !isCurrentVoiceNote) return;
      if (
        body &&
        env.evaluate_chars &&
        env.evaluate_chars.some((v) => body.startsWith(v))
      )
        return;
      if (ctx?.isCommand) return;

      // Ignore if user is currently in a menfess session or anonymous chat
      if (conn.menfess && Object.values(conn.menfess).some((s) => s.check(m.sender))) return;
      if (conn.anonymous && Object.values(conn.anonymous).some((r) => r.check(m.sender) && r.state === 'CHATTING')) return;

      const botJid = conn.decodeJid(conn.user.id);
      const botLid = conn.user?.lid ? conn.decodeJid(conn.user.lid) : null;
      const isMentioned =
        (m.mentionedJid &&
          (m.mentionedJid.includes(botJid) ||
            (botLid && m.mentionedJid.includes(botLid)))) ||
        (m.quoted &&
          (m.quoted.sender === botJid ||
            (botLid && m.quoted.sender === botLid)));

      // Check for passive keyword trigger in groups
      const keywordRegex = /\b(bot|botnya|kirara|hoshikita|moon)\b/i;
      const hasKeyword = Boolean(body && keywordRegex.test(body));
      const isPassiveGroup = Boolean(m.isGroup && !isMentioned && hasKeyword && setting.chatbot);

      // Group: per-group toggle (default on)
      if (m.isGroup && groupSet && groupSet.chatbot === false) return;

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
      } else if (!isOwner) {
        // Rate-limit direct mentions & private chat per user (5 seconds, bypassed for owner)
        const now = Date.now();
        const USER_COOLDOWN_MS = 5000;
        conn.chatbotUserCooldowns = conn.chatbotUserCooldowns || new Map();
        const lastUserTrigger = conn.chatbotUserCooldowns.get(m.sender) || 0;
        if (now - lastUserTrigger < USER_COOLDOWN_MS) return;
        conn.chatbotUserCooldowns.set(m.sender, now);
      }

      const qMtype =
        m.quoted?.mtype ||
        (m.quoted?.message && typeof m.quoted.message === "object"
          ? Object.keys(m.quoted.message)[0]
          : "");
      const isQuotedVoiceNote =
        qMtype === "audioMessage" &&
        Boolean(
          m.quoted?.msg?.ptt ||
            m.quoted?.ptt ||
            m.quoted?.message?.audioMessage?.ptt,
        );

      // Transcribe voice notes only (ptt === true)
      let voiceTranscript = "";
      let quotedVoiceTranscript = "";
      const voiceTarget = isCurrentVoiceNote
        ? m
        : isQuotedVoiceNote
          ? m.quoted
          : null;

      if (voiceTarget && typeof voiceTarget.download === "function") {
        const durationSec = Number(
          voiceTarget.msg?.seconds ||
            voiceTarget.seconds ||
            voiceTarget.message?.audioMessage?.seconds ||
            0,
        );
        if (durationSec <= 120) {
          try {
            const audioBuf = await voiceTarget.download();
            if (
              Buffer.isBuffer(audioBuf) &&
              audioBuf.length > 0 &&
              audioBuf.length <= 5 * 1024 * 1024
            ) {
              const mime =
                (voiceTarget.msg || voiceTarget).mimetype || "audio/ogg";
              const sttRes = await transcribeAudio(audioBuf, {
                mimetype: mime,
              });
              if (sttRes.status && sttRes.text) {
                if (isCurrentVoiceNote) voiceTranscript = sttRes.text;
                else quotedVoiceTranscript = sttRes.text;
              } else if (!sttRes.status) {
                console.error(
                  `[Chatbot STT Error ${sttRes.code}]:`,
                  sttRes.msg,
                );
              }
            }
          } catch (sttErr) {
            console.error("[Chatbot STT Download Error]:", sttErr.message);
          }
        }
      }

      if (isCurrentVoiceNote && !voiceTranscript) return;

      const formattedPrompt = formatUserPrompt(m, body, {
        isPassiveGroup,
        isAdmin,
        isBotAdmin,
        isOwner,
        botJid,
        botLid,
        voiceTranscript,
        quotedVoiceTranscript,
      });
      if (!formattedPrompt) return;

      // Extract image attachment for Vision (current message first, then quoted message)
      let imageUrl = null;
      const visionTarget = /image/.test(m.mtype || "")
        ? m
        : m.quoted && /image/.test(qMtype)
          ? m.quoted
          : null;
      if (visionTarget && typeof visionTarget.download === "function") {
        try {
          const imgBuf = await visionTarget.download();
          if (Buffer.isBuffer(imgBuf) && imgBuf.length > 0 && imgBuf.length <= 4 * 1024 * 1024) {
            const mime = (visionTarget.msg || visionTarget).mimetype || "image/jpeg";
            if (/^image\/(jpe?g|png|webp)$/i.test(mime)) {
              imageUrl = `data:${mime};base64,${imgBuf.toString("base64")}`;
            }
          }
        } catch {}
      }

      await conn.sendPresenceUpdate("composing", m.chat).catch(() => {});

      const history = loadHistory(m.chat);
      const res = await callOpenAI(formattedPrompt, history, { imageUrl });
      if (!res.status) {
        await conn.sendPresenceUpdate("paused", m.chat).catch(() => {});
        console.error(`[Chatbot Error ${res.code}]:`, res.msg);
        const friendlyErr =
          res.code === 429 || res.code === "TIMEOUT"
            ? "bentar yaa kakk, kepala Kirara lagi agak pusing kebanyakan mikir (>_<)"
            : "aduhh sinyal dari galaksi Kirara lagi gangguan nih kak, coba bentar lagi yaa (>_<)";
        return conn.reply(m.chat, friendlyErr, m);
      }

      const {
        cleanMessage,
        hasCommand,
        command,
        argument,
        hasSticker,
        stickerCategory,
        hasTts,
        ttsLang,
        ttsText,
        isSilent,
      } = parseResponse(res.data);

      // Ignore if AI decided to stay silent or empty response
      if (isSilent || (!cleanMessage && !hasTts)) {
        await conn.sendPresenceUpdate("paused", m.chat).catch(() => {});
        return;
      }

      // Update cooldown timestamp if passive trigger succeeded and replied
      if (isPassiveGroup) {
        conn.chatbotCooldowns = conn.chatbotCooldowns || new Map();
        conn.chatbotCooldowns.set(m.chat, Date.now());
      }

      const historyLimit = m.isGroup
        ? chatbotConfig.groupHistoryLimit
        : chatbotConfig.historyLimit;
      const savedReply =
        hasCommand && command
          ? `${cleanMessage} [executed: ${command}]`
          : hasTts && ttsText
            ? `${cleanMessage || ""} [voice: ${ttsText}]`.trim()
            : cleanMessage;

      saveHistory(
        m.chat,
        [
          ...history,
          { role: "user", content: formattedPrompt },
          { role: "assistant", content: savedReply },
        ],
        historyLimit,
      );

      if (cleanMessage) {
        await conn.reply(m.chat, cleanMessage, m);
      }

      if (hasTts && !hasCommand && ttsText) {
        await conn.sendPresenceUpdate("recording", m.chat).catch(() => {});
        const ttsRes = await synthesizeSpeech(ttsText, ttsLang);
        if (ttsRes.status && Buffer.isBuffer(ttsRes.audio)) {
          await conn.sendFile(m.chat, ttsRes.audio, "voice.mp3", "", m, {
            ptt: true,
          });
        } else {
          console.error("[Chatbot TTS Error]:", ttsRes.msg);
          if (!cleanMessage) {
            await conn.reply(m.chat, ttsText, m);
          }
        }
      }

      if (hasSticker && !hasCommand && stickerCategory) {
        const stickerUrl = getStickerUrl(stickerCategory);
        if (stickerUrl) {
          await conn.sendSticker(m.chat, stickerUrl, m, {
            packname: setting?.sk_pack || "Hoshikita Kirara",
            author: setting?.sk_author || "moon-bot",
            mode: "premium",
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
          // Hard permission guards matching handler.js so non-admins cannot bypass via prompt injection
          if (plugin.group && !m.isGroup) return;
          if (plugin.private && m.isGroup) return;
          if (plugin.owner && !isOwner) return;
          if (plugin.admin && !isAdmin && !isOwner) return;
          if (plugin.botAdmin && !isBotAdmin) return;
          if (plugin.premium && !isPrem && !isOwner) return;

          const args = argument ? argument.trim().split(/\s+/) : [];
          const text = argument ? argument.trim() : "";
          const usedPrefix = ctx?.prefix || setting?.onlyprefix || "#";

          let targetM = m;
          if (Array.isArray(m.mentionedJid) && m.mentionedJid.length > 0) {
            const filteredMentions = m.mentionedJid.filter(
              (j) => j !== botJid && (!botLid || j !== botLid),
            );
            if (filteredMentions.length !== m.mentionedJid.length) {
              targetM = Object.create(m);
              targetM.mentionedJid = filteredMentions;
            }
          }
          const isCurrentMedia = /image|video|sticker/.test(m.mtype || "");
          const isCurrentAudio = /audio/.test(m.mtype || "");
          const quotedType =
            m.quoted?.mtype ||
            (m.quoted?.message && typeof m.quoted.message === "object"
              ? Object.keys(m.quoted.message)[0]
              : "");
          const isQuotedMedia = /image|video|sticker/.test(quotedType);
          const isQuotedAudio = /audio/.test(quotedType);

          const mediaCmds = new Set([
            "s",
            "sticker",
            "stiker",
            "stcaudio",
            "saudio",
            "stickeraudio",
            "stikeraudio",
            "sai",
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
          const audioVideoCmds = new Set(["sa", "saveaudio", "tomp3"]);
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
          if (
            audioVideoCmds.has(command) &&
            !isCurrentMedia &&
            !isQuotedMedia &&
            !isCurrentAudio &&
            !isQuotedAudio
          ) {
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
