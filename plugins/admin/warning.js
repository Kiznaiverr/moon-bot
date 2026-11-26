module.exports = {
   help: ['warn', 'unwarn'],
   aliases: ['addwarn', 'delwarn'],
   use: 'mention / reply',
   tags: 'admin',
   run: async (m, {
      conn,
      command,
      usedPrefix,
      groupSet,
      Func
   }) => {
      try {
         const mentionedUser = m.mentionedJid && m.mentionedJid.length > 0
            ? m.mentionedJid[0]
            : m.quoted && m.quoted.sender
               ? m.quoted.sender
               : false

         if (mentionedUser === '0@s.whatsapp.net') {
            return conn.reply(m.chat, Func.texted('bold', '🚩 You cannot add warning points to that user.'), m)
         }
         if (!mentionedUser) {
            return conn.reply(m.chat, Func.texted('bold', '🚩 Mention or reply the user whose warning you want to add or remove.'), m)
         }

         const targetUser = mentionedUser
         if (!groupSet?.member?.[targetUser]) {
            groupSet.member[targetUser] = {
               lid: null,
               chat: 0,
               lastseen: 0,
               warning: 0
            }
         }

         if (command === 'warn' || command === 'addwarn') {
            groupSet.member[targetUser].warning = (groupSet.member[targetUser].warning || 0) + 1
            const count = groupSet.member[targetUser].warning
            await conn.reply(m.chat, `⚠️ @${targetUser.replace(/@.+/, '')} warning: ${count} / 5.`, m)
            if (count >= 5) {
               await Func.delay(1000)
               await conn.groupParticipantsUpdate(m.chat, [targetUser], 'remove').catch(() => {
                  conn.reply(m.chat, Func.texted('bold', '🚩 An error occurred while trying to remove the user from the group.'), m)
               })
               groupSet.member[targetUser].warning = 0
            }
         } else if (command === 'unwarn' || command === 'delwarn') {
            if ((groupSet.member[targetUser].warning || 0) <= 0) {
               return conn.reply(m.chat, Func.texted('bold', `🚩 @${targetUser.replace(/@.+/, '')} has no warning points.`), m)
            }
            groupSet.member[targetUser].warning -= 1
            return conn.reply(m.chat, `⚠️ @${targetUser.replace(/@.+/, '')} warning: ${groupSet.member[targetUser].warning} / 5.`, m)
         } else {
            let teks = `• *Example* :\n\n`
            teks += `${usedPrefix}warn @0\n`
            teks += `${usedPrefix}unwarn @0`
            return conn.reply(m.chat, teks, m)
         }
      } catch (e) {
         return conn.reply(m.chat, Func.jsonFormat(e), m)
      }
   },
   admin: true,
   group: true,
   botAdmin: true,
   error: false
}
