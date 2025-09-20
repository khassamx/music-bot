const media = require("./plugins/media");

module.exports = async (sock, msg, text) => {
    if (!text) return;
    const chatId = msg.key.remoteJid;

    if (text.startsWith(".audio")) {
        const query = text.replace(".audio ", "").trim();
        if (!query) {
            await sock.sendMessage(chatId, {
                text: "❌ Escribe un título o link para usar `.audio`"
            });
            return;
        }
        await media.audio(sock, chatId, query);
    }

    if (text.startsWith(".video")) {
        const query = text.replace(".video ", "").trim();
        if (!query) {
            await sock.sendMessage(chatId, {
                text: "❌ Escribe un título o link para usar `.video`"
            });
            return;
        }
        await media.video(sock, chatId, query);
    }
};
