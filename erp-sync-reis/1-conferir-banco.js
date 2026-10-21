// Conferência do banco da loja ANTES do primeiro envio. SÓ LEITURA, e só
// mostra contagens e totais — nenhum nome de cliente, telefone ou documento.
//
//   node 1-conferir-banco.js
//
// Confere: usuário só de leitura, tabelas/colunas que o programa usa, quais
// vendas contam (regra do painel do Órbita), se os valores fecham (itens x
// nota x pagamentos), produtos/estoque/custo, títulos em aberto, baixa
// parcial, troco, vendas em andamento antigas e quanto tempo as leituras levam
// neste computador.
const { carregarConfig } = require("./config");
const { conectar } = require("./banco");
const orbita = require("./orbita");
const { horarioLojaMenosDias } = require("./datas");

const COLUNAS = {
  produto: "Codigo Descricao Ativo Excluido PrecoVarejo EstoqueMinimo CustoManual DataCadastro CodigoGrupo CodigoMarca CodigoUnidadeMedida",
  estoque: "CodigoProduto IdEmpresa Saldo",
  customedio: "idcustomedio CodigoProduto IdEmpresa DataMovimentacao Valor",
  grupo: "Codigo Descricao Excluido",
  marca: "Codigo Descricao Excluido",
  unidademedida: "Codigo Descricao Excluido",
  saidanota:
    "idsaidanota DataEmissao DataLancamento vNF vProd vDesc vFrete vTroco Modelo Situacao Cancelada Excluida Liberada NomeVendedor CodigoVendedor CodigoCliente xNome idusuario IdEmpresa IdDavOriginal finNFe",
  saidaitem: "idsaidaitem IdSaida Codigo Descricao Quantidade ValorUnitario SubTotal Desconto DescontoRateado AcrescimoRateado OutrasDespesas ValorTotal",
  pagamentovenda: "idPagamentoVenda idvenda Valor DescricaoPagamento idtipoDocumento",
  tipodocumento: "idtipoDocumento Descricao PermiteTroco TratamentoEspecifico Excluido",
  cliente: "Codigo NomeOuRazao NomeFantasia Excluido idcontato",
  contato: "idcontato Celular Telefone",
  fornecedor: "Codigo NomeFantasia NomeOuRazao Excluido",
  vendedor: "CodigoVendedor Nome",
  usuario: "idusuario Nome",
  pc3: "Id Descricao",
  recebimento:
    "idrecebimento CodigoCliente DataVencimento DataDocumento DataLancamento ValorDocumento ValorOriginal ValorPagamento DataPagamento Baixado Cancelado Excluido Parcial IdDocOriginal idtipoDocumento",
  pagamento:
    "idpagamento CodigoFornecedor Descricao IdPc3 DataVencimento DataDocumento DataLancamento ValorDocumento ValorPagamento DataPagamento Baixado Cancelado Excluido Parcial IdDocOriginal",
};

const VALIDA = "Cancelada = 0 AND Excluida = 0 AND Liberada = 1 AND Modelo <> 'ORC' AND Modelo <> '55'";
const reais = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const titulo = (t) => console.log(`\n=== ${t} ===`);

async function cronometrar(nome, fn, tempos) {
  const t0 = Date.now();
  const r = await fn();
  tempos.push({ leitura: nome, segundos: ((Date.now() - t0) / 1000).toFixed(1) });
  return r;
}

async function main() {
  const config = carregarConfig({ precisaCrm: false });
  const db = await conectar(config);
  const avisos = []; // impedem de ligar
  const notas = []; // não impedem, mas quem configurou precisa saber
  try {
    titulo("Conexão");
    const [info] = await db.query("SELECT VERSION() AS versao, DATABASE() AS banco, CURRENT_USER() AS usuario");
    console.log(`MySQL ${info.versao}, banco "${info.banco}", usuário ${info.usuario}`);
    const permissoes = (await db.query("SHOW GRANTS FOR CURRENT_USER()")).map((l) => Object.values(l)[0]);
    const gravacao = permissoes.filter((g) => /ALL PRIVILEGES|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE/i.test(g.replace(/GRANT USAGE/i, "")));
    if (gravacao.length) avisos.push("O usuário do MySQL pode GRAVAR no banco. Use o usuário só de leitura (criar-usuario-leitura.sql).");
    console.log(gravacao.length ? "ATENÇÃO: usuário com permissão de gravação" : "Usuário só de leitura: OK");

    titulo("Tabelas e colunas que o programa usa");
    const existentes = await db.query(
      "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
    );
    const tem = new Set(existentes.map((l) => `${l.t.toLowerCase()}.${l.c.toLowerCase()}`));
    let faltando = 0;
    for (const [tabela, colunas] of Object.entries(COLUNAS)) {
      const faltam = colunas.split(" ").filter((c) => !tem.has(`${tabela}.${c.toLowerCase()}`));
      if (faltam.length) {
        faltando += faltam.length;
        console.log(`FALTA em ${tabela}: ${faltam.join(", ")}`);
      }
    }
    if (faltando) {
      avisos.push(`${faltando} coluna(s) que o programa usa não existem neste banco — não dá pra sincronizar assim.`);
    } else console.log("Todas presentes: OK");

    if (!faltando) {
      const desde30 = horarioLojaMenosDias(30, config.fuso);
      const desde90 = horarioLojaMenosDias(90, config.fuso);

      titulo("Empresas no banco (vendas dos últimos 90 dias)");
      console.table(
        await db.query(
          "SELECT IdEmpresa, COUNT(*) AS vendas FROM saidanota WHERE DataEmissao >= ? GROUP BY IdEmpresa ORDER BY IdEmpresa",
          [desde90]
        )
      );
      console.log(
        config.idEmpresa == null
          ? "ID_EMPRESA vazio no .env: o programa junta todas. Se aparecer mais de uma acima, decida qual."
          : `ID_EMPRESA=${config.idEmpresa}: o programa lê só essa.`
      );

      titulo("Vendas dos últimos 30 dias por tipo (conta = entra no CRM)");
      const tipos = await db.query(
        `SELECT Modelo, Situacao, Liberada, Cancelada, Excluida, COUNT(*) AS qtd, SUM(vNF) AS total
         FROM saidanota WHERE DataEmissao >= ? GROUP BY Modelo, Situacao, Liberada, Cancelada, Excluida
         ORDER BY qtd DESC`,
        [desde30]
      );
      console.table(
        tipos.map((t) => ({
          modelo: t.Modelo,
          situacao: t.Situacao,
          liberada: t.Liberada,
          cancelada: t.Cancelada,
          excluida: t.Excluida,
          qtd: t.qtd,
          total: reais(t.total),
          conta: orbita.vendaValida({ ...t, DataEmissao: "x" }) ? "SIM" : "",
        }))
      );
      const [nfeDireta] = await db.query(
        `SELECT COUNT(*) AS qtd, SUM(vNF) AS total FROM saidanota
         WHERE DataEmissao >= ? AND Modelo = '55' AND Cancelada = 0 AND Excluida = 0 AND Liberada = 1
           AND COALESCE(IdDavOriginal, 0) = 0 AND COALESCE(finNFe, 1) = 1`,
        [desde30]
      );
      console.log(
        `NF-e (55) emitida direto, sem DAV: ${nfeDireta.qtd} (${reais(nfeDireta.total)}). O painel do Órbita não conta essas; o CRM também não.`
      );

      titulo("Os valores fecham? (vendas que contam, últimos 30 dias)");
      const [nota] = await db.query(
        `SELECT COUNT(*) AS vendas, SUM(vNF) AS vNF, SUM(vProd) AS vProd, SUM(vDesc) AS vDesc,
                SUM(COALESCE(vFrete, 0)) AS vFrete, SUM(COALESCE(vTroco, 0)) AS vTroco
         FROM saidanota WHERE DataEmissao >= ? AND ${VALIDA}`,
        [desde30]
      );
      const [itens] = await db.query(
        `SELECT SUM(COALESCE(si.SubTotal, si.ValorUnitario * si.Quantidade) - COALESCE(si.Desconto, 0)
                    - COALESCE(si.DescontoRateado, 0) + COALESCE(si.AcrescimoRateado, 0)
                    + COALESCE(si.OutrasDespesas, 0)) AS liquido,
                SUM(si.ValorTotal) AS valorTotal
         FROM saidanota sa JOIN saidaitem si ON si.IdSaida = sa.idsaidanota
         WHERE sa.DataEmissao >= ? AND ${VALIDA.replace(/(Cancelada|Excluida|Liberada|Modelo)/g, "sa.$1")}`,
        [desde30]
      );
      const [pagos] = await db.query(
        `SELECT SUM(pv.Valor) AS pago
         FROM saidanota sa JOIN pagamentovenda pv ON pv.idvenda = sa.idsaidanota
         WHERE sa.DataEmissao >= ? AND ${VALIDA.replace(/(Cancelada|Excluida|Liberada|Modelo)/g, "sa.$1")}`,
        [desde30]
      );
      const linhas = [
        ["Vendas", nota.vendas],
        ["Total das notas (vNF)", reais(nota.vNF)],
        ["Produtos (vProd)", reais(nota.vProd)],
        ["Descontos (vDesc)", reais(nota.vDesc)],
        ["Frete (vFrete)", reais(nota.vFrete)],
        ["Itens, líquido calculado pelo programa", reais(itens.liquido)],
        ["Itens, ValorTotal gravado pelo Órbita", reais(itens.valorTotal)],
        ["Pagamentos", reais(pagos.pago)],
        ["Troco", reais(nota.vTroco)],
      ];
      console.table(Object.fromEntries(linhas));
      const difItens = Math.abs((Number(itens.liquido) || 0) + (Number(nota.vFrete) || 0) - (Number(nota.vNF) || 0));
      if (difItens > Math.max(1, (Number(nota.vNF) || 0) * 0.005)) {
        avisos.push(`Itens líquidos + frete não batem com o total das notas (diferença ${reais(difItens)}). Ver a regra do valor do item antes de ligar.`);
      } else console.log("Itens líquidos + frete = total das notas: OK");

      titulo("Produtos");
      const [prod] = await db.query(
        `SELECT COUNT(*) AS total, SUM(Ativo = 1 AND Excluido = 0) AS ativos, SUM(CustoManual > 0) AS comCustoManual
         FROM produto`
      );
      const [est] = await db.query(
        "SELECT COUNT(*) AS comEstoque, SUM(s < 0) AS negativos FROM (SELECT SUM(Saldo) AS s FROM estoque GROUP BY CodigoProduto) e WHERE s <> 0"
      );
      console.table({
        "Produtos cadastrados": prod.total,
        Ativos: prod.ativos,
        "Com custo manual": prod.comCustoManual,
        "Com estoque diferente de zero": est.comEstoque,
        "Com estoque negativo": est.negativos,
      });

      titulo("Contas em aberto");
      const hoje = horarioLojaMenosDias(0, config.fuso);
      const abertos = async (tabela) => {
        const [r] = await db.query(
          `SELECT COUNT(*) AS qtd, SUM(ValorDocumento) AS total, SUM(DataVencimento < ?) AS vencidas,
                  SUM(DataVencimento IS NULL) AS semVencimento
           FROM ${tabela} WHERE Baixado = 0 AND Cancelado = 0 AND Excluido = 0`,
          [hoje]
        );
        return { qtd: r.qtd, total: reais(r.total), vencidas: r.vencidas, "sem vencimento": r.semVencimento };
      };
      console.table({ "A receber": await abertos("recebimento"), "A pagar": await abertos("pagamento") });

      // O programa só abate do saldo o valor pago de título em aberto marcado
      // Parcial = 1 (orbita.js, montarTituloBase). Aqui aparece se o Órbita
      // desta loja guarda baixa parcial de outro jeito.
      titulo("Baixa parcial (títulos em aberto que já têm valor pago)");
      const parciais = async (tabela) => {
        const [r] = await db.query(
          `SELECT SUM(Baixado = 0 AND Cancelado = 0 AND Excluido = 0 AND ValorPagamento > 0) AS abertosComPago,
                  SUM(Baixado = 0 AND Cancelado = 0 AND Excluido = 0 AND ValorPagamento > 0 AND Parcial = 1) AS marcadosParcial,
                  SUM(CASE WHEN Baixado = 0 AND Cancelado = 0 AND Excluido = 0 AND ValorPagamento > 0 THEN ValorPagamento ELSE 0 END) AS jaPago,
                  SUM(Parcial = 1 AND Baixado <> 0) AS parcialBaixados,
                  SUM(IdDocOriginal > 0) AS comDocOriginal
           FROM ${tabela}`
        );
        const semMarca = (Number(r.abertosComPago) || 0) - (Number(r.marcadosParcial) || 0);
        if (semMarca > 0) {
          notas.push(
            `${tabela}: ${semMarca} título(s) em aberto com valor pago sem a marca Parcial. O CRM mostra esses pelo valor cheio. Mande esta tabela pra quem configurou o programa.`
          );
        }
        return {
          "em aberto com valor pago": Number(r.abertosComPago) || 0,
          "desses, marcados Parcial": Number(r.marcadosParcial) || 0,
          "já pago neles": reais(r.jaPago),
          "Parcial já baixados": Number(r.parcialBaixados) || 0,
          "com documento de origem": Number(r.comDocOriginal) || 0,
        };
      };
      console.table({ "A receber": await parciais("recebimento"), "A pagar": await parciais("pagamento") });

      titulo("Formas de pagamento e troco");
      const formas = await db.query(
        "SELECT Descricao, PermiteTroco, TratamentoEspecifico FROM tipodocumento WHERE COALESCE(Excluido, 0) = 0 ORDER BY idtipoDocumento"
      );
      const trocoSai = ["não", "último caso", "sim", "sim, primeiro"];
      console.table(
        formas.map((f) => ({
          forma: f.Descricao,
          "permite troco": f.PermiteTroco,
          tratamento: f.TratamentoEspecifico,
          "troco sai daqui": trocoSai[orbita.prioridadeTroco(f, f.Descricao)],
        }))
      );
      const [troco] = await db.query(
        `SELECT COUNT(*) AS comTroco, SUM(d.temDinheiro) AS comDinheiro
         FROM (
           SELECT EXISTS (SELECT 1 FROM pagamentovenda pv JOIN tipodocumento t ON t.idtipoDocumento = pv.idtipoDocumento
                          WHERE pv.idvenda = sa.idsaidanota AND (t.PermiteTroco = 1 OR t.Descricao LIKE '%dinheiro%')) AS temDinheiro
           FROM saidanota sa
           WHERE sa.DataEmissao >= ? AND sa.vTroco > 0 AND ${VALIDA.replace(/(Cancelada|Excluida|Liberada|Modelo)/g, "sa.$1")}
         ) d`,
        [desde30]
      );
      console.log(`Vendas com troco nos últimos 30 dias: ${troco.comTroco || 0}; com forma em dinheiro: ${troco.comDinheiro || 0}.`);
      const trocoSemDinheiro = (Number(troco.comTroco) || 0) - (Number(troco.comDinheiro) || 0);
      if (trocoSemDinheiro > 0) {
        notas.push(
          `${trocoSemDinheiro} venda(s) com troco sem forma em dinheiro: o troco sai de outra forma. O total da venda não muda, só a divisão por forma de pagamento.`
        );
      }

      titulo("Vendas em andamento (ainda não liberadas), por idade");
      const desde7 = horarioLojaMenosDias(7, config.fuso);
      const andamento = await db.query(
        `SELECT Modelo,
                SUM(COALESCE(DataLancamento, DataEmissao) >= ?) AS ate7,
                SUM(COALESCE(DataLancamento, DataEmissao) < ? AND COALESCE(DataLancamento, DataEmissao) >= ?) AS de7a90,
                SUM(COALESCE(DataLancamento, DataEmissao) < ?) AS maisDe90
         FROM saidanota
         WHERE Cancelada = 0 AND Excluida = 0 AND (Liberada IS NULL OR Liberada <> 1)
         GROUP BY Modelo ORDER BY Modelo`,
        [desde7, desde7, desde90, desde90]
      );
      console.table(
        andamento.map((a) => ({
          modelo: a.Modelo,
          "até 7 dias": Number(a.ate7) || 0,
          "7 a 90 dias": Number(a.de7a90) || 0,
          "mais de 90 dias": Number(a.maisDe90) || 0,
        }))
      );
      console.log("O programa acompanha as de até 90 dias. Se uma mais antiga for faturada, entra na conferência diária.");

      titulo("Tempo das leituras do programa neste computador");
      const tempos = [];
      const cadastros = await cronometrar("cadastros (clientes, fornecedores...)", () => orbita.lerCadastros(db), tempos);
      const { produtos, custoManual } = await cronometrar("produtos + estoque + custo", () => orbita.lerProdutos(db, config), tempos);
      const historico = await cronometrar(
        `cabeçalhos das vendas do histórico (${config.diasHistorico} dias)`,
        () => orbita.lerCabecalhosDesdeData(db, config, horarioLojaMenosDias(config.diasHistorico, config.fuso), desde90),
        tempos
      );
      const validasHistorico = historico.filter((s) => orbita.vendaValida(s));
      // Amostra: as 900 vendas mais novas, pra estimar o histórico inteiro sem
      // pesar o computador agora.
      const amostra = validasHistorico.slice(-900);
      const t0 = Date.now();
      const montadas = await cronometrar(
        `itens/pagamentos/custo de ${amostra.length} vendas (amostra)`,
        () => orbita.montarVendas(db, config, amostra, { cadastros, custoManual, avisar: (m) => notas.push(m) }),
        tempos
      );
      const porVenda = amostra.length ? (Date.now() - t0) / 1000 / amostra.length : 0;
      const desde3 = horarioLojaMenosDias(3, config.fuso);
      const acompanhadas = historico.filter(
        (s) =>
          (s.DataEmissao && s.DataEmissao >= desde3) ||
          (orbita.vendaEmAndamento(s) && (s.DataLancamento || s.DataEmissao || "") >= desde90)
      );
      await cronometrar(
        `releitura das ${acompanhadas.length} vendas acompanhadas (ciclo normal)`,
        () => orbita.lerCabecalhosPorId(db, acompanhadas.map((s) => s.idsaidanota)),
        tempos
      );
      console.table(tempos);

      const minutos = (segundos) => (segundos < 90 ? `${Math.round(segundos)} s` : `${Math.round(segundos / 60)} min`);
      const leituraHistorico = porVenda * validasHistorico.length;
      console.log(
        `Primeiro envio: ${produtos.length} produtos e ${validasHistorico.length} vendas dos últimos ${config.diasHistorico} dias. ` +
          `Só a leitura das vendas leva uns ${minutos(leituraHistorico)}, mais o tempo de mandar pela internet.`
      );
      console.log(`Conferência completa (uma vez por dia): relê as mesmas vendas, uns ${minutos(leituraHistorico)}.`);
      const validasAcompanhadas = acompanhadas.filter(orbita.vendaValida).length;
      console.log(
        `Ciclo normal: relê ${acompanhadas.length} vendas acompanhadas e monta ${validasAcompanhadas}, uns ${minutos(porVenda * validasAcompanhadas)}.`
      );
      const semCusto = montadas.flatMap((v) => v.items).filter((i) => i.custoUnitario == null).length;
      const totalItens = montadas.reduce((t, v) => t + v.items.length, 0);
      if (totalItens) console.log(`Itens das vendas recentes sem custo (ficam fora da margem): ${semCusto} de ${totalItens}.`);
    }

    if (notas.length) {
      titulo("Para conferir (não impede de ligar)");
      for (const n of notas) console.log(`- ${n}`);
    }
    titulo(avisos.length ? "AVISOS — resolver antes de ligar" : "Tudo certo pra ligar");
    for (const a of avisos) console.log(`- ${a}`);
    console.log("\nNada foi alterado no banco: esta conferência só lê.");
  } finally {
    await db.fechar();
  }
}

main().catch((err) => {
  console.error(`Erro: ${err.code ? `${err.code} — ` : ""}${err.message}`);
  process.exit(1);
});
