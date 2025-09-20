const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const figlet = require('figlet');
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');
const ytdl = require('ytdl-core');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

// --- Configuración de FFmpeg ---
ffmpeg.setFfmpegPath(ffmpegPath);

// --- Configuraciones ---
const SESSION_PATH = path.join(__dirname, 'session');
const LOGS_PATH = path.join(__dirname, 'logs');
const BROWSER_INFO = ["Music-Bot", "Chrome", "1.0"];
const RECONNECT_DELAY = 5000; // 5 segundos

// --- Funciones de Utilidad ---
function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);

    if (!fs.existsSync(LOGS_PATH)) {
        fs.mkdirSync(LOGS_PATH);
    }
    const logFile = path.join(LOGS_PATH, 'bot.log');
    fs.appendFileSync(logFile, logMessage + '\n');
}

function showBanner() {
    console.log(chalk.red(figlet.textSync('MusicBot', { horizontalLayout: 'full' })));
    console.log(chalk.bold.green('¡Music-Bot está iniciando! ¡Listo para la fiesta!'));
    console.log(chalk.bold.blue('--------------------------------------------------'));
}

// --- Lógica del Bot ---
async function handlePlayCommand(sock, message, query) {
    if (!query) {
        await sock.sendMessage(message.key.remoteJid, { text: 'Por favor, dime qué canción quieres reproducir. Ejemplo: !play Despacito' });
        return;
    }
    
    log(`Buscando y descargando: "${query}"...`, 'info');
    await sock.sendMessage(message.key.remoteJid, { text: `Buscando y descargando la canción: *${query}*` });
    
    try {
        const videoInfo = await ytdl.getInfo(query, {
            filter: 'audioonly'
        });

        const audioStream = ytdl(videoInfo.videoDetails.videoId, {
            quality: 'highestaudio',
            filter: 'audioonly'
        });

        const outputFilePath = path.join(__dirname, 'temp', `${videoInfo.videoDetails.title}.mp3`);
        
        // Crea la carpeta temporal si no existe
        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
            fs.mkdirSync(path.join(__dirname, 'temp'));
        }

        // Convierte el stream a un archivo MP3
        ffmpeg(audioStream)
            .audioBitrate(128)
            .save(outputFilePath)
            .on('end', async () => {
                log(`Descarga y conversión completada: ${outputFilePath}`, 'success');
                await sock.sendMessage(message.key.remoteJid, {
                    audio: fs.readFileSync(outputFilePath),
                    mimetype: 'audio/mp4'
                }, {
                    url: outputFilePath
                });
                
                // Borra el archivo temporal
                fs.unlinkSync(outputFilePath);
            })
            .on('error', (err) => {
                log(`Error al convertir el audio: ${err.message}`, 'error');
                sock.sendMessage(message.key.remoteJid, { text: '¡Ups! Ocurrió un error al procesar tu canción.' });
            });

    } catch (error) {
        log(`Error al buscar la canción: ${error.message}`, 'error');
        await sock.sendMessage(message.key.remoteJid, { text: 'No pude encontrar esa canción. Asegúrate de que el enlace de YouTube sea válido.' });
    }
}

// --- Inicio del Bot ---
async function startBot() {
    showBanner();

    try {
        const { version } = await fetchLatestBaileysVersion();
        log(`Usando la versión de Baileys: ${version.join('.')}`);

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

        const sock = makeWASocket({
            version,
            auth: state,
            browser: BROWERS_INFO,
            logger: pino({ level: 'silent' })
        });
        
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                log('📲 Escanea este código QR con tu teléfono:', 'info');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                log('✅ ¡Conectado a WhatsApp Web!', 'success');
            } else if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    log('❌ Sesión cerrada. Borra la carpeta de sesión para volver a iniciar.', 'error');
                    fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                } else {
                    log(`⚠️ Conexión cerrada (${reason}). Reintentando en ${RECONNECT_DELAY / 1000}s...`, 'warning');
                    setTimeout(() => startBot(), RECONNECT_DELAY);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;

            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            log(`Mensaje de ${from}: ${text}`, 'message');

            if (text.startsWith('!play')) {
                const query = text.replace('!play', '').trim();
                await handlePlayCommand(sock, msg, query);
            }
        });

    } catch (error) {
        log(`Error al iniciar el bot: ${error.message}`, 'error');
    }
}

startBot();