module.exports = {
   help: ['listonline'],
   aliases: ['here'],
   tags: 'group',
   run: async (m, {
      conn,
      store,
      participants,
      Func
   }) => {
      const online = Object.keys(store?.presences?.[m.chat] || {})
      if (online.length < 1) {
         return conn.reply(m.chat, Func.texted('bold', '🚩 The system does not detect members who are online.'), m)
      }
      const toJid = (id) => {
         const found = participants?.find((v) => v.lid === id || v.id === id || v.jid === id)
         return found?.id || found?.jid || id
      }
      return conn.reply(m.chat, online.map((v) => '◎  @' + toJid(v).replace(/@.+/, '')).join('\n'), m)
   },
   error: false,
   group: true
}
