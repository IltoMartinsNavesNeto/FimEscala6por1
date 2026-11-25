# Operação do projeto

Instruções para rodar, publicar e manter o site e o robô. O README fala só do projeto.


## Rodar no seu computador

No PowerShell:

```powershell
cd C:\Crescimento\FimEscala6x1
py -m http.server 8080 -d site
```

Abra http://localhost:8080. Dar dois cliques no `index.html` não funciona, porque o navegador bloqueia a leitura do `dados.json` fora de um servidor. Também dá para usar a extensão Live Server do VS Code.

**Testar outras datas:** http://localhost:8080/?hoje=2026-12-16 ou http://localhost:8080/?hoje=2028-01-10

---

## Atualizar à mão

1. Edite `site/dados.json`.
2. Valide: `py robo\validar.py`
3. Faça commit e push. O workflow **Publicar site** valida de novo e publica em cerca de 1 minuto. Se o JSON estiver quebrado, a publicação para e o site antigo continua no ar.

---

## Publicar na internet (GitHub Pages, grátis)

1. **Crie um repositório público** na sua conta pessoal do GitHub (`FimEscala6por1`) e envie o projeto:
   ```powershell
   cd C:\Crescimento\FimEscala6x1
   git init -b main
   git add .
   git commit -m "Primeira versão do site"
   git remote add origin https://github.com/IltoMartinsNavesNeto/FimEscala6por1.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Source:** escolha **GitHub Actions**.
3. **Settings → Actions → General → Workflow permissions:** marque **Read and write permissions** e **Allow GitHub Actions to create and approve pull requests**. Sem isso o robô não consegue abrir PR.
4. **Settings → Secrets and variables → Actions → New repository secret:**
   - `ANTHROPIC_API_KEY`: chave da API do Claude (https://platform.claude.com).
   - `INLABS_EMAIL` e `INLABS_SENHA` (opcional): cadastro gratuito em https://inlabs.in.gov.br para o robô ler o Diário Oficial completo todo dia.
5. **Actions → Publicar site → Run workflow.** O site fica em `https://www.fimescala6x1.app.br` (ou `https://iltomartinsnavesneto.github.io/FimEscala6por1/` antes do domínio).
6. **Actions → Robô de atualização → Run workflow**, para testar o robô uma vez.

> Prefere repositório privado? GitHub Pages em repositório privado exige plano pago. A alternativa grátis é o **Cloudflare Pages**: conecte o repositório, deixe o comando de build vazio e use `site` como pasta de saída. Nesse caso, desative o `publicar.yml`.

### Domínio próprio (fimescala6x1.app.br)

1. Registre no https://registro.br (cerca de R$ 40 por ano). Evite nomes que pareçam oficiais (com "gov", "ministério" etc.).
2. No GitHub: **Settings → Pages → Custom domain**, informe `www.fimescala6x1.app.br` e depois marque **Enforce HTTPS**.
3. No DNS do registro.br:
   - `www` → **CNAME** → `iltomartinsnavesneto.github.io`
   - domínio sem www → registros **A** para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`
4. As tags `og:url` e `og:image` em `site/index.html` já apontam para `https://www.fimescala6x1.app.br/`.

---

## O robô de atualização

**Quando roda:** todo dia às 08:17 (horário de Brasília), ou quando você clicar em *Run workflow*.

**O que verifica:**
1. **Páginas oficiais** listadas em `robo/config.json` (texto da EC 141 no Planalto e as ADIs 8.041 e 8.042 no STF). Se o conteúdo mudar, isso vira um sinal.
2. **Diário Oficial da União** (se o INLABS estiver configurado): baixa a Seção 1 e as edições extras de hoje e de ontem e procura atos sobre a EC 141, o Decreto 13.173, a escala 6x1/5x2 e atos do Ministério do Trabalho sobre jornada e repouso.
3. **Claude com busca na web**, limitada a domínios oficiais (gov.br, DOU, STF, Congresso, EBC…). Ele recebe o `dados.json` atual e os sinais encontrados, verifica o que saiu desde a última atualização e, se houver algo que torne o site desatualizado, devolve o JSON corrigido.

**O que você recebe:** um **Pull Request** com o resumo do que mudou, as fontes oficiais, a lista de diferenças no `dados.json` e o que ficou "a confirmar". O GitHub te avisa por e-mail e no app.

- **Aprovar:** confira as fontes e faça o *merge*. O site é publicado sozinho.
- **Recusar:** feche o PR. O robô não repete aquela proposta sem fato oficial novo.
- Enquanto houver um PR do robô aberto, ele não abre outro.

**Proteções:** o JSON proposto passa pelo `validar.py` (estrutura, datas, links https, sem HTML). Se não passar, nenhuma proposta é criada e o workflow falha, e o GitHub te avisa. Nada vai ao ar sem o seu merge.

**Custo:** a busca na web da API do Claude custa US$ 10 por mil buscas. Com no máximo 6 buscas por dia, isso dá até uns US$ 1,80 por mês, mais os tokens. Acompanhe o gasto no Console. Para economizar, troque `"modelo"` em `robo/config.json` por `claude-haiku-5-5` ou diminua `max_buscas`.

### Rodar o robô no seu computador

```powershell
copy robo\.env.example robo\.env      # depois preencha a chave no arquivo
py robo\monitor.py --sem-ia           # só verificações, sem gastar API
py robo\monitor.py --seco             # roda tudo e mostra a proposta, sem gravar nada
py -m unittest discover -s robo\testes -v
```

---

## Checklist de lançamento

- [ ] Nome definitivo do site (e imagem `og-image.png` atualizada)
- [x] Domínio `fimescala6x1.app.br` registrado e trocado no `index.html`
- [ ] DNS no registro.br e domínio verificado no GitHub Pages
- [ ] Testar no celular e mandar o link para você mesmo no WhatsApp para ver a prévia
- [ ] Secrets configurados e robô rodado uma vez com sucesso
- [ ] Se possível, pedir para alguém do sindicato ou um advogado trabalhista revisar os textos
- [ ] Se for medir visitas, usar uma ferramenta sem cookies (não precisa de banner de consentimento)

