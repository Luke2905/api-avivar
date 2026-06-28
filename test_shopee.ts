import { buscarPedidosShopee } from './src/services/shopeeService';

async function run() {
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (15 * 24 * 60 * 60); // last 15 days
        const pedidos = await buscarPedidosShopee({ timeFrom: from, timeTo: to });
        console.log("Total pedidos recuperados:", pedidos.length);
        if (pedidos.length > 0) {
            console.log("Exemplo do primeiro pedido:");
            console.log(JSON.stringify(pedidos[0], null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
