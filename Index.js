/* Michi WaBot - Creado por Noa Archivo: Michi-WaBot.js Requisitos: Node.js 18+, ffmpeg instalado en el sistema Dependencias: @adiwajshing/baileys, qrcode-terminal, ytdl-core, node-fetch, fs-extra Instalar: npm i @adiwajshing/baileys qrcode-terminal ytdl-core node-fetch fs-extra

Funcionalidades incluidas:

Inicio con QR (sesión guardada en auth_info_multi.json)

comando setsms: guardar número para envíos (por usuario)

subbot: suscribirse/darse de baja de listas de difusión (subscribe/unsubscribe)

ytv: descargar y enviar vídeo de YouTube

playaudio: enviar audio (YouTube -> audio) o archivo local

kick: expulsar participante de un grupo (si el bot es admin)

antilink: activar/desactivar antilink por grupo (kick o advertir)


Uso: node Michi-WaBot.js */

const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, makeCacheableSignalKeyStore } = require('@adiwajshing/baileys') const { state, saveState } = useSingleFileAuthState('./auth_info_multi.json') const qrcode = require('qrcode-terminal') const fs = require('fs-extra') const ytdl = require('ytdl-core') const path = require('path') const os = require('os') const fetch = require('node-fetch')

const CONFIG_FILE = './michi_config.json' let config = { sms: {}, subscribers: [], groups: {} } if (fs.existsSync(CONFIG_FILE)) config = fs.readJsonSync(CONFIG_FILE)

async function saveConfig(){ await fs.writeJson(CONFIG_FILE, config, { spaces: 2 }) }

async function start() { const { version, isLatest } = await fetchLatestBaileysVersion() console.log('Baileys version:', version, 'isLatest:', isLatest)

const sock = makeWASocket({ printQRInTerminal: false, // we print via qrcode lib on event auth: state, version })

// show QR when connection updates with QR sock.ev.on('connection.update', (update) => { const { connection, lastDisconnect, qr } = update if (qr) qrcode.generate(qr, { small: true }) if (connection === 'close') { const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut console.log('connection closed due to', lastDisconnect?.error, 'reconnect?', shouldReconnect) if (shouldReconnect) start() } if (connection === 'open') console.log('✅ Conectado como Michi WaBot (Creado por Noa)') })

// save auth state periodically sock.ev.on('creds.update', saveState)

// handle incoming messages sock.ev.on('messages.upsert', async ({ messages, type }) => { try{ const msg = messages[0] if (!msg.message || msg.key && msg.key.remoteJid === 'status@broadcast') return const from = msg.key.remoteJid const isGroup = from.endsWith('@g.us') const sender = jidNormalizedUser(msg.key.participant || msg.key.remoteJid) const text = (msg.message.conversation || msg.message?.extendedTextMessage?.text || '').trim() if (!text) return

// antilink check (group)
  if (isGroup){
    const gcfg = config.groups[from] || { antilink: false, antilinkKick: false }
    if (gcfg.antilink){
      const hasLink = /https?:\/\/|wa\.me\//i.test(text)
      if (hasLink){
        // if sender is admin skip
        const groupMetadata = await sock.groupMetadata(from).catch(()=>null)
        const participants = groupMetadata?.participants || []
        const p = participants.find(p=>jidNormalizedUser(p.id) === sender)
        if (!p?.admin){
          if (gcfg.antilinkKick){
            await sock.groupParticipantsUpdate(from, [sender], 'remove')
            await sock.sendMessage(from, { text: `🔨 ${sender} expulsado por enviar enlaces (antilink activado).` })
            return
          } else {
            await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} no se permiten enlaces en este grupo.`, mentions: [sender] })
            return
          }
        }
      }
    }
  }

  // commands prefixes
  const prefixes = ['!', '.', '/', '#']
  if (!prefixes.some(p => text.startsWith(p))) return
  const prefixUsed = prefixes.find(p => text.startsWith(p))
  const args = text.slice(prefixUsed.length).trim().split(/ +/)
  const cmd = args.shift().toLowerCase()

  // COMMAND: setsms -> .setsms +595xxxxxxxx
  if (cmd === 'setsms'){
    const number = args[0]
    if (!number) return sock.sendMessage(from, { text: 'Uso: setsms +59512345678' })
    config.sms[sender] = number
    await saveConfig()
    return sock.sendMessage(from, { text: `✅ Número SMS guardado para ${sender}: ${number}` })
  }

  // COMMAND: subbot -> .subbot subscribe|unsubscribe
  if (cmd === 'subbot'){
    const action = (args[0] || '').toLowerCase()
    if (action === 'subscribe' || action === 'sub'){
      if (!config.subscribers.includes(sender)) config.subscribers.push(sender)
      await saveConfig()
      return sock.sendMessage(from, { text: '✅ Te suscribiste a MichiWaBot.' })
    } else if (action === 'unsubscribe' || action === 'unsub'){
      config.subscribers = config.subscribers.filter(s=>s!==sender)
      await saveConfig()
      return sock.sendMessage(from, { text: '✅ Te diste de baja de MichiWaBot.' })
    } else {
      return sock.sendMessage(from, { text: 'Uso: subbot subscribe|unsubscribe' })
    }
  }

  // COMMAND: ytv -> .ytv <youtube-url>
  if (cmd === 'ytv'){
    const url = args[0]
    if (!url || !ytdl.validateURL(url)) return sock.sendMessage(from, { text: 'Uso: ytv <url de YouTube>' })
    const info = await ytdl.getInfo(url)
    const title = info.videoDetails.title.replace(/[^a-zA-Z0-9 \-_.]/g,'').slice(0,40)
    const tmpFile = path.join(os.tmpdir(), `${title}.mp4`)
    const stream = ytdl(url, { filter: 'audioandvideo', quality: 'highestvideo' })
    const fileStream = fs.createWriteStream(tmpFile)
    stream.pipe(fileStream)
    await new Promise((res, rej)=>{
      fileStream.on('finish', res)
      stream.on('error', rej)
    })
    await sock.sendMessage(from, { video: fs.createReadStream(tmpFile), caption: `🎬 ${info.videoDetails.title}` })
    await fs.remove(tmpFile)
    return
  }

  // COMMAND: playaudio -> .playaudio <youtube-url|path>
  if (cmd === 'playaudio'){
    const target = args[0]
    if (!target) return sock.sendMessage(from, { text: 'Uso: playaudio <url de YouTube> o playaudio local.mp3' })
    if (ytdl.validateURL(target)){
      const tmpFile = path.join(os.tmpdir(), `${Date.now()}.mp3`)
      const stream = ytdl(target, { filter: 'audioonly', quality: 'highestaudio' })
      const fileStream = fs.createWriteStream(tmpFile)
      stream.pipe(fileStream)
      await new Promise((res, rej)=>{ fileStream.on('finish', res); stream.on('error', rej) })
      await sock.sendMessage(from, { audio: fs.createReadStream(tmpFile), mimetype: 'audio/mpeg' })
      await fs.remove(tmpFile)
      return
    } else if (fs.existsSync(target)){
      await sock.sendMessage(from, { audio: fs.createReadStream(target), mimetype: 'audio/mpeg' })
      return
    } else {
      return sock.sendMessage(from, { text: 'No es una URL válida ni archivo local existe.' })
    }
  }

  // COMMAND: kick -> .kick @user
  if (cmd === 'kick'){
    if (!isGroup) return sock.sendMessage(from, { text: 'Este comando solo funciona en grupos.' })
    if (!msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) return sock.sendMessage(from, { text: 'Menciona a las personas a expulsar: kick @user' })
    const targets = msg.message.extendedTextMessage.contextInfo.mentionedJid
    try{
      await sock.groupParticipantsUpdate(from, targets, 'remove')
      return sock.sendMessage(from, { text: `✅ Expulsados: ${targets.map(t=>jidNormalizedUser(t).split('@')[0]).join(', ')}` })
    } catch(e){
      console.error(e)
      return sock.sendMessage(from, { text: 'Error al expulsar. ¿El bot es admin?' })
    }
  }

  // COMMAND: antilink -> .antilink on|off [kick]
  if (cmd === 'antilink'){
    if (!isGroup) return sock.sendMessage(from, { text: 'Este comando solo funciona en grupos.' })
    const mode = (args[0] || 'off').toLowerCase()
    const kick = args.includes('kick')
    if (!config.groups[from]) config.groups[from] = { antilink: false, antilinkKick: false }
    config.groups[from].antilink = (mode === 'on')
    config.groups[from].antilinkKick = kick
    await saveConfig()
    return sock.sendMessage(from, { text: `✅ Antilink ${mode === 'on' ? 'activado' : 'desactivado'}${kick ? ' (kick activado)' : ''}` })
  }

  // comando de ayuda
  if (cmd === 'help' || cmd === 'menu'){
    const help = `Michi WaBot - Creado por Noa\nComandos:\n.setsms +595... -> guardar tu número SMS\n.subbot subscribe|unsubscribe -> suscribirte a la lista\n.ytv <url> -> enviar video de YouTube\n.playaudio <url|archivo> -> enviar audio\n.kick @user -> expulsar (grupo)\n.antilink on|off [kick] -> activar antienlace en el grupo\n` 
    return sock.sendMessage(from, { text: help })
  }

} catch(err){
  console.error('Error manejando mensaje', err)
}

})

}

start().catch(err=>console.error('Falla al iniciar Michi-WaBot:', err))

