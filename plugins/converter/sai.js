const { Image } = require('node-webpmux')

module.exports = {
   help: ['sai'],
   use: 'query / reply media',
   tags: 'converter',
   run: async (m, {
      conn,
      text,
      setting,
      Func
   }) => {
      try {
         if (!m.quoted) throw Func.texted('bold', '🚩 Reply sticker.')
         var stiker = false
         let [packname, ...author] = text.split('|')
         author = (author || []).join('|')
         const q = m.quoted ? m.quoted : m
         const mime = (q.msg || q).mimetype || ''
         if (!/webp/.test(mime)) throw Func.texted('bold', '🚩 Reply to the sticker you want to make into an AI sticker.')
         const img = await q.download()
         if (!img) throw global.status.wrong
         stiker = await addExif(img, packname || setting.sk_pack, author || setting.sk_author)
      } catch (e) {
         console.error(e)
         if (Buffer.isBuffer(e)) stiker = e
      } finally {
         if (stiker) {
            await conn.sendMessage(m.chat, {
               sticker: stiker,
               isAiSticker: true
            }, {
               quoted: m
            })
         } else {
            throw Func.texted('bold', '🚩 Conversion failed.')
         }
      }
   },
   premium: true,
   error: false
}

async function addExif(buffer, packname, author, categories = [''], extra = {}) {
   const img = new Image()
   const json = {
      'sticker-pack-id': global.creator || 'kiznavierr',
      'sticker-pack-name': packname || 'Sticker By',
      'sticker-pack-publisher': author || 'kirara-bot',
      emojis: categories,
      'is-ai-sticker': 1,
      ...extra
   }
   const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
   const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
   const exif = Buffer.concat([exifAttr, jsonBuffer])
   exif.writeUIntLE(jsonBuffer.length, 14, 4)
   await img.load(buffer)
   img.exif = exif
   return await img.save(null)
}
