const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const Pino = require("pino");
const fs = require("fs");
const moment = require("moment");
const readline = require("readline");

async function connectBot() {
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState("auth_info");
    const {
        version
    } = await fetchLatestBaileysVersion();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("¿Cómo querés iniciar sesión? (qr / code): ", async (method) => {
        rl.close();

        const sock = makeWASocket({
            version,
            logger: Pino({
                level: "silent"
            }),
            auth: state,
            printQRInTerminal: method === "qr"
        });

        if (method === "code" && !sock.authState.creds.registered) {
            const code = await sock.requestPairingCode("595981234567");
            console.log("👉 Tu código de 8 dígitos es:", code);
            console.log("Usalo en WhatsApp: Dispositivos vinculados > Vincular con código");
        }

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("messages.upsert", async ({
            messages
        }) => {
            const msg = messages[0];
            if (!msg.message) return;

            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const time = moment().format("YYYY-MM-DD HH:mm:ss");

            const logLine = `[${time}] ${from} -> ${text}\n`;
            fs.appendFileSync("./logs/whatsapp.log", logLine);

            require("./handler")(sock, msg, text);
        });
    });
}

connectBot();
