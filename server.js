const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Variáveis para as 4 máquinas
let valorPixMaquina1 = 0;
let valorPixMaquina2 = 0;
let valorPixMaquina3 = 0;
let valorPixMaquina4 = 0;

// Função para converter valor em pulsos (1 real = 1 pulso)
function converterPulsos(valorPix) {
    const ticket = 1;
    if (valorPix > 0 && valorPix >= ticket) {
        const pulsos = Math.floor(valorPix / ticket);
        return ("0000" + pulsos).slice(-4);
    }
    return "0000";
}

// ============================================
// ENDPOINTS PARA CADA MÁQUINA (ESP32 consulta)
// ============================================

app.get("/consulta-maquina1", async (req, res) => {
    const pulsos = converterPulsos(valorPixMaquina1);
    valorPixMaquina1 = 0;
    console.log(`📟 Máquina 1: ${pulsos} pulsos`);
    res.json({ retorno: pulsos });
});

app.get("/consulta-maquina2", async (req, res) => {
    const pulsos = converterPulsos(valorPixMaquina2);
    valorPixMaquina2 = 0;
    console.log(`📟 Máquina 2: ${pulsos} pulsos`);
    res.json({ retorno: pulsos });
});

app.get("/consulta-maquina3", async (req, res) => {
    const pulsos = converterPulsos(valorPixMaquina3);
    valorPixMaquina3 = 0;
    console.log(`📟 Máquina 3: ${pulsos} pulsos`);
    res.json({ retorno: pulsos });
});

app.get("/consulta-maquina4", async (req, res) => {
    const pulsos = converterPulsos(valorPixMaquina4);
    valorPixMaquina4 = 0;
    console.log(`📟 Máquina 4: ${pulsos} pulsos`);
    res.json({ retorno: pulsos });
});

// ============================================
// WEBHOOK - EFI BANK CHAMA AQUI
// ============================================

app.post("/rota-recebimento", async (req, res) => {
    try {
        console.log("📨 Webhook recebido:", JSON.stringify(req.body, null, 2));
        
        if (req.body.pix && req.body.pix.length > 0) {
            const pix = req.body.pix[0];
            const valor = parseFloat(pix.valor);
            const txid = pix.txid;
            
            console.log(`💰 Pagamento: R$ ${valor} | TXID: ${txid}`);
            
            // Direciona para a máquina correta baseada no TXID
            if (txid === "70dcb59b94eac9ccbm01abcde") {
                valorPixMaquina1 += valor;
                console.log(`✅ Máquina 1 recebeu R$ ${valor}`);
            }
            else if (txid === "flaksdfjaskldfjxyzabc12345") {
                valorPixMaquina2 += valor;
                console.log(`✅ Máquina 2 recebeu R$ ${valor}`);
            }
            else if (txid === "maquina03pixabc12345678901") {
                valorPixMaquina3 += valor;
                console.log(`✅ Máquina 3 recebeu R$ ${valor}`);
            }
            else if (txid === "maquina04pixxyz9876543210") {
                valorPixMaquina4 += valor;
                console.log(`✅ Máquina 4 recebeu R$ ${valor}`);
            }
            else {
                console.log(`⚠️ TXID não reconhecido: ${txid}`);
            }
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error("Erro no webhook:", error);
        res.json({ ok: false });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", (req, res) => {
    res.json({ 
        status: "online", 
        timestamp: new Date(),
        maquina1: valorPixMaquina1,
        maquina2: valorPixMaquina2,
        maquina3: valorPixMaquina3,
        maquina4: valorPixMaquina4
    });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`GET  /consulta-maquina1`);
    console.log(`GET  /consulta-maquina2`);
    console.log(`GET  /consulta-maquina3`);
    console.log(`GET  /consulta-maquina4`);
    console.log(`POST /rota-recebimento`);
    console.log(`GET  /health`);
});