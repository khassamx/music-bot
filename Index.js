const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');
const {
    Boom
} = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

async function connectToWhatsApp() {
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state
    });

    sock.ev.on('connection.update', (update) => {
        const {
            connection,
            lastDisconnect,
            qr
        } = update;

        if (connection === 'close') {
            const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reintentando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexión abierta con éxito.');
        }

        if (qr) {
            qrcode.generate(qr, {
                small: true
            });
            console.log('Escanea el QR para iniciar sesión.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

connectToWhatsApp();