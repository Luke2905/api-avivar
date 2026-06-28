import pool from './src/config/database';

async function migrate() {
    try {
        console.log('Iniciando migração dos gaps do MVP...');

        const connection = await pool.getConnection();

        // 1. Alterar tabela PRODUTO
        console.log('Adicionando colunas CUSTO_MAO_OBRA e PERC_IMPOSTO na tabela PRODUTO...');
        try {
            await connection.query('ALTER TABLE PRODUTO ADD COLUMN CUSTO_MAO_OBRA DECIMAL(10,2) DEFAULT 0');
            await connection.query('ALTER TABLE PRODUTO ADD COLUMN PERC_IMPOSTO DECIMAL(5,2) DEFAULT 0');
            console.log('Colunas adicionadas na tabela PRODUTO com sucesso.');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Colunas CUSTO_MAO_OBRA ou PERC_IMPOSTO já existem na tabela PRODUTO.');
            } else {
                throw e;
            }
        }

        // 2. Alterar tabela MATERIA_PRIMA
        console.log('Adicionando coluna ESTOQUE_MINIMO na tabela MATERIA_PRIMA...');
        try {
            await connection.query('ALTER TABLE MATERIA_PRIMA ADD COLUMN ESTOQUE_MINIMO DECIMAL(10,2) DEFAULT 0');
            console.log('Coluna adicionada na tabela MATERIA_PRIMA com sucesso.');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Coluna ESTOQUE_MINIMO já existe na tabela MATERIA_PRIMA.');
            } else {
                throw e;
            }
        }

        connection.release();
        console.log('Migração concluída com sucesso!');
        process.exit(0);

    } catch (error) {
        console.error('Erro ao executar migração:', error);
        process.exit(1);
    }
}

migrate();
