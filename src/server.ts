import express from 'express';
import cors from 'cors';
import { testarConexao } from './config/database';
import produtoRoutes from './routes/produtoRoutes'; // <--- Importe aqui
import usuarioRoutes from './routes/usuarioRoutes';
import authRoutes from './routes/authRoutes';
import pedidoRoutes from './routes/pedidoRoutes';
import materiaRoutes from './routes/materiaRoutes';
import fichaRoutes from './routes/fichaRoutes';
import producaoRoutes from './routes/producaoRoutes';
import compraRoutes from './routes/compraRoutes';
import scannerRoutes from './routes/scannerRoutes';
import iaRoutes from './routes/iaRoutes';

const app = express();

app.use(cors());
app.use(express.json());

// Rotas da API
app.use('/api/produtos', produtoRoutes); // <--- Use aqui (Prefixo /api/produtos)
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/estoque', materiaRoutes);
app.use('/api/ficha', fichaRoutes);
app.use('/api/producao', producaoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/ia', iaRoutes);

app.get('/', (req, res) => {
    res.json({ mensagem: 'API Online' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`\n⚡ Servidor rodando em: http://localhost:${PORT}`);
    await testarConexao();
});