module.exports = {
   help: ['setheader', 'setfooter'],
   use: 'text',
   tags: 'owner',
   run: async (m, {
      conn,
      text,
      usedPrefix,
      command,
      setting,
      Func
   }) => {
      try {
         if (!text) {
            return conn.reply(m.chat, Func.example(usedPrefix, command, command === 'setfooter' ? global.footer : global.header), m)
         }
         const prop = command.replace('set', '')
         setting[prop] = text
         global[prop] = text
         return conn.reply(m.chat, Func.texted('bold', `🚩 ${Func.ucword(prop)} successfully set.`), m)
      } catch (e) {
         return conn.reply(m.chat, Func.jsonFormat(e), m)
      }
   },
   owner: true
}
