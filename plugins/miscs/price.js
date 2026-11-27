module.exports = {
   help: ['premium'],
   tags: 'miscs',
   run: async (m, {
      conn,
      env
   }) => {
      let text = `乂  *P R E M I U M*\n\n`
      text += `◦ *Price* : IDR 10.000\n`
      text += `◦ *Duration* : 30 Days\n`
      text += `◦ *Benefit* : Unlimited Limit\n\n`
      text += `To buy, please contact the owner:\n`
      text += `https://wa.me/${env.owner}?text=${encodeURIComponent('Hi, I want to buy Premium.')}`
      return conn.reply(m.chat, text, m)
   }
}