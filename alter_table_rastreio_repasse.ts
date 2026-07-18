// Script de migração: Adiciona COD_RASTREIO e VALOR_REPASSE na tabela PEDIDO
import pool from './src/config/database';

async function migrar() {
    const connection = await pool.getConnection();
    try {
        console.log('🔧 Iniciando migração...');

        // Adiciona COD_RASTREIO
        try {
            await connection.query(`ALTER TABLE PEDIDO ADD COLUMN COD_RASTREIO VARCHAR(100) NULL DEFAULT NULL AFTER OBSERVACOES`);
            console.log('✅ Coluna COD_RASTREIO adicionada.');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️  COD_RASTREIO já existe — pulando.');
            } else throw e;
        }

        // Adiciona VALOR_REPASSE
        try {
            await connection.query(`ALTER TABLE PEDIDO ADD COLUMN VALOR_REPASSE DECIMAL(10,2) NULL DEFAULT NULL AFTER COD_RASTREIO`);
            console.log('✅ Coluna VALOR_REPASSE adicionada.');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️  VALOR_REPASSE já existe — pulando.');
            } else throw e;
        }

        console.log('\n✅ Migração concluída com sucesso!');
    } catch (error) {
        console.error('❌ Erro na migração:', error);
    } finally {
        connection.release();
        process.exit(0);
    }
}

migrar();
