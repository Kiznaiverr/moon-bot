module.exports = {
   help: ['totalchat', 'resettc'],
   tags: 'group',
   run: async (m, {
      conn,
      command,
      participants,
      groupSet,
      isAdmin,
      isOwner,
      Func
   }) => {
      try {
         if (command === 'totalchat') {
            const data = []
            for (const jid of participants.map((v) => v.id)) {
               if (groupSet?.member?.[jid]?.chat > 0) {
                  data.push({
                     jid,
                     count: groupSet.member[jid].chat
                  })
               }
            }
            if (data.length < 1) {
               return conn.reply(m.chat, Func.texted('bold', '🚩 There is no chat for this group yet.'), m)
            }
            const text = data
               .sort((a, b) => b.count - a.count)
               .map((v) => `- @${conn.decodeJid(v.jid).replace(/@.+/, '')} : ${v.count}`)
               .join('\n')
            return conn.reply(m.chat, text, m)
         } else if (command === 'resettc') {
            if (!isAdmin && !isOwner) return conn.reply(m.chat, global.status.admin, m)
            const memberIds = new Set(participants.map((v) => v.id))
            for (const jid in groupSet.member) {
               if (memberIds.has(jid)) {
                  groupSet.member[jid].chat = 0
               } else {
                  delete groupSet.member[jid]
               }
            }
            return conn.reply(m.chat, Func.texted('bold', '🚩 Total chat has been reset.'), m)
         }
      } catch (e) {
         return conn.reply(m.chat, global.status.error, m)
      }
   },
   error: false,
   group: true
}
