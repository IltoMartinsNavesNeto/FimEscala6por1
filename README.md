# Nova Jornada: o fim da escala 6x1 explicado para quem trabalha

**https://www.fimescala6x1.app.br**

Site público e independente que mostra ao trabalhador o que muda com o fim da escala 6x1 (Emenda Constitucional 141/2026): quando cada etapa começa, quantas folgas passam a valer, o que acontece com o salário e quanto passa a valer a hora de trabalho.

O conteúdo acompanha as fontes oficiais. Um robô verifica todo dia se saiu alguma norma, portaria ou decisão nova e propõe a atualização, que só vai ao ar depois de revisada por uma pessoa.

---

## O que o site mostra

- **O que muda:** jornada semanal, folgas e regras de transição, em linguagem simples.
- **Linha do tempo:** as etapas da mudança, com contagem regressiva para a próxima e selos de "Já aconteceu" e "Próxima etapa".
- **Calculadora do valor da hora:** a partir do salário, mostra quanto vale a hora em cada etapa. Roda só no navegador, e nenhum dado sai do aparelho.
- **Meu ponto:** a pessoa informa escala (5x2, 6x1, 12x36 ou personalizada), horário e cidade e vê o espelho de ponto do mês ou o resumo do ano, com folgas, feriados nacionais, estaduais e municipais, e as semanas que passam do limite de horas ou ficam sem as folgas exigidas.
- **Meu caso:** respostas para situações específicas, como 12x36, turnos ininterruptos, folgas que mudam toda semana e pedidos para trabalhar na folga.
- **Se não cumprirem:** o que o trabalhador pode fazer e a quem recorrer.

## Como funciona

```
fontes oficiais ──► robô diário ──► Claude propõe a edição do conteúdo
                                              │
                                              ▼
                                  Pull Request ──► revisão humana e merge
                                              │
                                              ▼
                          validação do conteúdo ──► site publicado
```

- **Conteúdo separado do layout.** Tudo o que muda (datas, divisores do salário-hora, textos e fontes) fica em um único arquivo, `site/dados.json`. A página, a calculadora e a contagem regressiva leem dali e se ajustam sozinhas pela data.
- **Site estático.** HTML, CSS e JavaScript puro, sem servidor e sem build. Carrega rápido e aguenta picos de acesso.
- **Robô de atualização.** Acompanha o texto da EC 141 no Planalto, as ações no STF (ADIs 8.041 e 8.042), o Diário Oficial da União e notícias de órgãos oficiais. Quando encontra algo que deixa o site desatualizado, abre um Pull Request com o resumo, as fontes e as diferenças.
- **Nada vai ao ar sozinho.** Toda proposta passa por validação automática e precisa de aprovação humana.

## Princípios

- **Informativo e independente.** Sem vínculo com o governo e sem identidade visual oficial. Não substitui sindicato, advogado ou Ministério do Trabalho.
- **Só fonte oficial.** Toda informação aponta para a norma ou o órgão de onde veio. Uma liminar mal interpretada vira desinformação para milhares de pessoas.
- **Tom neutro.** O tema é politizado. O site fica nos fatos e nas regras.
- **Privacidade.** Sem cookies de rastreamento, fontes hospedadas no próprio site e nenhum salário guardado. As escolhas do "Meu ponto" ficam só no aparelho; para listar as cidades, o site consulta o IBGE enviando apenas a sigla do estado.

## Estrutura

```
FimEscala6x1/
├─ site/        ← o site publicado: página, conteúdo (dados.json), estilos, fontes e imagens
├─ robo/        ← robô de atualização: monitor, validação, regras para o Claude e testes
├─ scripts/     ← gerador do código Pix e do QR Code de apoio
├─ supabase/    ← banco da área da empresa: tabelas, regras de acesso e pagamento por Pix
├─ .github/workflows/ ← automações de publicação e do robô diário
└─ docs/
   ├─ PLANO.md      ← fases do projeto e decisões
   ├─ FONTES.md     ← fontes oficiais e situação das regras
   ├─ OPERACAO.md   ← como rodar, publicar e manter
   └─ EMPRESA.md    ← como colocar no ar a área da empresa
```

## Próximos passos

| Fase | Situação |
| --- | --- |
| 1. Página do empregado | Pronta |
| 2. Robô de atualização | Pronto |
| 3. Lançamento (domínio, prévia no WhatsApp, divulgação) | Em andamento |
| 4. Área da empresa (R$ 10/mês): colaboradores com escala, visão da equipe e espelho de cada um. Depois: batida de ponto real | Etapa 1 pronta, falta rodar o SQL do Pix (docs/EMPRESA.md) |
| 5. Agente: chat que tira dúvidas usando as regras do site | A fazer |

Detalhes em [docs/PLANO.md](docs/PLANO.md).

## Situação legal

O julgamento das ADIs 8.041 e 8.042 no STF ainda não tinha data em 25/11/2026. Quando sair, as regras de transição (8h24 diárias e folgas compensadas) podem mudar, e o site será atualizado. Veja [docs/FONTES.md](docs/FONTES.md).
