# Behemoth — estado atual e caminho para produção

## O que já funciona (sem configurar nada)

```bash
npm install
npm run dev
```

Todos os módulos leem e gravam dados de verdade através das rotas de API:

| Módulo | Rota | O que faz |
| --- | --- | --- |
| Início | `/` | KPIs, gráfico e insights calculados sobre os lançamentos reais do período |
| Calendário | `/calendario` | Cria, conclui e exclui compromissos; grade mensal navegável |
| Equipe & Agentes | `/equipe` | Cadastra pessoas e agentes de IA com custo, meta, desempenho e ROI |
| Sala de Reunião | `/reunioes` | Notas, transcrição, resumo extrativo local e itens de ação |
| Relatório | `/financeiro` | CRUD de lançamentos, filtros, DRE por categoria e evolução mensal |
| Configurações | `/configuracoes` | Dados da empresa, integrações, histórico de alterações e reset |

## Automações — o que o sistema faz sozinho

Rodam a cada leitura e a cada escrita, em `src/lib/automations.ts`. São **idempotentes**:
cada item gerado tem id determinístico, então rodar mil vezes produz o mesmo resultado.
O que você apaga à mão entra em `dismissed` e nunca é recriado.

| Regra | O que dispara | O que acontece |
| --- | --- | --- |
| Lançamentos recorrentes | Lançamento marcado como "todo mês" | As ocorrências dos meses seguintes são criadas até o mês atual |
| Custo da equipe vira despesa | Cadastrar/alterar integrante ativo | Uma despesa "Custo da equipe e agentes" do mês, sempre com o valor atualizado |
| Itens de ação viram tarefas | Item de ação com prazo | Tarefa no calendário; concluir num lado conclui no outro |
| Reuniões no calendário | Criar/editar reunião | Compromisso na agenda, sincronizado com título e horário |
| Pagamento vira despesa | Marcar pagamento com valor como concluído | Lançamento de despesa; desmarcar remove |

Cada regra pode ser ligada ou desligada em **Configurações → Automações**.
Lançamentos gerados por automação são marcados com o selo `auto` e não aceitam edição manual —
você edita a origem (o integrante, o pagamento, o lançamento-mãe).

Verificação automatizada dessas regras:

```bash
npm run smoke
```

(`BASE_URL=http://localhost:3000 npm run smoke` com o servidor rodando; 14 asserções cobrindo
cascata, idempotência, exclusão definitiva, proteção de itens automáticos e validação.)

## Sincronização da interface

Nenhuma tela precisa de F5. Toda escrita bem-sucedida invalida os dados de todas as telas
montadas, e a revalidação também acontece ao voltar o foco para a aba, ao reconectar e a cada
45 segundos com a página visível. `BroadcastChannel` propaga a invalidação entre abas abertas.

### Onde os dados ficam

Em `.data/behemoth.json`, gravado pelo servidor da aplicação (fora do controle de versão).
Se o sistema de arquivos for somente leitura (ex.: serverless), a aplicação continua funcionando
em memória e `/api/health` sinaliza isso.

### Dados de demonstração

O workspace nasce com dados de exemplo para a interface não abrir vazia.
Em **Configurações → Zerar e usar dados reais** você apaga tudo e cadastra os números da sua empresa.
**Restaurar demonstração** volta ao conteúdo de exemplo.

## API

```
GET    /api/health                      diagnóstico e integrações configuradas
GET    /api/overview?period=            painel inicial consolidado
GET    /api/transactions?period=&kind=&category=
POST   /api/transactions
PATCH  /api/transactions/:id            edita valor, data, categoria e situação
DELETE /api/transactions/:id
GET    /api/team          POST /api/team          PATCH|DELETE /api/team/:id
GET    /api/meetings      POST /api/meetings      GET|PATCH|DELETE /api/meetings/:id
POST   /api/meetings/:id/summary        resumo extrativo local
GET    /api/events        POST /api/events        PATCH|DELETE /api/events/:id
GET    /api/settings      PATCH /api/settings     POST /api/settings/reset
       PATCH /api/settings aceita { automations: { ... } } para ligar/desligar regras
POST   /api/auth/login                  sessão de demonstração
```

`period` aceita `hoje`, `semana`, `mes` e `trimestre`.
Todo corpo de requisição é validado com Zod (`src/lib/schemas.ts`) — a resposta de erro traz
a mensagem em português e o campo que falhou.

## Próximas ativações (opcionais)

1. **Supabase** — criar o projeto, rodar `supabase/schema.sql` e preencher
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
   Trocar a implementação de `src/lib/store.ts` mantendo a mesma interface (`getDatabase`/`mutate`)
   é suficiente: nenhuma página ou rota precisa mudar.
2. **Autenticação real** — Supabase Auth substituindo `/api/auth/login`, com as políticas de RLS
   já escritas no schema.
3. **Google Calendar/Meet** — OAuth para sincronizar `/api/events`.
4. **WhatsApp Cloud API** — webhook para o agente de atendimento.
5. **Provedor de IA** — definir `AI_PROVIDER` e `AI_API_KEY`; o resumo de reunião usa a extração
   local como fallback quando nenhum provedor está configurado.

Nenhuma chave real está no código. `/api/health` e a tela de Configurações mostram exatamente
quais integrações já estão ativas.
