"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

const TOPICS = [
  {
    title: "Como registrar receitas e despesas",
    body: "Abra Relatório, clique em Novo lançamento e informe descrição, valor, tipo, categoria e data. Lançamentos marcados como Pendente não entram no resultado até serem confirmados.",
    href: "/financeiro",
  },
  {
    title: "Como os KPIs do Início são calculados",
    body: "Receita e custos somam apenas lançamentos confirmados dentro do período selecionado. A variação compara com o período anterior equivalente. O lucro é receita menos custos e a margem é lucro dividido pela receita.",
    href: "/",
  },
  {
    title: "Cadastrar pessoas e agentes de IA",
    body: "Em Equipe & Agentes você cadastra integrantes com custo mensal, desempenho, meta e ROI. O custo total do time aparece no painel inicial.",
    href: "/equipe",
  },
  {
    title: "Gerar o resumo de uma reunião",
    body: "Na Sala de Reunião, escreva as notas ou cole a transcrição e clique em Gerar resumo. O resumo é extraído localmente das frases com decisões, prazos e responsáveis — sem enviar dados para fora.",
    href: "/reunioes",
  },
  {
    title: "Agendar compromissos",
    body: "No Calendário, escolha o dia e clique em Novo compromisso. Reuniões, tarefas, pagamentos e eventos aparecem no dia e na agenda do painel inicial.",
    href: "/calendario",
  },
  {
    title: "Começar com os dados da minha empresa",
    body: "Em Configurações, use Zerar e usar dados reais para apagar o conteúdo de demonstração e cadastrar seus próprios números.",
    href: "/configuracoes",
  },
  {
    title: "Onde os dados ficam guardados",
    body: "Tudo é gravado pelo servidor da aplicação em .data/behemoth.json. Configurações mostra se a gravação está ativa e quais integrações externas já foram conectadas.",
    href: "/configuracoes",
  },
];

export default function AjudaPage() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? TOPICS.filter((topic) => `${topic.title} ${topic.body}`.toLowerCase().includes(normalized))
    : TOPICS;

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">HELP CENTER</p>
          <h1 className="page-title">Como usar o Behemoth</h1>
          <p className="subtitle">Busque pelo que você quer fazer.</p>
        </div>
      </div>

      <div className="field section" style={{ maxWidth: 420 }}>
        <label htmlFor="busca">Buscar ajuda</label>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: "#a0a9b9" }} />
          <input
            id="busca"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="lançamento, reunião, agente..."
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>

      <section className="section split-even">
        {results.map((topic) => (
          <Link className="card" key={topic.title} href={topic.href}>
            <h2 style={{ font: "600 15px var(--font-display)", margin: 0 }}>{topic.title}</h2>
            <p className="small muted" style={{ lineHeight: 1.6, marginTop: 10 }}>
              {topic.body}
            </p>
          </Link>
        ))}
        {!results.length && <p className="empty">Nada encontrado para “{query}”.</p>}
      </section>
    </div>
  );
}
