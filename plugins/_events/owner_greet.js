const getWibTimeSlot = () => {
   const now = new Date()
   const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
   }).formatToParts(now)
   const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
   const hour = Number(map.hour) % 24
   const dateKey = `${map.year}-${map.month}-${map.day}`

   let period = 'malam'
   if (hour >= 4 && hour < 11) period = 'pagi'
   else if (hour >= 11 && hour < 15) period = 'siang'
   else if (hour >= 15 && hour < 18) period = 'sore'

   return { period, slotKey: `${dateKey}:${period}` }
}

const GREETINGS = {
   pagi: [
      'pagi Kak @tag',
      'good morning @tag',
      'ohayou Kak @tag',
      'pagi @tag, selamat beraktivitas'
   ],
   siang: [
      'siang Kak @tag',
      'selamat siang @tag',
      'siang @tag~',
      'halo Kak @tag, selamat siang'
   ],
   sore: [
      'sore Kak @tag',
      'selamat sore @tag',
      'sore @tag~',
      'halo Kak @tag, selamat sore'
   ],
   malam: [
      'malam Kak @tag',
      'selamat malam @tag',
      'malem Kak @tag~',
      'good evening @tag'
   ]
}

module.exports = {
   run: async (m, {
      ctx,
      conn,
      body,
      groupSet,
      setting,
      Func
   }) => {
      try {
         if (!setting?.ownergreet) return
         if (m.fromMe || /reaction/i.test(m.mtype || '')) return
         if (ctx?.isCommand) return

         // Skip if message is already targeting the chatbot so Kirara doesn't double-reply
         const botJid = conn.decodeJid(conn.user.id)
         const botLid = conn.user?.lid ? conn.decodeJid(conn.user.lid) : null
         const isChatbotMention =
            (m.mentionedJid && (m.mentionedJid.includes(botJid) || (botLid && m.mentionedJid.includes(botLid)))) ||
            (m.quoted && (m.quoted.sender === botJid || (botLid && m.quoted.sender === botLid)))
         const isChatbotPassive = Boolean(
            setting?.chatbot &&
            groupSet?.chatbot !== false &&
            body &&
            /\b(bot|botnya|kirara|hoshikita|moon)\b/i.test(body)
         )
         if (isChatbotMention || isChatbotPassive) return

         const { period, slotKey } = getWibTimeSlot()
         conn.ownerGreeted = conn.ownerGreeted || new Map()
         if (conn.ownerGreeted.get(m.chat) === slotKey) return
         conn.ownerGreeted.set(m.chat, slotKey)

         const pool = GREETINGS[period] || GREETINGS.malam
         const template = Func.random(pool)
         const text = template.replace('@tag', m.sender.split('@')[0])

         await conn.reply(m.chat, text, Func.fake('2', 'ʜᴏꜱʜɪᴋɪᴛᴀ ᴋɪʀᴀʀᴀ'), {
            mentions: [m.sender]
         })
      } catch (e) {
         console.error('[Owner Greet Error]:', e)
      }
   },
   group: true,
   owner: true,
   error: false
}
