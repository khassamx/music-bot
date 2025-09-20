const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const pino = require("pino"); // Un logger más avanzado
const moment = require("moment");
const fs = require("fs");

// Carpeta para guardar la información de la sesión
const SESSION_FOLDER = "auth_info_baileys";
// Carpeta para guardar los logs
const LOGS_FOLDER = "logs";

async function startBot() {
    // Obtiene la última versión de Baileys
    const { version } = await fetchLatestBaileysVersion();
    console.log(`✅ Usando la versión de Baileys: ${version.join(".")}`);

    // Carga o crea las credenciales de la sesión
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }), // Silencia el logger interno de Baileys
        auth: state,
        browser: ["Tu Bot Mejorado", "Chrome", "1.0"] // Un nombre personalizado para tu bot
    });

    // Evento que se ejecuta al actualizar las credenciales (sesión)
    sock.ev.on("creds.update", saveCreds);

    // Evento que se ejecuta al cambiar el estado de la conexión
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("📲 Escanea este QR con tu teléfono:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ Conectado a WhatsApp Web correctamente.");
        } else if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("❌ Sesión cerrada, borra la carpeta 'auth_info_baileys' para volver a iniciar.");
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
            } else {
                console.log("⚠️ Conexión cerrada. Reintentando en 5 segundos...");
                setTimeout(() => startBot(), 5000);
            }
        }
    });

    // Evento que se ejecuta al recibir un mensaje
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        // Extrae el mensaje de texto
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const time = moment().format("YYYY-MM-DD HH:mm:ss");

        // Crea la carpeta de logs si no existe
        if (!fs.existsSync(LOGS_FOLDER)) {
            fs.mkdirSync(LOGS_FOLDER);
        }
        
        // Guarda el log en un archivo
        const logFile = `${LOGS_FOLDER}/whatsapp.log`;
        const logLine = `[${time}] ${from} -> ${text}\n`;
        fs.appendFileSync(logFile, logLine);
        
        // Aquí puedes agregar la lógica de tu bot
        // Ejemplo de respuesta simple:
        if (text.toLowerCase().includes("hola")) {
            await sock.sendMessage(from, { text: "¡Hola! ¿En qué puedo ayudarte?" });
        }
    });

    return sock;
}

// Inicia el bot
startBot();