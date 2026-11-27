require('dotenv').config()
require('rootpath')()
console.clear()
const { spawn } = require('child_process'), path = require('path'), CFonts = require('cfonts')

const botState = {
   processStatus: 'starting',
   ready: false,
   waStatus: 'connecting',
   disconnectedAt: null,
   pid: null,
   botUptimeSeconds: 0,
   restarts: 0,
   lastHeartbeat: null,
   memoryRss: null,
   lastError: null
}

let httpServer = null
if (process.argv.includes('--server')) {
   const { startServer } = require('./server')
   httpServer = startServer(() => ({ ...botState }))
}

process.on('uncaughtException', error => {
   console.error('Uncaught Exception:', error.stack || error)
})
process.on('unhandledRejection', (reason, promise) => {
   console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

let childProcess = null
let restartTimer = null
let shuttingDown = false

function shutdown(signal) {
   if (shuttingDown) return
   shuttingDown = true
   botState.processStatus = 'stopping'
   if (restartTimer) clearTimeout(restartTimer)
   console.log(`Received ${signal}, shutting down...`)

   const closeHttp = httpServer
      ? new Promise(resolve => httpServer.close(() => resolve()))
      : Promise.resolve()

   if (childProcess && !childProcess.killed) {
      childProcess.kill('SIGTERM')
   }

   closeHttp.finally(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

function start() {
   if (shuttingDown) return
   let args = [path.join(__dirname, 'main.js'), ...process.argv.slice(2)]
   let p = spawn(process.argv[0], args, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
   })
   childProcess = p

   botState.processStatus = 'running'
   botState.ready = false
   botState.waStatus = 'connecting'
   botState.disconnectedAt = null
   botState.pid = p.pid || null
   botState.lastHeartbeat = Date.now()

   p.on('message', data => {
      try {
         if (data === 'reset') {
            console.log('Restarting...')
            botState.processStatus = 'restarting'
            p.kill()
         } else if (data && typeof data === 'object' && data.type === 'status') {
            botState.lastHeartbeat = Date.now()
            if ('ready' in data) botState.ready = Boolean(data.ready)
            if ('waStatus' in data) {
               if (data.waStatus === 'connected') {
                  botState.waStatus = 'connected'
                  botState.disconnectedAt = null
               } else if (data.waStatus === 'disconnected') {
                  if (botState.waStatus !== 'disconnected') {
                     botState.disconnectedAt = Date.now()
                  }
                  botState.waStatus = 'disconnected'
               } else {
                  botState.waStatus = data.waStatus
               }
            }
            if ('uptimeSeconds' in data) botState.botUptimeSeconds = data.uptimeSeconds
            if ('memoryRss' in data) botState.memoryRss = data.memoryRss
            if ('lastError' in data) botState.lastError = data.lastError
         }
      } catch (err) {
         console.error('Error handling message:', err)
      }
   }).on('exit', code => {
      if (childProcess === p) childProcess = null
      botState.pid = null
      botState.ready = false
      botState.waStatus = 'disconnected'
      botState.disconnectedAt = botState.disconnectedAt || Date.now()

      if (shuttingDown) {
         botState.processStatus = 'stopped'
         return
      }

      console.error('Exited with code:', code)
      if (code !== 0) {
         botState.processStatus = 'restarting'
         botState.restarts += 1
         botState.lastError = `Process exited with code ${code}`
         console.log('Restarting process due to non-zero exit code...')
         restartTimer = setTimeout(start, 2000)
      } else {
         botState.processStatus = 'stopped'
      }
   }).on('error', err => {
      console.error('Spawn error:', err)
      botState.lastError = err.message
   })
}

console.clear()
const major = parseInt(process.versions.node.split('.')[0], 10)
if (major < 22) {
   console.error(
      `\n❌ This script requires Node.js 22 to run reliably.\n` +
      `   You are using Node.js ${process.versions.node}.\n` +
      `   Please upgrade to Node.js 22 or higher to proceed.\n`
   )
   process.exit(1)
}

CFonts.say('MOON BOT', {
   font: 'tiny',
   align: 'center',
   colors: ['system']
}), CFonts.say('Github : https://github.com/znanx/moon-bot', {
   colors: ['system'],
   font: 'console',
   align: 'center'
}), start()
