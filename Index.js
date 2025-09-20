const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const Pino = require("pino");
const moment = require("moment");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: Pino({ level: "silent" }),
        auth: state,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("📲 Escaneá este QR con tu WhatsApp:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ Conectado a WhatsApp Web correctamente.");
        } else if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("❌ Sesión cerrada, borra auth_info para volver a iniciar.");
            } else {
                console.log("⚠️ Conexión cerrada. Reintentando...");
                setTimeout(() => startBot(), 5000);
            }
        }
    });

    sock.ev.on("messages.upsert", ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const time = moment().format("YYYY-MM-DD HH:mm:ss");

        const logFolder = "./logs";
        if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder);
        const logFile = `${logFolder}/whatsapp.log`;
        const logLine = `[${time}] ${from} -> ${text}\n`;
        fs.appendFileSync(logFile, logLine);

        // Aquí iría el handler para los comandos
    });

    return sock;
}

startBot();