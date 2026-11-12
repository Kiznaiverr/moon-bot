const moment = require('moment-timezone')

module.exports = [{
   help: ['menfess', 'confess'],
   use: 'number | name | message',
   tags: 'anonymous',
   run: async (m, {
      conn,
      usedPrefix,
      command,
      text,
      Func
   }) => {
      try {
         conn.menfess = conn.menfess ? conn.menfess : {}

         // Cleanup expired sessions (> 24 hours)
         const now = Date.now()
         const TIMEOUT = 24 * 60 * 60 * 1000
         for (const [id, session] of Object.entries(conn.menfess)) {
            if (now - session.lastActivity > TIMEOUT) {
               delete conn.menfess[id]
            }
         }

         if (!text || !text.includes('|')) return conn.reply(m.chat, Func.example(usedPrefix, command, '6281234567890 | Secret Admirer | Halo, semangat ya hari ini!'), m)

         let [number, alias, ...msg] = text.split('|')
         number = (number || '').trim()
         alias = (alias || '').trim()
         let message = msg.join('|').trim()

         if (!number || !alias || !message) return conn.reply(m.chat, Func.example(usedPrefix, command, '6281234567890 | Secret Admirer | Halo, semangat ya hari ini!'), m)

         let cleanNumber = number.replace(/[^0-9]/g, '')
         if (cleanNumber.startsWith('0')) cleanNumber = '62' + cleanNumber.slice(1)
         if (cleanNumber.length < 8) return conn.reply(m.chat, Func.texted('bold', `🚩 Format nomor WhatsApp tidak valid.`), m)

         let check = await conn.onWhatsApp(cleanNumber)
         if (!check || !check.length) return conn.reply(m.chat, Func.texted('bold', `🚩 Nomor WhatsApp tujuan tidak valid atau tidak terdaftar.`), m)

         let targetJid = conn.decodeJid(check[0].jid)
         let botJid = conn.decodeJid(conn.user.id)

         if (targetJid === m.sender) return conn.reply(m.chat, Func.texted('bold', `🚩 Tidak bisa mengirim menfess ke nomor sendiri.`), m)
         if (targetJid === botJid) return conn.reply(m.chat, Func.texted('bold', `🚩 Tidak bisa mengirim menfess ke nomor bot.`), m)

         let existingSender = Object.values(conn.menfess).find(s => s.check(m.sender))
         if (existingSender) return conn.reply(m.chat, Func.texted('bold', `🚩 Kamu masih memiliki sesi menfess yang aktif. Ketik ${usedPrefix}stopmenfess untuk mengakhirinya terlebih dahulu.`), m)

         let existingReceiver = Object.values(conn.menfess).find(s => s.check(targetJid))
         if (existingReceiver) return conn.reply(m.chat, Func.texted('bold', `🚩 Nomor tujuan sedang berada dalam sesi menfess lain. Silakan coba lagi nanti.`), m)

         let dateStr = moment(now).tz(process.env.TZ || 'Asia/Jakarta').format('DD MMM YYYY, HH:mm') + ' WIB'

         let targetMsg = `💌 *PESAN RAHASIA (MENFESS)*\n\n`
         targetMsg += `Hai, seseorang mengirimkan pesan rahasia untukmu.\n\n`
         targetMsg += `◦ *Pengirim :* ${alias}\n`
         targetMsg += `◦ *Waktu :* ${dateStr}\n\n`
         targetMsg += `*Pesan :*\n`
         targetMsg += `"${message}"\n\n`
         targetMsg += `──────────────────────\n`
         targetMsg += `*Cara Membalas :*\n`
         targetMsg += `Cukup balas chat ini (atau swipe reply) untuk mengobrol secara anonim. Kamu juga bisa kirim VN, foto, atau stiker.\n`
         targetMsg += `Ketik *${usedPrefix}stopmenfess* untuk mengakhiri sesi obrolan.`

         let sent = await conn.sendMessage(targetJid, { text: targetMsg })

         let id = 'mf_' + now
         conn.menfess[id] = {
            id,
            from: m.sender,
            to: targetJid,
            alias,
            state: 'WAITING',
            lastMsgTarget: sent?.key?.id || '',
            lastMsgSender: m.key.id,
            createdAt: now,
            lastActivity: now,
            check: function (who = '') {
               return [this.from, this.to].includes(who)
            },
            other: function (who = '') {
               return who === this.from ? this.to : who === this.to ? this.from : ''
            }
         }

         let senderMsg = `💌 *MENFESS TERKIRIM*\n\n`
         senderMsg += `Pesan rahasiamu berhasil dikirim ke target!\n`
         senderMsg += `◦ *Tujuan :* @${cleanNumber}\n`
         senderMsg += `◦ *Status :* Menunggu balasan\n\n`
         senderMsg += `Jika dia membalas, pesannya akan langsung masuk ke sini dan kalian bisa saling mengobrol secara anonim. Ketik *${usedPrefix}stopmenfess* jika ingin membatalkan.`

         await conn.reply(m.chat, senderMsg, m, { mentions: [targetJid] })
      } catch (e) {
         return conn.reply(m.chat, Func.jsonFormat(e), m)
      }
   },
   private: true,
   limit: false,
   restrict: true
}, {
   help: ['stopmenfess', 'stopconfess'],
   tags: 'anonymous',
   run: async (m, {
      conn,
      usedPrefix,
      Func
   }) => {
      try {
         conn.menfess = conn.menfess ? conn.menfess : {}
         let session = Object.values(conn.menfess).find(s => s.check(m.sender))
         if (!session) return conn.reply(m.chat, Func.texted('bold', `🚩 Kamu tidak sedang berada dalam sesi menfess.`), m)

         let other = session.other(m.sender)
         delete conn.menfess[session.id]

         await conn.reply(m.chat, `💌 *SESI MENFESS SELESAI*\n\nSesi obrolan rahasia telah kamu akhiri. Chatbot dan menu bot kembali aktif seperti biasa.`, m)
         if (other) {
            await conn.sendMessage(other, { text: `💌 *SESI MENFESS SELESAI*\n\nSesi obrolan rahasia telah diakhiri oleh lawan bicara. Chatbot dan menu bot kembali aktif seperti biasa.` })
         }
      } catch (e) {
         return conn.reply(m.chat, Func.jsonFormat(e), m)
      }
   },
   private: true
}]
