const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const Pino = require("pino")
const fs = require("fs")
const moment = require("moment")
const readline = require("readline")

async function connectBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question("¿Cómo querés iniciar sesión? (qr / code): ", async (method) => {
    rl.close()

    const sock = makeWASocket({
      version,
      logger: Pino({ level: "silent" }),
      auth: state,
      printQRInTerminal: method === "qr"
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update

      if (connection === "open") {
        console.log("✅ Conectado correctamente.")

      } else if (connection === "close") {
        const reason = update.lastDisconnect?.error?.output?.statusCode
        if (reason === DisconnectReason.loggedOut) {
          console.log("❌ Sesión cerrada, borra auth_info y volvé a intentar.")
        }
      }

      if (method === "code" && !sock.authState.creds.registered && connection === "connecting") {
        try {
          const code = await sock.requestPairingCode("595981234567")
          console.log("👉 Tu código de 8 dígitos es:", code)
          console.log("Usalo en WhatsApp: Dispositivos vinculados > Vincular con código")
        } catch (err) {
          console.error("⚠️ Error al generar código:", err.message)
        }
      }
    })

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text
      const time = moment().format("YYYY-MM-DD HH:mm:ss")

      const logLine = `[${time}] ${from} -> ${text}\n`
      fs.appendFileSync("./logs/whatsapp.log", logLine)

      require("./handler")(sock, msg, text)
    })
  })
}

connectBot()
