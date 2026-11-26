const moment = require('moment-timezone')

module.exports = {
   help: ['getch'],
   use: 'link',
   tags: 'group',
   run: async (m, {
      conn,
      args,
      usedPrefix,
      command,
      Func
   }) => {
      try {
         if (!args || !args[0]) {
            return conn.reply(m.chat, Func.example(usedPrefix, command, 'https://whatsapp.com/channel/0029VaDs0ba1SWtAQnMvZb0U'), m)
         }
         const match = args[0].match(/\/channel\/([a-zA-Z0-9]+)/)
         if (!match) return conn.reply(m.chat, global.status.invalid, m)
         const meta = await conn.newsletterMetadata('INVITE', match[1])
         let caption = `⼷  *C H A N N E L*\n\n`
         caption += `\t◎  *ID* : ${meta.id || meta.name}\n`
         caption += `\t◎  *Name* : ${meta.thread_metadata?.name?.text || meta.id}\n`
         caption += `\t◎  *Subscribers* : ${Func.formatter(meta.thread_metadata?.subscribers_count || meta.subscribers)}\n`
         caption += `\t◎  *Status* : ${meta.state?.type || meta.state}\n`
         caption += `\t◎  *Verification* : ${meta.thread_metadata?.verification || meta.verification}\n`
         caption += `\t◎  *Description* : ${meta.thread_metadata?.description?.text || meta.description}\n`
         caption += `\t◎  *Created* : ${moment.unix(((v) => (v > 1e12 ? v / 1000 : v))(meta.thread_metadata?.creation_time || meta.creation_time)).format('DD/MM/YY HH:mm:ss')}\n\n`
         caption += global.footer
         return conn.sendFile(m.chat, 'https://pps.whatsapp.net' + (meta.thread_metadata?.preview?.direct_path || meta.preview), 'image.jpg', caption, m)
      } catch (e) {
         return conn.reply(m.chat, Func.texted('bold', '🚩 Invalid channel'), m)
      }
   },
   error: false
}
