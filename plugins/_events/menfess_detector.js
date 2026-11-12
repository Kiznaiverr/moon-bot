module.exports = {
   run: async (m, {
      conn,
      Func
   }) => {
      try {
         if (m.isGroup || m.fromMe || /broadcast|newsletter/.test(m.chat)) return
         if (!conn.menfess || Object.keys(conn.menfess).length === 0) return

         const now = Date.now()
         const TIMEOUT = 24 * 60 * 60 * 1000 // 24-hour timeout

         // Clean up expired sessions
         for (const [id, session] of Object.entries(conn.menfess)) {
            if (now - session.lastActivity > TIMEOUT) {
               delete conn.menfess[id]
            }
         }

         let session = Object.values(conn.menfess).find(s => s.check(m.sender))
         if (!session) return

         let bodyText = (m.text || '').trim().toLowerCase()

         // Detect stop command if sent as a normal chat message
         if (['stopmenfess', '.stopmenfess', '#stopmenfess', '!stopmenfess', '/stopmenfess', 'stopconfess', '.stopconfess', '#stopconfess', '!stopconfess', '/stopconfess'].includes(bodyText)) {
            let other = session.other(m.sender)
            delete conn.menfess[session.id]

            await conn.reply(m.chat, `💌 *SESI MENFESS SELESAI*\n\nSesi obrolan rahasia telah kamu akhiri. Chatbot dan menu bot kembali aktif seperti biasa.`, m)
            if (other) {
               await conn.sendMessage(other, { text: `💌 *SESI MENFESS SELESAI*\n\nSesi obrolan rahasia telah diakhiri oleh lawan bicara. Chatbot dan menu bot kembali aktif seperti biasa.` })
            }
            return
         }

         // PHASE 1: Waiting for target's first reply
         if (session.state === 'WAITING') {
            if (m.sender === session.from) {
               return conn.reply(m.chat, Func.texted('bold', `🚩 Mohon tunggu target membalas terlebih dahulu sebelum mengirim pesan lanjutan. Ketik .stopmenfess jika ingin membatalkan.`), m)
            }

            if (m.sender === session.to) {
               session.state = 'CHATTING'
               session.lastActivity = now
               let other = session.other(m.sender)

               let replyHeader = `💌 *BALASAN MENFESS*\n\n`
               replyHeader += `Target telah membalas pesan rahasiamu:\n\n`

               if (m.text) {
                  replyHeader += `"${m.text}"\n\n`
                  replyHeader += `──────────────────────\n`
                  replyHeader += `Kalian sekarang terhubung di obrolan anonim. Langsung ketik balasanmu di sini untuk melanjutkan obrolan (bisa kirim VN, foto, atau stiker). Ketik *.stopmenfess* untuk mengakhiri.`
                  await conn.sendMessage(other, { text: replyHeader })
               } else {
                  replyHeader += `──────────────────────\n`
                  replyHeader += `Target mengirimkan media di bawah. Kalian sekarang terhubung di obrolan anonim. Langsung ketik balasanmu di sini untuk melanjutkan obrolan. Ketik *.stopmenfess* untuk mengakhiri.`
                  await conn.sendMessage(other, { text: replyHeader })
                  await conn.copyNForward(other, m, true)
               }

               await conn.reply(m.chat, Func.texted('bold', `✅ Balasan kamu telah terkirim! Sekarang kalian bisa saling mengobrol secara anonim (bebas kirim teks, VN, foto, stiker). Ketik .stopmenfess untuk keluar kapan saja.`), m)
               return
            }
         }

         // PHASE 2: Active two-way conversation session (multi-turn & media-supported)
         if (session.state === 'CHATTING') {
            session.lastActivity = now
            let partner = session.other(m.sender)

            await conn.copyNForward(partner, m, true)

            try {
               await conn.sendMessage(m.chat, { react: { text: '💌', key: m.key } })
            } catch { }
         }
      } catch (e) {
         console.error(e)
      }
   },
   private: true,
   error: false
}
