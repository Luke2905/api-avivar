const crypto = require('crypto');
const https = require('https');

// ==========================================
// 1. PREENCHA AQUI COM SEUS DADOS
// ==========================================
const PARTNER_ID = 1221210; 
const PARTNER_KEY = 'shpk6d715a59454b675a4e6544636b6b5a58694169555061764c4650416c6874'; 

// Já preenchi com o da sua imagem! 👇
const SHOP_ID = 227144949; 

// 👇 COLE O CÓDIGO QUE VOCÊ PEGAR NO GOOGLE AQUI 👇
const AUTH_CODE = 'COLE_O_CODE_AQUI'; 

// ==========================================
// 2. FUNÇÃO DA HORA DO GOOGLE (Nosso relógio atômico)
// ==========================================
function obterHorarioSeguro() {
    return new Promise((resolve, reject) => {
        const req = https.request({ host: 'google.com', method: 'HEAD' }, (res) => {
            if (res.headers.date) resolve(Math.floor(new Date(res.headers.date).getTime() / 1000));
            else reject('Falhou ao ler a hora.');
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

// ==========================================
// 3. OBTER O TOKEN DE ACESSO
// ==========================================
async function obterToken() {
    try {
        console.log('⏳ Sincronizando relógio...');
        const timestamp = await obterHorarioSeguro();
        
        const path = '/api/v2/auth/token/get';
        
        // Base String para Token (A Shopee usa a mesma regra pra assinar)
        const baseString = `${PARTNER_ID}${path}${timestamp}`;
        const sign = crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');

        // Corpo da requisição (Aqui vai o código e a loja!)
        const body = JSON.stringify({
            code: AUTH_CODE,
            partner_id: PARTNER_ID,
            shop_id: SHOP_ID
        });

        const options = {
            hostname: 'partner.test-stable.shopeemobile.com',
            path: `${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        console.log('🚀 Solicitando Token Mágico...');

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('\n=================================================');
                console.log('🎯 RESPOSTA DA SHOPEE (Guarde isso com a sua vida):');
                console.log(JSON.parse(data));
                console.log('=================================================\n');
            });
        });

        req.on('error', (error) => console.error('❌ Erro na requisição:', error));

        req.write(body);
        req.end();

    } catch (erro) {
        console.error('❌ Erro:', erro);
    }
}

// Roda a brincadeira
obterToken();