const yts = require("yt-search");
const ytdl = require("ytdl-core");
const fs = require("fs");

async function audio(sock, chatId, query) {
    try {
        const r = await yts(query);
        if (!r.videos.length) {
            await sock.sendMessage(chatId, {
                text: "❌ No encontré resultados."
            });
            return;
        }

        const video = r.videos[0];
        const path = "./temp.mp3";

        const stream = ytdl(video.url, {
            filter: "audioonly"
        });
        await new Promise((resolve, reject) => {
            stream.pipe(fs.createWriteStream(path));
            stream.on("end", resolve);
            stream.on("error", reject);
        });

        await sock.sendMessage(chatId, {
            audio: {
                url: path
            },
            mimetype: "audio/mp4",
            ptt: false
        });

        fs.unlinkSync(path);
    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, {
            text: "⚠️ Error al descargar el audio."
        });
    }
}

async function video(sock, chatId, query) {
    try {
        const r = await yts(query);
        if (!r.videos.length) {
            await sock.sendMessage(chatId, {
                text: "❌ No encontré resultados."
            });
            return;
        }

        const video = r.videos[0];
        const path = "./temp.mp4";

        const stream = ytdl(video.url, {
            filter: "audioandvideo"
        });
        await new Promise((resolve, reject) => {
            stream.pipe(fs.createWriteStream(path));
            stream.on("end", resolve);
            stream.on("error", reject);
        });

        await sock.sendMessage(chatId, {
            video: {
                url: path
            },
            caption: `🎬 ${video.title}\n⏱️ ${video.timestamp}`
        });

        fs.unlinkSync(path);
    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, {
            text: "⚠️ Error al descargar el video."
        });
    }
}

module.exports = {
    audio,
    video
};
