const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs").promises;
const path = require("path");

const CACHE_FILE = path.join(__dirname, "../../tmp/buildgi-cache.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let cache = { data: null, timestamp: 0 };

// fetch infographic list from keqingmains
async function fetchInfographicList() {
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }
  try {
    // try load from file first
    try {
      const raw = await fs.readFile(CACHE_FILE, "utf8");
      const saved = JSON.parse(raw);
      if (
        saved &&
        saved.timestamp &&
        Date.now() - saved.timestamp < CACHE_TTL
      ) {
        cache = saved;
        return saved.data;
      }
    } catch (_) {}

    const { data: html } = await axios.get("https://keqingmains.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });
    const $ = cheerio.load(html);
    const entries = [];

    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href.includes("/i/") || !text.includes("Genshin Impact")) return;
      const slug = href.replace(/.*\/i\//, "").replace(/\/$/, "");
      const name = text.replace(/\s*Genshin Impact\s*$/, "").trim();
      if (slug && name) entries.push({ slug, name });
    });

    cache = { data: entries, timestamp: Date.now() };
    await fs
      .mkdir(path.dirname(CACHE_FILE), { recursive: true })
      .catch(() => {});
    await fs
      .writeFile(CACHE_FILE, JSON.stringify(cache), "utf8")
      .catch(() => {});
    return entries;
  } catch (e) {
    // fallback to stale cache
    if (cache.data) return cache.data;
    throw e;
  }
}

// group entries by base character name
function groupByCharacter(entries) {
  const map = {};
  for (const e of entries) {
    // skip non-character entries (mechanics, formulas, etc.)
    if (/mechanics|formula|reaction|damage|artifact|should.i/i.test(e.slug))
      continue;
    const base = e.name.split(/\s+/)[0].toLowerCase();
    if (!map[base]) map[base] = [];
    map[base].push(e);
  }
  return map;
}

// fuzzy search character
function findCharacter(query, entries) {
  const q = query.toLowerCase().trim();

  // exact match on slug or name
  for (const e of entries) {
    if (e.slug === q || e.name.toLowerCase() === q) return [e];
  }

  // check multi-build: "aloy freeze" -> slug "aloy-freeze"
  const slugCandidate = q.replace(/\s+/g, "-");
  for (const e of entries) {
    if (e.slug === slugCandidate) return [e];
  }

  // partial match: character name contains query
  const partialMatches = entries.filter(
    (e) => e.name.toLowerCase().includes(q) || e.slug.includes(q),
  );
  if (partialMatches.length > 0) return partialMatches;

  // fuzzy match using Func.similarity (bigram-based)
  const scored = entries
    .map((e) => ({
      entry: e,
      score: Math.max(
        Func.similarity(q, e.name.toLowerCase()),
        Func.similarity(q, e.slug),
      ),
    }))
    .filter((s) => s.score >= 0.45)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored.map((s) => s.entry) : [];
}

// resolve og:image from infographic page
async function fetchInfographicImage(slug) {
  try {
    const { data: html } = await axios.get(
      `https://keqingmains.com/i/${slug}/`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      },
    );
    const $ = cheerio.load(html);
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) return ogImage;
  } catch (_) {}
  return null;
}

module.exports = {
  help: ["buildgi"],
  use: "character [variant]",
  tags: "internet",
  run: async (m, { conn, usedPrefix, command, text, Func }) => {
    try {
      if (!text) {
        let txt = `乂  *B U I L D G I*\n\n`;
        txt += `Usage:\n`;
        txt += `◦ *${usedPrefix}${command} list* — list all builds\n`;
        txt += `◦ *${usedPrefix}${command} [character]* — search build\n`;
        txt += `\nExample:\n`;
        txt += `◦ *${usedPrefix}${command} aloy freeze*\n`;
        txt += `◦ *${usedPrefix}${command} keqing*\n\n`;
        txt += global.footer;
        return conn.reply(m.chat, txt, m);
      }

      conn.sendReact(m.chat, "🕒", m.key);

      const entries = await fetchInfographicList();
      if (!entries || entries.length === 0)
        throw "🚩 Failed to fetch infographic data from KQM.";

      // list command
      if (text.toLowerCase() === "list") {
        const chars = groupByCharacter(entries);
        const names = Object.keys(chars).sort();
        let txt = `乂  *G E N S H I N  B U I L D  L I S T*\n\n`;
        txt += `Total: *${names.length}* characters, *${entries.length}* builds\n\n`;
        for (let i = 0; i < names.length; i++) {
          const builds = chars[names[i]];
          txt += `*${i + 1}.* ${builds[0].name}\n`;
        }
        txt += `\n${global.footer}`;
        return conn.reply(m.chat, txt, m);
      }

      // search character
      const matches = findCharacter(text, entries);
      if (matches.length === 0) {
        // suggest closest
        const suggestions = entries
          .map((e) => ({
            name: e.name,
            score: Func.similarity(text.toLowerCase(), e.name.toLowerCase()),
          }))
          .filter((s) => s.score >= 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        let msg = `🚩 Character *${text}* not found.`;
        if (suggestions.length > 0) {
          msg += `\n\nDid you mean:\n`;
          msg += suggestions.map((s) => `➠ *${s.name}*`).join("\n");
        }
        throw msg;
      }

      // multiple variants for same character
      if (matches.length > 1) {
        // check if query already specifies a variant
        const exactVariant = matches.find(
          (m) =>
            m.name.toLowerCase() === text.toLowerCase() ||
            m.slug === text.toLowerCase().replace(/\s+/g, "-"),
        );
        if (exactVariant) {
          const imgUrl = `https://keqingmains.com/i/${exactVariant.slug}/`;
          const imageUrl = await fetchInfographicImage(exactVariant.slug);
          if (!imageUrl) throw "🚩 Failed to fetch infographic image.";
          const caption = `乂  *${exactVariant.name.toUpperCase()}*\n\n◦ Source: KeqingMains\n◦ Link: ${imgUrl}\n\n${global.footer}`;
          return conn.sendFile(
            m.chat,
            imageUrl,
            Func.filename("png"),
            caption,
            m,
          );
        }

        // show variant list
        let txt = `乂  *${matches[0].name.split(/\s+/)[0].toUpperCase()} — B U I L D  V A R I A N T S*\n\n`;
        txt += `Multiple builds available:\n\n`;
        matches.forEach((m2, i) => {
          txt += `*${i + 1}.* ${m2.name}\n`;
        });
        txt += `\nUsage: *${usedPrefix}${command} [variant name]*\n`;
        txt += `Example: *${usedPrefix}${command} ${matches[0].name.replace(matches[0].name.split(/\s+/)[0], "").trim() || matches[0].name}*\n\n`;
        txt += global.footer;
        return conn.reply(m.chat, txt, m);
      }

      // single result — send infographic
      const entry = matches[0];
      const imgUrl = `https://keqingmains.com/i/${entry.slug}/`;
      const imageUrl = await fetchInfographicImage(entry.slug);
      if (!imageUrl) throw "🚩 Failed to fetch infographic image.";
      const caption = `乂  *${entry.name.toUpperCase()}*\n\n◦ Source: KeqingMains\n◦ Link: ${imgUrl}\n\n${global.footer}`;
      conn.sendFile(m.chat, imageUrl, Func.filename("png"), caption, m);
    } catch (e) {
      throw Func.jsonFormat(e);
    }
  },
  limit: false,
  error: false,
};
