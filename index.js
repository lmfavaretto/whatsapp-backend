const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const cors = require('cors');

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let client;
let qrCode = '';

function startClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', (qr) => {
    qrCode = qr;
    console.log('QR RECEIVED');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('Client is ready!');
  });

  client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    qrCode = '';
    startClient(); // reinicia a sessão
  });

  client.initialize();
}

startClient();

// Keep-alive ping
setInterval(() => {
  console.log('Ping to keep Railway alive');
}, 10000);

// Rota para obter o QR code
app.get('/qr', (req, res) => {
  if (!qrCode) return res.json({ status: 'already_connected' });
  res.json({ qr: qrCode });
});

// Rota para disparar mensagens
app.post('/send', async (req, res) => {
  const { contatos, mensagem, delay } = req.body;

  if (!client.info || !client.info.wid) {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }

  for (let i = 0; i < contatos.length; i++) {
    const { nome, telefone } = contatos[i];
    const texto = mensagem.replace('{nome}', nome);
    const numero = telefone.includes('@c.us') ? telefone : `${telefone}@c.us`;

    try {
      await client.sendMessage(numero, texto);
      console.log(`Mensagem enviada para ${nome}`);
    } catch (err) {
      console.log(`Erro ao enviar para ${nome}:`, err.message);
    }

    if (i < contatos.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay || 8000));
    }
  }

  res.json({ status: 'Mensagens enviadas com sucesso' });
});

// Rota para resetar sessão
app.get('/reset-session', async (req, res) => {
  try {
    await client.destroy();
    const sessionPath = './.wwebjs_auth';

    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    startClient();
    qrCode = '';
    res.json({ status: 'Sessão resetada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao resetar sessão', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
