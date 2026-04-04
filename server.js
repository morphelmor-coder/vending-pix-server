const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Variáveis em memória
let valorPixMaquina1 = 0;
let valorPixMaquina2 = 0;

function converterPulsos(valorPix) {
    const ticket = 1;
    if (valorPix > 0 && valorPix >= ticket) {
        const pulsos = Math.floor(valorPix / ticket);
        return ("0000" + pulsos).slice(-4);
    }
    return "0000";
}

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

app.post("/rota-recebimento", async (req, res) => {
    try {
        console.log("📨 Webhook recebido:", JSON.stringify(req.body, null, 2));
        
        if (req.body.pix && req.body.pix.length > 0) {
            const pix = req.body.pix[0];
            const valor = parseFloat(pix.valor);
            const txid = pix.txid;
            
            console.log(`💰 Pagamento: R$ ${valor} | TXID: ${txid}`);
            
            if (txid === "70dcb59b94eac9ccbm01") {
                valorPixMaquina1 += valor;
                console.log(`✅ Máquina 1 recebeu R$ ${valor}`);
            }
            else if (txid === "flaksdfjaskldfj") {
                valorPixMaquina2 += valor;
                console.log(`✅ Máquina 2 recebeu R$ ${valor}`);
            }
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error("Erro:", error);
        res.json({ ok: false });
    }
});

app.get("/health", (req, res) => {
    res.json({ 
        status: "online", 
        timestamp: new Date(),
        maquina1: valorPixMaquina1,
        maquina2: valorPixMaquina2
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`GET  /consulta-maquina1`);
    console.log(`GET  /consulta-maquina2`);
    console.log(`POST /rota-recebimento`);
    console.log(`GET  /health`);
});