const express = require('express');
const bodyParser = require('body-parser');
const EfiPay = require('sdk-node-apis-efi');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configurações da Efi Bank (devem vir de variáveis de ambiente no Render)
const options = {
  sandbox: process.env.EFI_SANDBOX === 'true',
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: Buffer.from(process.env.EFI_CERTIFICATE_BASE64 || '', 'base64'),
  cert_base64: true,
  validateMtls: false // Importante para o Render.com (skip-mTLS)
};

const efipay = new EfiPay(options);

// Caminho para o arquivo de persistência
const DATA_FILE = path.join(__dirname, 'data.json');

// Estado das máquinas (armazenando os pulsos pendentes)
// e mapeamento de txid para maquinaId
let appState = {
  pulsosPendentes: {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0
  },
  txidToMaquinaId: {} // Mapeia txid gerado pela Efi para maquinaId
};

// Função para carregar o estado do arquivo
function loadState() {
  if (fs.existsSync(DATA_FILE)) {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    appState = JSON.parse(data);
    console.log('Estado carregado do arquivo:', appState);
  } else {
    console.log('Arquivo de estado não encontrado. Iniciando com estado padrão.');
  }
}

// Função para salvar o estado no arquivo
function saveState() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(appState, null, 2), 'utf8');
  console.log('Estado salvo no arquivo.');
}

// Carregar o estado ao iniciar o servidor
loadState();

// Rota para o ESP32 consultar se há pulsos pendentes para uma máquina específica
app.get('/api/maquina/:id/pulsos', (req, res) => {
  const maquinaId = req.params.id;
  
  if (appState.pulsosPendentes[maquinaId] === undefined) {
    return res.status(404).json({ error: 'Máquina não encontrada' });
  }

  const pulsos = appState.pulsosPendentes[maquinaId];
  
  // Se o ESP32 consultou e tinha pulsos, zeramos o contador (assumindo que ele vai processar)
  if (pulsos > 0) {
    appState.pulsosPendentes[maquinaId] = 0;
    saveState(); // Salvar o estado após zerar os pulsos
  }

  res.json({ maquina: maquinaId, pulsos: pulsos });
});

// Rota para gerar a cobrança Pix (QR Code) para uma máquina específica
app.post('/api/gerar-pix', async (req, res) => {
  const { maquinaId, valor } = req.body; // valor em reais, ex: 5.00

  if (!maquinaId || !valor) {
    return res.status(400).json({ error: 'maquinaId e valor são obrigatórios' });
  }

  const body = {
    calendario: {
      expiracao: 3600
    },
    valor: {
      original: parseFloat(valor).toFixed(2)
    },
    chave: process.env.EFI_CHAVE_PIX,
    infoAdicionais: [
      {
        nome: 'Maquina',
        valor: String(maquinaId)
      }
    ]
  };

  try {
    const response = await efipay.pixCreateImmediateCharge([], body);
    
    // Armazenar o mapeamento txid -> maquinaId
    appState.txidToMaquinaId[response.txid] = maquinaId;
    saveState(); // Salvar o estado após adicionar o mapeamento

    // Gerar o QR Code a partir do loc.id
    const qrCodeResponse = await efipay.pixGenerateQRCode({ locId: response.loc.id });
    
    res.json({
      txid: response.txid,
      qrCode: qrCodeResponse.qrcode,
      imagemQrCode: qrCodeResponse.imagemQrcode
    });
  } catch (error) {
    console.error('Erro ao gerar Pix:', error);
    res.status(500).json({ error: 'Falha ao gerar cobrança Pix' });
  }
});

// Webhook para receber a notificação de pagamento da Efi Bank
app.post('/webhook(/pix)?', (req, res) => {
  console.log('Webhook recebido:', JSON.stringify(req.body, null, 2));
  
  // A Efi Bank envia um array de pix
  if (req.body.pix && Array.isArray(req.body.pix)) {
    req.body.pix.forEach(pagamento => {
      // Verifica se o pagamento foi concluído
      if (pagamento.valor && pagamento.txid) {
        const valorPago = parseFloat(pagamento.valor);
        const txidRecebido = pagamento.txid;
        
        // Recuperar o maquinaId usando o mapeamento txidToMaquinaId
        const maquinaId = appState.txidToMaquinaId[txidRecebido];

        if (maquinaId && appState.pulsosPendentes[maquinaId] !== undefined) {
          // Converter valor em pulsos (R$ 1,00 = 1 pulso)
          const pulsos = Math.floor(valorPago);
          appState.pulsosPendentes[maquinaId] += pulsos;
          console.log(`Adicionado ${pulsos} pulsos para a máquina ${maquinaId}. Total: ${appState.pulsosPendentes[maquinaId]}`);
          saveState(); // Salvar o estado após adicionar os pulsos

          // Opcional: Remover o txid do mapeamento após o pagamento ser processado
          delete appState.txidToMaquinaId[txidRecebido];
          saveState(); // Salvar o estado após remover o txid
        } else {
          console.warn(`TXID ${txidRecebido} não encontrado ou maquinaId inválido no mapeamento.`);
        }
      }
    });
  }

  // A Efi Bank exige que o webhook retorne 200 OK
  res.status(200).send();
});

// Rota para configurar o Webhook na Efi Bank (rodar uma vez)
app.post('/api/configurar-webhook', async (req, res) => {
  const { webhookUrl } = req.body; // A URL do seu app no Render, ex: https://seu-app.onrender.com/webhook
  
  const params = {
    chave: process.env.EFI_CHAVE_PIX
  };

  const body = {
    webhookUrl: webhookUrl
  };

  try {
    // Importante: validateMtls = false nas options do EfiPay para o Render
    const response = await efipay.pixConfigWebhook(params, body);
    res.json(response);
  } catch (error) {
    console.error('Erro ao configurar webhook:', error);
    res.status(500).json({ error: 'Falha ao configurar webhook', detalhes: error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${P
