import cors from 'cors';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const PORT: string | number = process.env.PORT || 5001;
const app = express();

app.use(cors());
app.use(express.json());

// Variáveis em memória (para cada máquina)
let valorPixMaquina1 = 0;
let valorPixMaquina2 = 0;

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function converterPulsos(valorPix: number): string {
    const ticket = 1;  // 1 real por pulso
    if (valorPix > 0 && valorPix >= ticket) {
        const pulsos = Math.floor(valorPix / ticket);
        return ("0000" + pulsos).slice(-4);
    }
    return "0000";
}

// ============================================
// ENDPOINTS PARA O ESP32 CONSULTAR
// ============================================

app.get("/consulta-maquina1", async (req, res) => {
    const pulsos = converterPulsos(valorPixMaquina1);
    valorPixMaquina1 = 0;  // Zera após consulta
    
    console.log(`📟 Máquina 1 consultada: ${pulsos} pulsos`);
    return res.status(200).json({ retorno: pulsos });
});

app.get("/consulta-maquina2", async (req, res) => {
    const pulsos = converterPulsos(valorPixMaquina2);
    valorPixMaquina2 = 0;
    
    console.log(`📟 Máquina 2 consultada: ${pulsos} pulsos`);
    return res.status(200).json({ retorno: pulsos });
});

// Endpoint genérico (opcional)
app.get("/consulta/:maquina", async (req, res) => {
    const maquina = req.params.maquina;
    let valor = 0;
    
    if (maquina === "1") {
        valor = valorPixMaquina1;
        valorPixMaquina1 = 0;
    } else if (maquina === "2") {
        valor = valorPixMaquina2;
        valorPixMaquina2 = 0;
    }
    
    const pulsos = converterPulsos(valor);
    return res.status(200).json({ retorno: pulsos });
});

// ============================================
// WEBHOOK - EFI BANK CHAMA AQUI
// ============================================

app.post("/rota-recebimento", async (req, res) => {
    try {
        // Verifica se veio da Efí (segurança básica)
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const hmac = req.query.hmac;
        
        // Segurança: verifica hash (mude para algo mais seguro)
        if (hmac !== 'myhash1234') {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        console.log("📨 Webhook recebido:", JSON.stringify(req.body, null, 2));
        
        // Processa o pagamento
        if (req.body.pix && req.body.pix.length > 0) {
            const pix = req.body.pix[0];
            const valor = parseFloat(pix.valor);
            const txid = pix.txid;
            
            console.log(`💰 Pagamento recebido: R$ ${valor} | TXID: ${txid}`);
            
            // Roteia para a máquina correta baseada no TXID
            if (txid === "70dcb59b94eac9ccbm01") {
                valorPixMaquina1 += valor;
                console.log(`✅ Crédito de R$ ${valor} na Máquina 1`);
            } 
            else if (txid === "flaksdfjaskldfj") {
                valorPixMaquina2 += valor;
                console.log(`✅ Crédito de R$ ${valor} na Máquina 2`);
            }
            else {
                console.log(`⚠️ TXID não reconhecido: ${txid}`);
            }
        }
        
        return res.status(200).json({ ok: true });
        
    } catch (error) {
        console.error("Erro no webhook:", error);
        return res.status(200).json({ ok: false });
    }
});

// ============================================
// ENDPOINT DE TESTE (remover em produção)
// ============================================

app.post("/teste-pagamento", async (req, res) => {
    const { valor, maquina } = req.body;
    
    if (maquina === 1) {
        valorPixMaquina1 += valor;
    } else if (maquina === 2) {
        valorPixMaquina2 += valor;
    }
    
    console.log(`🧪 Teste: R$ ${valor} na máquina ${maquina}`);
    return res.status(200).json({ ok: true });
});

// ============================================
// HEALTH CHECK (para o Render)
// ============================================

app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "online", 
        timestamp: new Date(),
        maquina1: valorPixMaquina1,
        maquina2: valorPixMaquina2
    });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📋 Endpoints disponíveis:`);
    console.log(`   GET  /consulta-maquina1`);
    console.log(`   GET  /consulta-maquina2`);
    console.log(`   POST /rota-recebimento (webhook Efí)`);
    console.log(`   GET  /health`);
});