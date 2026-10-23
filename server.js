const express = require('express');
const cors = require('cors');
const servico = require('./servico');
const { ErroNegocio } = require('./validacoes');

const app = express();
app.use(cors());
app.use(express.json());


app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });
    next();
});

app.get('/', (req, res) => res.json({ mensagem: 'API do Almoxarifado funcionando!' }));

app.get('/produtos', async (req, res) => res.json(await servico.listarProdutos()));
app.get('/produtos/categorias/valor', async (req, res) => res.json(await servico.valorTotalPorCategoria()));
app.post('/produtos', async (req, res) => res.status(201).json(await servico.cadastrarProduto(req.body)));

app.get('/entradas', async (req, res) => res.json(await servico.listarEntradas()));
app.post('/entradas', async (req, res) => res.status(201).json(await servico.registrarEntrada(req.body)));

app.get('/saidas', async (req, res) => res.json(await servico.listarSaidas()));
app.post('/saidas', async (req, res) => res.status(201).json(await servico.registrarSaida(req.body)));

app.get('/movimentacoes', async (req, res) => res.json(await servico.movimentacoesPeriodo(req.query)));
app.get('/produtos/maior-saida', async (req, res) => res.json(await servico.maioresSaidas(req.query)));
app.get('/estoque/limites', async (req, res) => res.json(await servico.limitesEstoque()));


app.use((erro, req, res, next) => {
    if (erro instanceof ErroNegocio) {
        return res.status(erro.status).json({ erro: erro.message, ...erro.extra });
    }
    if (erro.type === 'entity.parse.failed') {
        return res.status(400).json({ erro: 'JSON inválido no corpo da requisição' });
    }
    console.error(erro);
    res.status(500).json({ erro: 'Erro interno do servidor' });
});

const PORTA = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORTA, () => console.log(`Servidor rodando em http://localhost:${PORTA}`));
}

module.exports = app;
