// DADO DE AMOSTRA — conteúdo técnico. As proporções/fórmulas abaixo são orientações
// gerais de mercado (não específicas da Reis) e precisam ser revisadas pela equipe técnica
// da loja antes de publicar — ver checklist no README. Cada artigo já inclui um aviso
// recomendando acompanhamento profissional para cálculo estrutural.
import type { BlogPost } from "@/lib/types";

export const blogPosts: BlogPost[] = [
  {
    slug: "quanto-cimento-areia-brita-comprar",
    title: "Quanto Cimento, Areia e Brita Comprar Para Sua Obra",
    excerpt:
      "Um guia prático para estimar a quantidade de material básico antes de fechar o orçamento da sua obra ou reforma.",
    category: "Cálculo de Materiais",
    publishedAt: "2026-06-10",
    readTimeMinutes: 6,
    coverImage: "/images/produtos/basico.svg",
    body: [
      {
        type: "paragraph",
        text: "Um dos maiores erros no início de uma obra é comprar material no chute — sobra material parado ou, pior, falta na hora errada. Este guia traz estimativas gerais para você chegar ao orçamento com mais segurança.",
      },
      {
        type: "callout",
        text: "As proporções abaixo são estimativas gerais de mercado. Para fundação, estrutura e qualquer elemento com função estrutural, o cálculo definitivo deve ser feito por um engenheiro ou responsável técnico.",
      },
      { type: "heading", level: 2, text: "Concreto para fundação e estrutura" },
      {
        type: "paragraph",
        text: "Uma referência comum para concreto simples (traço 1:2:3, em volume) é: para cada saco de cimento de 50kg, cerca de 2 latas de areia e 3 latas de brita, resultando em aproximadamente 0,15 m³ de concreto pronto.",
      },
      {
        type: "table",
        headers: ["Volume de concreto", "Cimento", "Areia", "Brita"],
        rows: [
          ["1 m³", "~7 sacos (50kg)", "~0,50 m³", "~0,70 m³"],
          ["5 m³", "~35 sacos (50kg)", "~2,50 m³", "~3,50 m³"],
        ],
      },
      { type: "heading", level: 2, text: "Alvenaria: blocos e tijolos" },
      {
        type: "list",
        items: [
          "Bloco de concreto 14x19x39cm: cerca de 12,5 unidades por m² de parede.",
          "Tijolo cerâmico 6 furos, assentado na maior face: cerca de 25 a 30 unidades por m².",
          "Sempre acrescente de 5% a 10% ao total para perdas e recortes.",
        ],
      },
      {
        type: "paragraph",
        text: "Nossa equipe técnica pode ajudar a conferir a lista de material antes da compra — é só levar a planta ou as medidas da obra até a loja ou chamar no WhatsApp.",
      },
    ],
  },
  {
    slug: "como-calcular-argamassa-assentamento-reboco",
    title: "Como Calcular Argamassa de Assentamento e Reboco",
    excerpt:
      "Entenda a diferença entre argamassa de assentamento, reboco e revestimento, e como estimar quantos sacos você precisa.",
    category: "Cálculo de Materiais",
    publishedAt: "2026-06-24",
    readTimeMinutes: 5,
    coverImage: "/images/produtos/acabamento.svg",
    body: [
      {
        type: "paragraph",
        text: "Argamassa não é tudo igual — assentamento de alvenaria, reboco e assentamento de revestimento cerâmico usam traços e produtos diferentes. Errar aqui custa retrabalho.",
      },
      { type: "heading", level: 2, text: "Assentamento de alvenaria (tijolo/bloco)" },
      {
        type: "paragraph",
        text: "Um traço comum em obras residenciais é 1 parte de cimento para 8 partes de areia (com cal para melhorar a plasticidade). Para 1 m² de parede, considere de 20 a 25 kg de argamassa, variando com a espessura da junta.",
      },
      { type: "heading", level: 2, text: "Reboco (chapisco + emboço)" },
      {
        type: "list",
        ordered: true,
        items: [
          "Chapisco: camada fina, cimento e areia grossa, função de aderência — rende bastante material por saco.",
          "Emboço/reboco: camada de regularização, geralmente 1,5 a 2,5 cm de espessura.",
          "Estime de 25 a 30 kg de argamassa pronta por m² de parede rebocada, dependendo da espessura.",
        ],
      },
      { type: "heading", level: 2, text: "Assentamento de revestimento cerâmico" },
      {
        type: "paragraph",
        text: "Aqui o ideal é usar argamassa colante própria para cerâmica (tipo ACII ou ACIII), nunca massa comum. O rendimento varia com o tamanho da peça e da desempenadeira usada — como referência inicial, um saco de 20kg cobre de 4 a 5 m² em uma demão simples.",
      },
      {
        type: "callout",
        text: "Rendimento real varia com a técnica de aplicação, o tipo de base e a peça escolhida. Use estes números como ponto de partida e ajuste com uma pequena sobra de segurança.",
      },
    ],
  },
  {
    slug: "dicas-para-planejar-reforma-sem-desperdicio",
    title: "7 Dicas Para Planejar Sua Reforma Sem Desperdício",
    excerpt:
      "Pequenos cuidados no planejamento que evitam material parado, atraso de obra e gasto fora do orçamento.",
    category: "Reforma",
    publishedAt: "2026-07-08",
    readTimeMinutes: 4,
    coverImage: "/images/produtos/ferramentas.svg",
    body: [
      {
        type: "paragraph",
        text: "Reforma que dá certo começa antes da primeira marretada. Separamos 7 cuidados simples que fazem diferença no bolso e no cronograma.",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Meça tudo duas vezes antes de fechar a lista de compra — principalmente pisos e revestimentos, que têm perda por corte.",
          "Compre revestimento do mesmo lote sempre que possível, para evitar variação de tonalidade.",
          "Peça o orçamento completo de uma vez: material fracionado costuma sair mais caro que a compra fechada.",
          "Programe a entrega por etapa da obra — material de acabamento parado no canteiro por meses aumenta o risco de quebra e furto.",
          "Sempre acrescente uma margem de 5% a 10% nas quantidades de material de acabamento.",
          "Confirme a disponibilidade em estoque antes de fechar a data da equipe que vai executar o serviço.",
          "Guarde as notas fiscais e fichas técnicas dos materiais — facilita qualquer garantia futura.",
        ],
      },
      {
        type: "paragraph",
        text: "Se a reforma envolve estrutura, elétrica ou hidráulica, vale a pena levar o projeto (ou pelo menos as medidas) até a loja: nossa equipe técnica ajuda a conferir a lista antes da compra.",
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
