const ESTOQUE_MINIMO = 0;
const ESTOQUE_MAXIMO = 100;

class ErroNegocio extends Error {
    constructor(mensagem, status = 400, extra = {}) {
        super(mensagem);
        this.status = status;
        this.extra = extra;
    }
}

const vazio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');


const numero = (v) => (vazio(v) || typeof v === 'boolean' ? NaN : Number(v));

function textoObrigatorio(valor, campo) {
    if (typeof valor !== 'string' || valor.trim() === '') {
        throw new ErroNegocio(`${campo} é obrigatório`);
    }
    return valor.trim();
}

function categoria(valor) {
    const texto = textoObrigatorio(valor, 'O campo categoria');
    if (texto.length > 50) throw new ErroNegocio('A categoria deve ter no máximo 50 caracteres');
    if (/^[\d\s.,-]+$/.test(texto)) throw new ErroNegocio('A categoria deve ser um texto válido (não apenas números)');
    return texto;
}

function inteiro(valor, campo, { min, max } = {}) {
    const n = numero(valor);
    if (!Number.isInteger(n)) throw new ErroNegocio(`${campo} deve ser um número inteiro`);
    if (min !== undefined && n < min) throw new ErroNegocio(`${campo} deve ser maior ou igual a ${min}`);
    if (max !== undefined && n > max) throw new ErroNegocio(`${campo} deve ser menor ou igual a ${max}`);
    return n;
}

function valorUnitario(valor) {
    const n = numero(valor);
    if (!Number.isFinite(n) || n <= 0) {
        throw new ErroNegocio('O valor unitário deve ser um número maior que zero');
    }
    return Math.round(n * 100) / 100;
}

function dataValida(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function data(valor, campo) {
    if (!dataValida(valor)) throw new ErroNegocio(`${campo} deve estar no formato AAAA-MM-DD`);
    return valor;
}

function periodo({ data_inicial, data_final } = {}) {
    if (vazio(data_inicial) || vazio(data_final)) {
        throw new ErroNegocio('Informe a data inicial e a data final');
    }
    data(data_inicial, 'data_inicial');
    data(data_final, 'data_final');
    if (data_inicial > data_final) {
        throw new ErroNegocio('A data inicial não pode ser maior que a data final');
    }
    return { data_inicial, data_final };
}

module.exports = {
    ESTOQUE_MINIMO, ESTOQUE_MAXIMO, ErroNegocio,
    vazio, textoObrigatorio, categoria, inteiro, valorUnitario, data, periodo
};
