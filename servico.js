const conexao = require('./db');
const v = require('./validacoes');
const { ESTOQUE_MINIMO, ESTOQUE_MAXIMO, ErroNegocio } = v;

const hoje = () => new Date().toISOString().slice(0, 10);


async function transacao(fn) {
    const cx = await conexao.getConnection();
    try {
        await cx.beginTransaction();
        const resultado = await fn(cx);
        await cx.commit();
        return resultado;
    } catch (erro) {
        await cx.rollback();
        throw erro;
    } finally {
        cx.release();
    }
}


async function listarProdutos() {
    const [rows] = await conexao.query(`
        SELECT id_produto, nome, categoria, unidade_medida, quantidade, valor_unitario
          FROM produto
         ORDER BY id_produto`);
    return rows;
}

async function valorTotalPorCategoria() {
    const [rows] = await conexao.query(`
        SELECT categoria, SUM(valor_total) AS valor_total
          FROM vw_estoque
         GROUP BY categoria
         ORDER BY categoria`);
    return rows;
}

async function listarMovimentos(tabela) {
    const cfg = {
        entrada: { id: 'id_entrada', data: 'data_entrada' },
        saida:   { id: 'id_saida',   data: 'data_saida' }
    }[tabela];
    const [rows] = await conexao.query(`
        SELECT m.${cfg.id}, p.nome AS produto, p.unidade_medida, m.${cfg.data},
               m.quantidade, m.valor_unitario,
               (m.quantidade * m.valor_unitario) AS valor_total
          FROM ${tabela} m
          JOIN produto p ON p.id_produto = m.id_produto
         ORDER BY m.${cfg.data} DESC, m.${cfg.id} DESC`);
    return rows;
}



async function cadastrarProduto(corpo = {}) {
    const nome = v.textoObrigatorio(corpo.nome, 'O nome do produto');
    const categoria = v.categoria(corpo.categoria);
    const unidade = v.textoObrigatorio(corpo.unidade_medida, 'A unidade de medida');
    const quantidade = v.inteiro(corpo.quantidade, 'A quantidade',
        { min: ESTOQUE_MINIMO, max: ESTOQUE_MAXIMO });
    const valor = v.valorUnitario(corpo.valor_unitario);

    return transacao(async (cx) => {
        const [r] = await cx.query(
            `INSERT INTO produto (nome, categoria, unidade_medida, quantidade, valor_unitario)
             VALUES (?, ?, ?, ?, ?)`,
            [nome, categoria, unidade, quantidade, valor]);

   
        if (quantidade > 0) {
            await cx.query(
                `INSERT INTO entrada (id_produto, data_entrada, quantidade, valor_unitario)
                 VALUES (?, ?, ?, ?)`,
                [r.insertId, hoje(), quantidade, valor]);
        }
        return { mensagem: 'Produto cadastrado com sucesso', id_produto: r.insertId };
    });
}



async function movimentar(tipo, corpo = {}) {
    const idProduto = v.inteiro(corpo.id_produto, 'O ID do produto', { min: 1 });
    const quantidade = v.inteiro(corpo.quantidade, 'A quantidade', { min: 1 });
    const dataMov = v.vazio(corpo[`data_${tipo}`]) ? hoje() : v.data(corpo[`data_${tipo}`], `data_${tipo}`);
    const valorInformado = v.vazio(corpo.valor_unitario) ? null : v.valorUnitario(corpo.valor_unitario);

    return transacao(async (cx) => {
        
        const [[produto]] = await cx.query(
            'SELECT quantidade, valor_unitario FROM produto WHERE id_produto = ? FOR UPDATE',
            [idProduto]);
        if (!produto) throw new ErroNegocio('Produto não encontrado', 404);

        const anterior = produto.quantidade;
        const atual = tipo === 'entrada' ? anterior + quantidade : anterior - quantidade;

        if (atual < ESTOQUE_MINIMO) {
            throw new ErroNegocio('Estoque insuficiente', 400, { estoque_atual: anterior });
        }
        if (atual > ESTOQUE_MAXIMO) {
            throw new ErroNegocio(`A entrada ultrapassa o estoque máximo de ${ESTOQUE_MAXIMO}`,
                400, { estoque_atual: anterior });
        }

        const valor = valorInformado ?? produto.valor_unitario;
        const [r] = await cx.query(
            `INSERT INTO ${tipo} (id_produto, data_${tipo}, quantidade, valor_unitario)
             VALUES (?, ?, ?, ?)`,
            [idProduto, dataMov, quantidade, valor]);
        await cx.query('UPDATE produto SET quantidade = ? WHERE id_produto = ?', [atual, idProduto]);

        return {
            mensagem: `${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada com sucesso`,
            [`id_${tipo}`]: r.insertId,
            id_produto: idProduto,
            quantidade,
            estoque_anterior: anterior,
            estoque_atual: atual
        };
    });
}



async function movimentacoesPeriodo(query) {
    const { data_inicial: ini, data_final: fim } = v.periodo(query);
    const [rows] = await conexao.query(`
        SELECT p.nome AS nome_produto,
               p.unidade_medida,
               COALESCE(e.qtd, 0)               AS total_entradas,
               COALESCE(s.qtd, 0)               AS total_saidas,
               COALESCE(e.qtd, 0) - COALESCE(s.qtd, 0) AS saldo_periodo,
               COALESCE(e.valor, 0)             AS valor_total_entradas,
               COALESCE(s.valor, 0)             AS valor_total_saidas
          FROM produto p
          LEFT JOIN (SELECT id_produto, SUM(quantidade) AS qtd,
                            SUM(quantidade * valor_unitario) AS valor
                       FROM entrada
                      WHERE data_entrada BETWEEN ? AND ?
                      GROUP BY id_produto) e ON e.id_produto = p.id_produto
          LEFT JOIN (SELECT id_produto, SUM(quantidade) AS qtd,
                            SUM(quantidade * valor_unitario) AS valor
                       FROM saida
                      WHERE data_saida BETWEEN ? AND ?
                      GROUP BY id_produto) s ON s.id_produto = p.id_produto
         ORDER BY p.nome`, [ini, fim, ini, fim]);
    return rows;
}

async function maioresSaidas(query) {
    const { data_inicial: ini, data_final: fim } = v.periodo(query);
    const [rows] = await conexao.query(`
        SELECT p.nome AS nome_produto,
               SUM(s.quantidade) AS quantidade_total_saida,
               SUM(s.quantidade * s.valor_unitario) AS valor_total_financeiro_saidas
          FROM saida s
          JOIN produto p ON p.id_produto = s.id_produto
         WHERE s.data_saida BETWEEN ? AND ?
         GROUP BY p.id_produto, p.nome
         ORDER BY quantidade_total_saida DESC, p.nome`, [ini, fim]);
    return rows;
}

async function limitesEstoque() {
    const [rows] = await conexao.query(`
        SELECT id_produto, nome, quantidade,
               CASE WHEN quantidade <= ? THEN 'MÍNIMO' ELSE 'MÁXIMO' END AS situacao,
               ROUND((quantidade - ?) / (? - ?) * 100, 2) AS percentual_nivel
          FROM produto
         WHERE quantidade <= ? OR quantidade >= ?
         ORDER BY quantidade, nome`,
        [ESTOQUE_MINIMO, ESTOQUE_MINIMO, ESTOQUE_MAXIMO, ESTOQUE_MINIMO,
         ESTOQUE_MINIMO, ESTOQUE_MAXIMO]);
    return { estoque_minimo: ESTOQUE_MINIMO, estoque_maximo: ESTOQUE_MAXIMO, produtos: rows };
}

module.exports = {
    listarProdutos, valorTotalPorCategoria, cadastrarProduto,
    listarEntradas: () => listarMovimentos('entrada'),
    listarSaidas: () => listarMovimentos('saida'),
    registrarEntrada: (c) => movimentar('entrada', c),
    registrarSaida: (c) => movimentar('saida', c),
    movimentacoesPeriodo, maioresSaidas, limitesEstoque
};
