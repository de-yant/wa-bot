const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

let qrCodeUrl = "";

// Fungsi untuk memulai bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const conn = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  conn.ev.on("creds.update", saveCreds);

  conn.ev.on("connection.update", async (update) => {
    if (update.qr) {
      console.log("🔄 Generating QR Code...");
      qrCodeUrl = await qrcode.toDataURL(update.qr);
      fs.writeFileSync("public/qr.txt", qrCodeUrl);
    }

    if (update.connection === "close") {
      console.log("❌ Connection closed, retrying...");
      startBot();
    } else if (update.connection === "open") {
      console.log("✅ Bot is online!");
    }
  });

  conn.ev.on("messages.upsert", async (message) => {
    if (!message.messages || message.type !== "notify") return;
    const msg = message.messages[0];

    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const userMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!userMessage) return;

    console.log(`📩 Message from ${sender}: ${userMessage}`);

    // Dapatkan balasan dari OpenRouter API
    const botReply = await fetchOpenRouter(userMessage);
    await conn.sendMessage(sender, { text: botReply });
  });
}

// Fungsi untuk mengambil balasan dari OpenRouter
async function fetchOpenRouter(query) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: query }],
        max_tokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices?.[0]?.message?.content || "Maaf, saya tidak dapat menjawab.";
  } catch (error) {
    console.error("❌ OpenRouter API Error:", error.response?.data || error.message);
    return "Terjadi kesalahan saat menghubungi AI.";
  }
}

// **API Endpoint untuk Menampilkan QR**
app.get("/qr", (req, res) => {
  res.sendFile(__dirname + "/public/qr.txt");
});

// **API Endpoint untuk Mengecek Status**
app.get("/", (req, res) => {
  res.send("✅ Bot WhatsApp is running!");
});

// Mulai server Express
app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));

// Jalankan bot
startBot();
