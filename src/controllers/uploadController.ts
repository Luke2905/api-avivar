import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import pool from '../config/database'; // Sua conexão MySQL

// Configuração do Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Função Auxiliar: Upload de Buffer para Cloudinary (Promisificada)
const uploadFromBuffer = (buffer: Buffer, folder: string, filename: string) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,      // Pasta dentro do Cloudinary (ex: artes_pedidos)
                public_id: filename, // Nome do arquivo
                resource_type: "auto", // Detecta se é imagem, pdf ou raw automaticamente
            },
            (error, result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(error);
                }
            }
        );
        streamifier.createReadStream(buffer).pipe(stream);
    });
};

// 1. UPLOAD (Salva no Cloudinary E no MySQL com o Public ID)
export const uploadArte = async (req: Request, res: Response) => {
    const { idPedido } = req.params;
    const arquivo = req.file; // Vem do Multer (middleware de rota)

    if (!arquivo) return res.status(400).json({ mensagem: 'Nenhum arquivo enviado.' });

    try {
        // Limpa nome para evitar caracteres especiais que quebram URLs
        const nomeLimpo = arquivo.originalname
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, '_').split('.')[0]; // Remove extensão para usar no ID
        
        // Nome único para evitar sobrescrita: pedido_1_timestamp_nome
        const nomeUnico = `pedido_${idPedido}_${Date.now()}_${nomeLimpo}`;

        // --- AÇÃO 1: SOBE PRO CLOUDINARY ---
        // O result contém tudo que precisamos, inclusive o public_id
        const result: any = await uploadFromBuffer(arquivo.buffer, 'artes_pedidos', nomeUnico);

        const urlFinal = result.secure_url;
        const publicId = result.public_id; // <--- O "RG" DO ARQUIVO NA NUVEM

        // --- AÇÃO 2: SALVA NO MYSQL ---
        // Importante: Salvamos o PUBLIC_ID para poder deletar depois
        await pool.query(
            `INSERT INTO ARQUIVO_PEDIDO 
            (ID_PEDIDO, NOME_ARQUIVO, URL_ARQUIVO, TIPO_ARQUIVO, PUBLIC_ID) 
            VALUES (?, ?, ?, ?, ?)`,
            [idPedido, arquivo.originalname, urlFinal, arquivo.mimetype, publicId]
        );

        // Opcional: Se quiser mudar status do pedido ao subir arte
        /* await pool.query(
            "UPDATE PEDIDO SET STATUS_PEDIDO = 'CRIACAO' WHERE ID_PEDIDO = ? AND STATUS_PEDIDO = 'AGUARDANDO_ARTE'", 
            [idPedido]
        ); 
        */

        res.status(201).json({ 
            mensagem: 'Arquivo enviado com sucesso!', 
            url: urlFinal 
        });

    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ mensagem: 'Erro interno ao processar upload.' });
    }
};

// 2. LISTAR (Busca do MySQL)
export const listarArtes = async (req: Request, res: Response) => {
    const { idPedido } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM ARQUIVO_PEDIDO WHERE ID_PEDIDO = ? ORDER BY CRIADO_EM DESC',
            [idPedido]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensagem: 'Erro ao listar arquivos.' });
    }
};

// 3. DELETAR (Remove da Nuvem E do Banco)
export const deletarArte = async (req: Request, res: Response) => {
    const { idArquivo } = req.params;

    try {
        // Passo 1: Busca o PUBLIC_ID no banco antes de deletar
        const [rows]: any = await pool.query(
            'SELECT PUBLIC_ID FROM ARQUIVO_PEDIDO WHERE ID_ARQUIVO = ?', 
            [idArquivo]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ mensagem: 'Arquivo não encontrado no sistema.' });
        }

        const publicId = rows[0].PUBLIC_ID;

        // Passo 2: Se tiver ID da nuvem, deleta lá primeiro
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
                console.log(`Arquivo removido do Cloudinary: ${publicId}`);
            } catch (cloudError) {
                console.error('Erro ao deletar do Cloudinary (mas vou deletar do banco):', cloudError);
                // Não damos return aqui, pois queremos limpar do banco mesmo se a nuvem falhar
            }
        }

        // Passo 3: Deleta o registro do banco de dados
        await pool.query('DELETE FROM ARQUIVO_PEDIDO WHERE ID_ARQUIVO = ?', [idArquivo]);

        res.json({ mensagem: 'Arquivo excluído permanentemente.' });

    } catch (error) {
        console.error('Erro crítico ao deletar:', error);
        res.status(500).json({ mensagem: 'Erro ao processar exclusão.' });
    }
};