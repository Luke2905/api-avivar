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
                folder: folder, // Pasta dentro do Cloudinary
                public_id: filename, // Nome do arquivo
                resource_type: "auto", // Aceita imagem e PDF automaticamente
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

// 1. UPLOAD
export const uploadArte = async (req: Request, res: Response) => {
    const { idPedido } = req.params;
    const arquivo = req.file; // Vem do Multer

    if (!arquivo) return res.status(400).json({ mensagem: 'Faltou o arquivo.' });

    try {
        // Limpa nome para evitar caracteres especiais
        const nomeLimpo = arquivo.originalname
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, '_').split('.')[0]; // Remove extensão para o ID
        
        // Nome único: pedido_1_timestamp_nome
        const nomeUnico = `pedido_${idPedido}_${Date.now()}_${nomeLimpo}`;

        // SOBE PRO CLOUDINARY
        const result: any = await uploadFromBuffer(arquivo.buffer, 'artes_pedidos', nomeUnico);

        // O Cloudinary retorna a URL segura (https)
        const urlFinal = result.secure_url;

        // SALVA NO MYSQL
        await pool.query(
            `INSERT INTO ARQUIVO_PEDIDO (ID_PEDIDO, NOME_ARQUIVO, URL_ARQUIVO, TIPO_ARQUIVO) 
             VALUES (?, ?, ?, ?)`,
            [idPedido, arquivo.originalname, urlFinal, arquivo.mimetype]
        );

        // Opcional: Atualiza status do pedido
        /* await pool.query(
            "UPDATE PEDIDO SET STATUS_PEDIDO = 'CRIACAO' WHERE ID_PEDIDO = ? AND STATUS_PEDIDO = 'AGUARDANDO_ARTE'", 
            [idPedido]
        ); */

        res.status(201).json({ mensagem: 'Arquivo adicionado!', url: urlFinal });

    } catch (error) {
        console.error('Erro upload Cloudinary:', error);
        res.status(500).json({ mensagem: 'Erro ao subir arquivo.' });
    }
};

// 2. LISTAR (Igual ao anterior, pois lê do MySQL)
export const listarArtes = async (req: Request, res: Response) => {
    const { idPedido } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM ARQUIVO_PEDIDO WHERE ID_PEDIDO = ? ORDER BY CRIADO_EM DESC',
            [idPedido]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro ao listar artes.' });
    }
};

// 3. DELETAR (Remove do MySQL e do Cloudinary)
export const deletarArte = async (req: Request, res: Response) => {
    const { idArquivo } = req.params;

    try {
        // Busca URL no banco
        const [rows]: any = await pool.query('SELECT URL_ARQUIVO FROM ARQUIVO_PEDIDO WHERE ID_ARQUIVO = ?', [idArquivo]);
        
        if (rows.length === 0) return res.status(404).json({ mensagem: 'Arquivo não encontrado.' });

        const url = rows[0].URL_ARQUIVO;

        // EXTRAIR O PUBLIC_ID DO CLOUDINARY PARA DELETAR
        // URL típica: https://res.cloudinary.com/.../upload/v123/artes_pedidos/nome_arquivo.jpg
        // Precisamos de: artes_pedidos/nome_arquivo
        const partesUrl = url.split('/');
        const nomeArquivoComExtensao = partesUrl[partesUrl.length - 1];
        const folder = 'artes_pedidos'; // Nome da pasta que definimos no upload
        const publicId = `${folder}/${nomeArquivoComExtensao.split('.')[0]}`;

        // Deleta no Cloudinary
        await cloudinary.uploader.destroy(publicId);

        // Deleta no Banco
        await pool.query('DELETE FROM ARQUIVO_PEDIDO WHERE ID_ARQUIVO = ?', [idArquivo]);

        res.json({ mensagem: 'Arquivo removido com sucesso.' });

    } catch (error) {
        console.error('Erro ao deletar:', error);
        res.status(500).json({ mensagem: 'Erro ao excluir.' });
    }
};