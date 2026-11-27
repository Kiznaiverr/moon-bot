const http = require('http')
const fs = require('fs')
const path = require('path')

const LANDING_PAGE_PATH = path.join(__dirname, 'public', 'index.html')

function getChatUrl() {
   const envNumber = (process.env.BOT_WHATSAPP_NUMBER || '').replace(/\D/g, '')
   if (envNumber) return `https://wa.me/${envNumber}`
   try {
      const cfg = require('./config.json')
      const num = String(cfg?.pairing?.number || '').replace(/\D/g, '')
      if (num) return `https://wa.me/${num}`
   } catch {}
   return null
}

function formatUptime(seconds) {
   const s = Math.floor(seconds || 0)
   const d = Math.floor(s / 86400)
   const h = Math.floor((s % 86400) / 3600)
   const m = Math.floor((s % 3600) / 60)
   const sec = s % 60
   const parts = []
   if (d) parts.push(`${d}d`)
   if (h) parts.push(`${h}h`)
   if (m) parts.push(`${m}m`)
   parts.push(`${sec}s`)
   return parts.join(' ')
}

function startServer(getState) {
   const PORT = Number(process.env.PORT) || 8080
   const HOST = process.env.HOST || '0.0.0.0'
   const HEARTBEAT_TIMEOUT_MS = Number(process.env.HEALTH_HEARTBEAT_TIMEOUT_MS) || 45_000
   const DISCONNECT_GRACE_MS = Number(process.env.HEALTH_DISCONNECT_GRACE_MS) || 30_000

   const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0]

      if (req.method !== 'GET' && req.method !== 'HEAD') {
         res.writeHead(405, { 'Content-Type': 'application/json' })
         res.end(JSON.stringify({ status: 'error', error: 'Method Not Allowed' }))
         return
      }

      if (urlPath === '/') {
         fs.readFile(LANDING_PAGE_PATH, (err, html) => {
            if (err) {
               res.writeHead(500, { 'Content-Type': 'application/json' })
               res.end(JSON.stringify({ status: 'error', error: 'Landing page unavailable' }))
               return
            }
            res.writeHead(200, {
               'Content-Type': 'text/html; charset=utf-8',
               'Cache-Control': 'no-store'
            })
            res.end(req.method === 'HEAD' ? undefined : html)
         })
         return
      }

      if (urlPath === '/health' || urlPath === '/healthz') {
         const state = typeof getState === 'function' ? getState() : {}
         const now = Date.now()
         const isChildRunning = state.processStatus === 'running'
         const heartbeatAgeMs = state.lastHeartbeat ? now - state.lastHeartbeat : null
         const isHeartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs < HEARTBEAT_TIMEOUT_MS
         const isReady = Boolean(state.ready)
         const isWaConnected = state.waStatus === 'connected'
         const disconnectedForMs =
            !isWaConnected && state.disconnectedAt ? Math.max(0, now - state.disconnectedAt) : 0
         const inGracePeriod =
            isReady && !isWaConnected && state.disconnectedAt !== null && disconnectedForMs < DISCONNECT_GRACE_MS

         const healthy = isChildRunning && isHeartbeatFresh && isReady && (isWaConnected || inGracePeriod)
         const statusLabel = !healthy ? 'unhealthy' : inGracePeriod ? 'degraded' : 'ok'
         const statusCode = healthy ? 200 : 503

         const payload = {
            status: statusLabel,
            healthy,
            chatUrl: getChatUrl(),
            bot: {
               process: state.processStatus || 'unknown',
               ready: isReady,
               whatsapp: state.waStatus || 'unknown',
               inGracePeriod,
               uptime: formatUptime(state.botUptimeSeconds || 0),
               uptimeSeconds: Math.floor(state.botUptimeSeconds || 0),
               restarts: state.restarts || 0
            },
            timestamp: new Date(now).toISOString()
         }

         res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
         })
         res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload))
         return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'error', error: 'Not Found' }))
   })

   server.on('error', err => {
      console.error(`[server] Failed on port ${PORT}:`, err.message)
   })

   server.listen(PORT, HOST, () => {
      console.log(`Server is running -- ${HOST}:${PORT}`)
   })

   return server
}

if (require.main === module) {
   startServer()
}

module.exports = { startServer }