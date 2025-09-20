const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys")
const Pino = require("pino")
const fs = require("fs")
const moment = require("moment")
const qrcode = require("qrcode-terminal")

// Números que vas a manejar en el bot
const numbers = ["595981234567", "595981234568"] // <-- reemplazá con tus números

async function startSession(number) {
    const sessionFolder = `auth_info_${number}`
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        logger: Pino({ level: "silent" }),
        auth: state
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log(`\n📲 [${number}] Escaneá este QR:`)
            qrcode.generate(qr, { small: true })
        }

        if (connection === "open") {
            console.log(`✅ [${number}] Conectado a WhatsApp Web correctamente.`)
        } else if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode
            if (reason === DisconnectReason.loggedOut) {
                console.log(`❌ [${number}] Sesión cerrada, borra ${sessionFolder} para reiniciar.`)
            } else {
                console.log(`⚠️ [${number}] Conexión cerrada. Reconectando en 5 segundos...`)
                await delay(5000)
                startSession(number) // Reconexión automática
            }
        }
    })

    sock.ev.on("messages.upsert", ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        const from = msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text
        const time = moment().format("YYYY-MM-DD HH:mm:ss")

        // Guardar logs por número
        const logFolder = "./logs"
        if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder)
        const logFile = `${logFolder}/${number}.log`
        const logLine = `[${time}] ${from} -> ${text}\n`
        fs.appendFileSync(logFile, logLine)

        // Ejemplo de alerta de mensaje importante
        if (text.toLowerCase().includes("importante")) {
            console.log(`⚡ [ALERTA][${number}] Mensaje importante de ${from}: ${text}`)
        }
    })
}

// Iniciar sesiones para todos los números
numbers.forEach(number => startSession(number))
