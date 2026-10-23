# DER - Controle de Almoxarifado

```mermaid
erDiagram
    PRODUTO ||--o{ ENTRADA : recebe
    PRODUTO ||--o{ SAIDA : possui

    PRODUTO {
        int id_produto PK
        varchar nome
        varchar categoria
        varchar unidade_medida
        int quantidade
        decimal valor_unitario
    }
    ENTRADA {
        int id_entrada PK
        int id_produto FK
        date data_entrada
        int quantidade
        decimal valor_unitario
    }
    SAIDA {
        int id_saida PK
        int id_produto FK
        date data_saida
        int quantidade
        decimal valor_unitario
    }
```

## Cardinalidades
- `categoria` é um atributo do PRODUTO (texto obrigatório).
- PRODUTO 1 : N ENTRADA (cada entrada refere-se a um produto).
- PRODUTO 1 : N SAIDA (cada saída refere-se a um produto).

`PRODUTO.quantidade` é o saldo atual, atualizado automaticamente a cada entrada/saída.
`valor_unitario` em ENTRADA/SAIDA guarda o preço praticado na movimentação.
