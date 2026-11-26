module.exports = {
   help: ['reset'],
   use: 'type [amount]',
   tags: 'owner',
   run: async (m, {
      conn,
      args,
      usedPrefix,
      command,
      setting,
      env,
      Func
   }) => {
      try {
         const users = Object.values(global.db.users)
         const chats = Object.values(global.db.chats)
         chats.forEach((v) => {
            v.lastchat = 0
         })

         const [type, rawAmount] = args
         const amount = rawAmount !== undefined && !isNaN(Number(rawAmount)) ? Number(rawAmount) : null

         if (type === 'limit') {
            const freeUsers = users.filter((v) => !v.premium && (amount !== null || v.limit < env.limit))
            freeUsers.forEach((v) => {
               v.limit = amount ?? env.limit
            })
            setting.lastReset = new Date() * 1
            return conn.reply(m.chat, Func.texted('bold', `✅ Successfully reset limit for ${freeUsers.length} free users to ${amount ?? env.limit}.`), m)
         } else if (type === 'exp') {
            users.forEach((v) => {
               v.exp = amount ?? 0
            })
            return conn.reply(m.chat, Func.texted('bold', `✅ Successfully reset exp for ${users.length} users to ${amount ?? 0}.`), m)
         } else if (type === 'all') {
            users.forEach((v) => {
               v.limit = amount ?? env.limit
               v.exp = 0
            })
            setting.lastReset = new Date() * 1
            return conn.reply(m.chat, Func.texted('bold', `✅ Successfully reset all data for ${users.length} users.`), m)
         } else {
            let teks = `• *Usage Example* :\n\n`
            teks += `${usedPrefix + command} limit\n`
            teks += `${usedPrefix + command} limit 15\n`
            teks += `\n_Type: limit, exp, all._`
            return conn.reply(m.chat, teks, m)
         }
      } catch (e) {
         return conn.reply(m.chat, Func.jsonFormat(e), m)
      }
   },
   owner: true
}
