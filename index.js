const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');

require('dotenv').config(); // Menambahkan ini agar environment variabel bekerja
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const DEFAULT_AI_MODEL = 'openai/gpt-3.5-turbo'; // Model AI default

let qrCodeData = ""; // Simpan QR sementara

// Fungsi utama untuk memulai bot WhatsApp
async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth'); // Gunakan useMultiFileAuthState untuk otentikasi
    const conn = makeWASocket({ auth: state });

    conn.ev.on('creds.update', saveCreds);

    // Menyimpan QR Code untuk frontend
    conn.ev.on('connection.update', (update) => {
      if (update.qr) {
        qrCodeData = update.qr; // Menyimpan QR untuk diambil frontend
        console.log('📌 QR Code ditemukan: ', update.qr); // Debugging
      }
      if (update.connection === 'open') console.log('✅ Bot WhatsApp siap digunakan!');
      if (update.connection === 'close') console.log('❌ Koneksi terputus.');
    });

    conn.ev.on('messages.upsert', async (message) => {
      try {
        if (!message.messages || message.type !== 'notify') return;
        const msg = message.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const userMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!userMessage) return;

        console.log(`📩 Pesan dari ${sender}: ${userMessage}`);

        // Kirim pertanyaan ke AI
        const botReply = await fetchOpenRouter(DEFAULT_AI_MODEL, userMessage);
        await conn.sendMessage(sender, { text: botReply });

      } catch (error) {
        console.error('❌ Error ChatBot:', error.message);
        await conn.sendMessage(message.messages[0].key.remoteJid, { text: 'Maaf, terjadi kesalahan.' });
      }
    });

  } catch (err) {
    console.error('❌ Gagal memulai bot:', err);
  }
}

// Fungsi untuk mendapatkan respon dari OpenRouter
async function fetchOpenRouter(model, query) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [{ role: 'user', content: query }],
        max_tokens: 200,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices?.[0]?.message?.content || 'Tidak ada balasan.';
  } catch (error) {
    console.error('❌ Error OpenRouter:', error.response?.data || error.message);
    return 'Terjadi kesalahan saat menghubungi AI.';
  }
}

startBot();

// Endpoint untuk memberikan QR code ke frontend
module.exports = async (req, res) => {
  if (req.url === '/qr') {
    if (!qrCodeData) {
      return res.status(400).json({ error: 'QR Code belum tersedia.' });
    }
    res.status(200).json({ qr: qrCodeData });
  } else {
    res.status(200).json({ message: 'Bot is running.' });
  }
};
