import pool from '../config/database';

export const registrarLog = async (usuario: string, acao: string, detalhes: string) => {
    try {
        await pool.query(
            'INSERT INTO LOGS_SISTEMA (NOME_USUARIO, ACAO, DETALHES, DATA_CRIACAO) VALUES (?, ?, ?, NOW())',
            [usuario || 'Sistema', acao, detalhes]
        );
    } catch (e) {
        console.error("Erro ao registrar log", e);
    }
};
