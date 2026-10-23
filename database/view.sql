USE almoxarifado;

CREATE OR REPLACE VIEW vw_estoque AS
SELECT id_produto,
       nome,
       categoria,
       quantidade,
       valor_unitario,
       quantidade * valor_unitario AS valor_total
  FROM produto;