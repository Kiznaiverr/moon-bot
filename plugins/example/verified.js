module.exports = {
   help: ['verified1'],
   tags: 'example',
   run: async (m, {
      conn,
      text,
      Func
   }) => {
      try {
         await conn.reply(m.chat, text || 'Hi!', Func.fake('2'))
      } catch (e) {
         conn.reply(m.chat, Func.jsonFormat(e), m)
      }
   },
   error: false
}
