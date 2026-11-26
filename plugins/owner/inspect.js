module.exports = {
   help: ['inspect'],
   aliases: ['ip'],
   tags: 'owner',
   run: async (m, {
      conn,
      store,
      Func
   }) => {
      const data = m.quoted ? m.quoted : m
      if (!data) return conn.reply(m.chat, Func.texted('bold', '🚩 Reply a message.'), m)
      const messages = store?.messages?.[m.chat] || []
      let res = null
      for (const msg of messages) {
         if (msg.key?.id === data.key?.id) {
            res = msg
            break
         }
      }
      if (!res) res = data
      return conn.reply(m.chat, JSON.stringify(res, null, 2), m)
   },
   owner: true
}
