module.exports = {
   help: ['premium'],
   tags: 'miscs',
   run: async (m, {
      conn,
      env
   }) => {
      const buttons = [{
         name: 'cta_url',
         buttonParamsJson: JSON.stringify({
            display_text: 'Buy Premium',
            url: `https://wa.me/${env.owner}?text=${encodeURIComponent('Hi, I want to buy Premium.')}`,
            merchant_url: `https://wa.me/${env.owner}`
         })
      }]
      const text = `IDR 10.000 ~ to get 30 Days Premium & Unlimited Limit.`
      return conn.sendIAMessage(m.chat, buttons, m, {
         header: '',
         content: text,
         footer: global.footer
      }).catch(() => conn.reply(m.chat, text, m))
   }
}