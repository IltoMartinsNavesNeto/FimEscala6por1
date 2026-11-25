# Área da empresa: como funciona e como manter

A área da empresa fica em `site/empresa/` e usa o **Supabase** (plano gratuito) para o banco de dados e o login com Google.

## Como a empresa paga (Pix direto na sua chave)

1. A empresa entra com o Google, cadastra nome e cidade e clica em **Pagar R$ 10 com Pix**.
2. A página gera um **QR Code** e um **Pix copia e cola** com o valor de R$ 10, o seu nome como recebedor e um **identificador** da empresa (começa com `NJ`).
3. A empresa paga no app do banco e clica em **Já fiz o Pix**: **o mês é liberado na hora**, e o painel mostra "Pix em conferência".
4. Você abre **`/empresa/admin.html`** (o link "Administração" aparece no topo quando você está logado) e confere no extrato:
   - **Confirmar**: o Pix chegou e o mês continua valendo.
   - **Recusar**: o Pix não chegou e o mês liberado é retirado.

Enquanto houver um aviso sem conferência, a empresa não consegue avisar outro Pix. Assim, no máximo 1 mês fica liberado sem conferência. Cada aviso soma 1 mês, a partir de hoje ou do fim do mês já pago. Sem o mês pago, a empresa continua vendo a equipe, mas não cadastra nem edita colaboradores. Essa regra fica no próprio banco (RLS), não só na tela.

> O identificador aparece nos detalhes do Pix recebido na maioria dos bancos. Se o seu banco não mostrar, confira pelo nome de quem pagou e pela data.

## O que está no projeto

| Arquivo | Para que serve |
| --- | --- |
| `supabase/migrations/20261125000000_area_empresa.sql` | Tabelas `empresas`, `colaboradores` e `pagamentos` e as regras de acesso |
| `supabase/migrations/20261125010000_pagamento_pix.sql` | Pedidos de Pix, administradores e as funções Confirmar/Recusar |
| `site/empresa/config.js` | Endereço do Supabase, chave pública, preço e dados do Pix |
| `site/empresa/index.html` e `empresa.js` | Login, cadastro da empresa, pagamento, equipe e espelho de cada colaborador |
| `site/empresa/admin.html` e `admin.js` | Conferência dos Pix e lista de empresas |
| `site/assets/pix-codigo.js` | Gera o Pix copia e cola (mesmo cálculo de `scripts/gerar-pix.js`) |
| `site/assets/vendor/qrcode.js` | Desenha o QR Code do Pix no navegador (núcleo do pacote `qrcode`, licença MIT) |
| `site/assets/motor-ponto.js` | O cálculo de escala e feriados, o mesmo do "Meu ponto" |

## Configuração (já feita)

- Projeto Supabase `csvtnaqyhxfhtbswiyav`, região São Paulo, com a primeira migração aplicada.
- Login com Google ativo. Redirecionamentos: `https://www.fimescala6x1.app.br/empresa/` e `http://127.0.0.1:8080/empresa/`.
- `site/empresa/config.js` preenchido.

## Falta fazer

1. No Supabase, **SQL Editor › New query**: cole todo o conteúdo de `supabase/migrations/20261125010000_pagamento_pix.sql` e clique em **Run**.
   - O fim do arquivo cadastra como administrador a conta Google `iltoneto444@gmail.com`. Se você entra com outra conta, troque o e-mail antes de rodar.
   - Essa conta precisa ter entrado no site pelo menos uma vez antes de rodar o SQL.
2. Faça commit e push. O site publica sozinho.

## Cuidados

- **Não é relógio de ponto.** A etapa 1 mostra a escala **planejada**. Registro de ponto oficial (batidas de entrada e saída) segue a Portaria MTP 671/2021 e fica para a etapa 2.
- **LGPD:** guardamos só nome, cargo e escala. A página pede para não cadastrar CPF nem dados de saúde. Antes de abrir para clientes, publique uma página de **Termos de uso e Privacidade** e coloque o link na tela de consentimento do Google.
- **Projeto pausado:** no plano gratuito, o Supabase pausa o projeto depois de 7 dias sem nenhum acesso. Se pausar, basta reativar no painel.
- **Imposto:** as mensalidades entram na sua conta como pessoa física. Se o volume crescer, vale conversar com um contador sobre abrir um MEI.
