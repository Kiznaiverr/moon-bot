const { Kirara } = require("@kiznavierr/kirara");

const kirara = new Kirara("genshin");

module.exports = {
  help: ["profilegi"],
  use: "uid",
  tags: "internet",
  run: async (m, { conn, usedPrefix, command, text, Func }) => {
    try {
      if (!text || !/^\d+$/.test(text.trim()))
        throw Func.example(usedPrefix, command, "856012067");

      conn.sendReact(m.chat, "🕒", m.key);

      const uid = text.trim();
      let data;
      try {
        data = await kirara.getPlayerSummary(uid, { lang: "en" });
      } catch (e) {
        throw `🚩 ${e?.message || "Failed to fetch player data."}`;
      }

      if (!data) throw "🚩 No data returned for this UID.";

      // private profile — no cardUrl
      if (!data.cardUrl) {
        let txt = `乂  *G E N S H I N  P R O F I L E*\n\n`;
        txt += `   ∘  *Nickname* : ${data.nickname || "-"}\n`;
        txt += `   ∘  *Level* : AR ${data.level || "-"}\n`;
        txt += `   ∘  *Signature* : ${data.signature || "-"}\n`;
        txt += `   ∘  *Achievements* : ${data.finishAchievementNum || 0}\n`;
        txt += `   ∘  *Spiral Abyss* : F${data.towerFloorIndex || 0}-${data.towerLevelIndex || 0}\n`;
        if (data.theaterActIndex)
          txt += `   ∘  *Imaginarium Theater* : Act ${data.theaterActIndex}\n`;
        txt += `\n*No character found or private showcase*\n`;
        txt += `\n${global.footer}`;
        return conn.reply(m.chat, txt, m);
      }

      // public profile — build summary text
      let txt = `乂  *G E N S H I N  P R O F I L E*\n\n`;
      txt += `   ∘  *Nickname* : ${data.nickname || "-"}\n`;
      txt += `   ∘  *Level* : AR ${data.level || "-"}\n`;
      txt += `   ∘  *Signature* : ${data.signature || "-"}\n`;
      txt += `   ∘  *Achievements* : ${data.finishAchievementNum || 0}\n`;
      txt += `   ∘  *Spiral Abyss* : F${data.towerFloorIndex || 0}-${data.towerLevelIndex || 0}\n`;
      if (data.theaterActIndex)
        txt += `   ∘  *Imaginarium Theater* : Act ${data.theaterActIndex}\n`;
      txt += `   ∘  *Showcase Characters* : ${data.avatarIds?.length || 0}\n`;
      txt += `\n${global.footer}`;

      // try to fetch card image ourselves — cardUrl can exist but return 400/404
      const axios = require("axios");
      let imgBuf = null;
      try {
        const resp = await axios.get(data.cardUrl, {
          responseType: "arraybuffer",
          timeout: 15000,
          validateStatus: (s) => s === 200,
        });
        const ct = resp.headers["content-type"] || "";
        if (ct.startsWith("image/")) imgBuf = Buffer.from(resp.data);
      } catch {}

      if (imgBuf) {
        conn.sendFile(m.chat, imgBuf, Func.filename("png"), txt, m);
      } else {
        conn.reply(m.chat, txt, m);
      }
    } catch (e) {
      throw Func.jsonFormat(e);
    }
  },
  limit: false,
  error: false,
};
