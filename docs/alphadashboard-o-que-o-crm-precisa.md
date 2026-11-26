# O que o CRM da Reis precisa do AlphaDashboard

O CRM da Reis já busca os dados no AlphaDashboard sozinho (`lib/erp/alpha/`). Ele
usa a chave de integração da Reis (`X-API-Key`) ou, sem ela, o login de um
usuário, e só chama rotas de consulta (`/api/v1/dashboard/*`).

Com as rotas de hoje, já dá para ter:

- faturamento e vendas por dia e por vendedor;
- estoque;
- contas a receber e a pagar.

Faltam dados para estas telas do CRM:

| Tela do CRM | O que falta | Item |
|---|---|---|
| Margem e lucro bruto | itens de cada venda com o custo da época | 1 |
| Formas de pagamento | pagamentos de cada venda | 1 |
| Ranking de produtos, curva ABC por período, faturamento por grupo | itens de cada venda | 1 |
| Produtos parados (sem venda há X dias) | itens de cada venda e data de cadastro do produto | 1 e 3 |
| Cobrança pelo WhatsApp | celular do cliente nas contas a receber | 2 |
| "A receber em aberto" correto | baixa ou cancelamento depois do envio | 2 |
| Dias com mais de 200 vendas | listagem paginada, sem o corte de 200 | 1 |
| Aviso "loja sem atualizar" | hora da última sincronização do agente | 4 |

---

## 1. Nova rota: vendas com itens e pagamentos

```
GET /api/v1/dashboard/vendas?startDate=AAAA-MM-DD&endDate=AAAA-MM-DD&page=1&pageSize=100
```

**Como deve se comportar:**

- **Filtro:** pela data de emissão, com os dois extremos incluídos, igual ao `/vendas-dia`.
- **Paginação:** igual às outras rotas, com `totalCount` e **sem o limite de 200**.
- **Canceladas:** entram na lista, com `situacao`. É assim que o CRM tira dos totais uma venda cancelada depois.
- **Orçamentos (`ORC`):** podem ficar de fora.
- **Opcional, mas economiza muito:** `alteradasDesde=AAAA-MM-DD HH:MM:SS` traz só as vendas criadas ou alteradas depois desse momento. A nuvem precisa guardar um `atualizado_em` a cada upsert vindo do agente.

**Exemplo de resposta:**

```json
{
  "page": 1, "pageSize": 100, "totalCount": 143,
  "vendas": [{
    "id_saida_local": 1001,
    "data_emissao": "2026-11-26 10:41:00",
    "modelo": "65",
    "situacao": "Autorizada",
    "valor_total": "100.00",
    "valor_produtos": "105.00",
    "valor_desconto": "5.00",
    "valor_frete": "0.00",
    "codigo_cliente": 345,
    "nome_destinatario": "Cliente Teste",
    "nome_vendedor": "Vendedor Teste",
    "itens": [{
      "codigo_produto": 101,
      "descricao": "Cimento CP-II 50kg",
      "quantidade": "2.0000",
      "valor_total": "100.00",
      "custo_unitario": "31.5000"
    }],
    "pagamentos": [{ "descricao": "Pix", "valor": "100.00" }]
  }]
}
```

**Campos dos itens:**

- **`codigo_produto`:** é o `produto.Codigo`, o mesmo que vem no `/estoque` como `codigo`. Não é o `idproduto`.
- **`valor_total`:** já líquido de desconto, incluindo o desconto do cabeçalho rateado.
- **`custo_unitario`:** o custo médio vigente **na data da venda**, ou `null` quando o produto não tem custo.
  - O `saidaitem` do Órbita não guarda custo. O agente precisa ler o `customedio` vigente quando envia a venda.
  - No Brute Sync, vale o `customedio` com data menor ou igual à da venda.
  - Mandar `null` em vez de `0` quando não tem custo. Custo zero vira 100% de margem.

**Pagamentos:** vêm de `pagamentovenda` mais `tipodocumento.Descricao`, uma linha por forma de pagamento.

## 2. Contas a receber e a pagar

1. **Atualizar título pago ou cancelado depois do envio** (é a limitação da seção 7 da documentação).
   - A cada ciclo, o agente reenvia o estado atual dos títulos que ainda estão em aberto na nuvem: baixa, pagamento parcial, cancelamento e exclusão.
   - Sem isso, o "a receber em aberto" só cresce.
2. **Campos novos no `/financeiro`:**
   - a receber: `codigo_cliente` e `celular_cliente` (`contato.Celular`);
   - os dois tipos: `tipo_documento` (boleto, crediário, cheque…);
   - a pagar: `categoria` (plano de contas).

## 3. Produtos (`/estoque`)

**Campos novos:**
- `unidade` (UN, SC, M…);
- `marca`;
- `data_cadastro`. Sem ela, produto novo aparece como "parado".

`codigo` precisa ser sempre o `produto.Codigo` numérico.

## 4. Última sincronização do agente

**Campo novo no `/summary`:** `ultimaSincronizacao` (`"AAAA-MM-DD HH:MM:SS"`).

Hoje o CRM só sabe quando ele mesmo consultou a API. Não sabe se o computador da loja parou de enviar.

## 5. Regra da NF-e modelo 55

**O conflito:**
- A API conta o modelo 55 como venda.
- O painel do próprio Órbita não conta (regra tirada do código dele). A NF-e costuma ser emitida a partir de um DAV que já foi contado, então contar os dois dobra a venda.

**Hoje o CRM descarta o 55.**

**O que vale conferir:** num dia com NF-e 55, comparar o faturamento do AlphaDashboard com o do painel do Órbita. Se o AlphaDashboard der a mais, alinhar a regra lá também.

## 6. Ligar a Reis

1. **Instalar o agente no computador certo.** O computador "Servidor" da loja tem uma cópia antiga do `orbitadb`, parada desde uns 3 meses antes de 23/10.
   - O agente precisa ler o banco que o Órbita usa de verdade.
   - O endereço está no `Adm.exe.config` (`IpDbPrincipal`, `PortaDbPrincipal`, `EsquemaDbPrincipal`) ou no `user.config` do usuário do Windows.
   - O `erp-sync-reis/descobrir-banco.js` deste repositório acha esse endereço.
2. **Rodar o Brute Sync** para trazer 12 meses de histórico.
3. **Gerar a chave de integração da Reis** (`POST /api/v1/admin/api-keys` com o
   `ADMIN_SUPPORT_TOKEN`, corpo `{ "cnpj": "<CNPJ da Reis>", "nome": "CRM Reis" }`).
   A chave aparece só uma vez: vai direto na variável `ALPHA_DASHBOARD_CHAVE` do
   Railway do CRM, sem passar por chat ou e-mail.
   - Sem a chave, o CRM também entra com um usuário: `ALPHA_DASHBOARD_CNPJ`,
     `ALPHA_DASHBOARD_LOGIN` e `ALPHA_DASHBOARD_SENHA`. Com a chave preenchida,
     essas três são ignoradas.

## Uso da API pelo CRM

**Ritmo de consultas:**
- uma consulta a cada 2 s no máximo, o que dá 450 a cada 15 min, dentro do limite de 500;
- vendas de hoje e de ontem a cada 10 min;
- produtos e contas a cada 1 h;
- conferência de 45 dias de vendas uma vez por dia;
- histórico de 12 meses só na primeira vez (cerca de 365 consultas).

**Autenticação:** com a chave, vai o `X-API-Key` em toda chamada. Chave recusada (401)
espera 15 min antes de tentar de novo. Sem a chave, faz o login uma vez e reaproveita
o token por 24 h; login de novo só ao receber 401.

**Botão "Atualizar agora":** chama `POST /sync-now`, espera 45 s e busca as vendas do dia.
- Ponto a confirmar: se o `sync-now` recusar a chave de integração (403), o CRM só
  registra no log e busca as vendas mesmo assim, sem a sincronização na hora. Seria
  bom o `sync-now` aceitar a chave.
