# Plano do projeto

## Objetivo

Um site, e depois um agente, que mostra o que muda com o fim da escala 6x1 para o **empregado** e para a **empresa**, sempre de acordo com as fontes oficiais.

## Fases

| Fase | O que entrega | Situação |
| --- | --- | --- |
| 1. Página do empregado | O que muda, linha do tempo, calculadora do valor da hora, casos específicos, o que fazer se a empresa não cumprir | **Pronta** (`site/`) |
| 2. Robô de atualização | Verificação diária de fontes oficiais + proposta de atualização via Pull Request | **Pronto**, falta ativar (secrets no GitHub) |
| 3. Lançamento | Domínio, prévia no WhatsApp, divulgação | A fazer (ver checklist no README) |
| 4. Lado da empresa | Simulador de quadro de pessoal (44h × 42h × 40h), gerador de escala 5x2 com rodízio de folgas e domingos, checklist de prazos | A fazer |
| 5. Agente | Chat que responde dúvidas usando o Claude, com ferramentas que fazem as contas | A fazer |

## Arquitetura atual

```
fontes oficiais ──► robô (GitHub Actions, diário) ──► Claude propõe edição no dados.json
                                                              │
                                                              ▼
                                         Pull Request ──► você revisa e faz o merge
                                                              │
                                                              ▼
                         publicar.yml valida o JSON ──► GitHub Pages (site estático)
```

- **Site estático** (HTML + CSS + JS puro, sem build): barato, rápido, aguenta pico de acesso sem servidor.
- **`dados.json` é a "tabela de regras"**: `etapas` guarda início, horas semanais, folgas e divisor de cada fase. A calculadora e a contagem regressiva leem dali. É o embrião do motor de regras da fase 4.
- **Revisão humana obrigatória**: o robô nunca publica sozinho.

## Fase 4: lado da empresa (ideias)

- **Simulador de quadro:** horário de funcionamento × pessoas por turno → horas-pessoa por semana ÷ jornada máxima de cada etapa → quantos funcionários são necessários e quanto custa a diferença (salário + encargos informados pelo usuário).
- **Gerador de escala 5x2:** distribui as duas folgas, com pelo menos um domingo no rodízio, e mostra a escala do mês.
- **Checklist de prazos:** 16/12/2026, 90 dias de fiscalização orientativa, revisão de acordos coletivos, 16/12/2027.
- **Onde rodar as contas:** dá para começar tudo no navegador (JS), lendo `etapas` do `dados.json`. Se precisar de backend (salvar simulações, API para o agente), um Spring Boot com a mesma tabela de regras versionada por data:
  ```java
  record RegraJornada(LocalDate inicio, int horasSemanais, int folgas, int divisor) {}
  ```

## Fase 5: agente

- Chat em cima da API do Claude (SDK oficial em Java, se o backend for Spring Boot).
- **O modelo não faz conta**: ele chama ferramentas (`regraVigente(data)`, `calcularValorHora(salario)`, `simularQuadro(...)`) que usam o motor de regras e explica o resultado.
- Base de conhecimento pequena (EC 141, Decreto 13.173, portarias, resumo da liminar). Cabe no prompt, então não precisa de banco vetorial no começo.
- Limites do agente: só responde sobre jornada e escala, cita a regra usada e encaminha casos específicos para RH, sindicato ou advogado.

## Decisões tomadas

- Público aberto; primeira fase só para o empregado.
- Visual próprio, **sem** identidade do governo, e aviso de site independente no rodapé.
- Fontes hospedadas no próprio site (sem requisições ao Google).
- Calculadora 100% no navegador: nenhum dado pessoal sai do aparelho.

## Riscos e cuidados

- **Decisão do STF** pode mudar a transição (8h24, folgas compensadas). O robô acompanha as ADIs 8.041 e 8.042.
- **Normas do MTE para regimes especiais** ainda podem sair. Os casos 12x36 e turnos podem precisar de ajuste.
- **Tema politizado:** manter tom neutro e informativo, só fatos e regras.
