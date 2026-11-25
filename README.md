# Nova Jornada: site sobre o fim da escala 6x1

Site público e independente que mostra ao trabalhador o que muda com o fim da escala 6x1 (Emenda Constitucional 141/2026): datas, folgas, salário e quanto passa a valer a hora. Tem um robô que verifica novidades oficiais todo dia e propõe as atualizações para você aprovar.

> "Nova Jornada" é um nome provisório. Troque em `site/dados.json` (`site.nome`), em `site/index.html` (título e tags `og:`) e na imagem `site/assets/og-image.png`.

Design original (canvas): https://claude.ai/artifact/McbiGDoVUyQb2i15GfVDCj

---

## Estrutura

```
FimEscala6x1/
├─ site/                    ← o que vai para a internet (HTML estático, sem build)
│  ├─ index.html            ← esqueleto da página e tags de compartilhamento
│  ├─ dados.json            ← TODO o conteúdo que muda: datas, divisores, textos, fontes
│  ├─ robots.txt
│  └─ assets/
│     ├─ app.js             ← monta a página a partir do dados.json + calculadora
│     ├─ styles.css
│     ├─ favicon.svg
│     ├─ og-image.png       ← imagem da prévia no WhatsApp/redes (1200×630)
│     └─ fonts/             ← Inter e Space Grotesk (licença OFL), hospedadas no próprio site
├─ robo/                    ← robô de atualização (Python, só biblioteca padrão)
│  ├─ monitor.py            ← verifica fontes oficiais e pede ao Claude a atualização
│  ├─ validar.py            ← valida a estrutura do dados.json
│  ├─ config.json           ← modelo, domínios permitidos, páginas e termos monitorados
│  ├─ prompt_sistema.md     ← regras que o Claude segue para editar o conteúdo
│  ├─ estado.json           ← memória do robô (hashes das páginas, atos do DOU já vistos)
│  ├─ .env.example          ← modelo de variáveis para rodar no seu computador
│  └─ testes/test_robo.py
├─ .github/workflows/
│  ├─ publicar.yml          ← publica site/ no GitHub Pages a cada mudança na main
│  └─ robo.yml              ← roda o robô todo dia às 08:17 (Brasília) e abre PR
└─ docs/
   ├─ PLANO.md              ← fases do projeto (empresa, agente) e decisões
   └─ FONTES.md             ← fontes oficiais e situação das regras em 25/11/2026
```

A ideia central: **o conteúdo fica separado do layout**. Atualizar o site é editar o `site/dados.json`. A contagem regressiva, os selos "Já aconteceu / Próxima etapa" e a fase "agora" se ajustam sozinhos pela data.

---

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

0. **Só na primeira vez:** os dois workflows vieram na pasta `workflows-github\` (a ferramenta que salvou o projeto não pode gravar dentro de `.github\workflows`). Mova-os para o lugar certo:
   ```powershell
   cd C:\Crescimento\FimEscala6x1
   New-Item -ItemType Directory -Force .github\workflows | Out-Null
   Move-Item workflows-github\*.yml .github\workflows\
   Remove-Item workflows-github
   ```
1. **Crie um repositório público** na sua conta pessoal do GitHub (ex.: `fim-escala-6x1`) e envie o projeto:
   ```powershell
   cd C:\Crescimento\FimEscala6x1
   git init -b main
   git add .
   git commit -m "Primeira versão do site"
   git remote add origin https://github.com/IltoMartinsNavesNeto/fim-escala-6x1.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Source:** escolha **GitHub Actions**.
3. **Settings → Actions → General → Workflow permissions:** marque **Read and write permissions** e **Allow GitHub Actions to create and approve pull requests**. Sem isso o robô não consegue abrir PR.
4. **Settings → Secrets and variables → Actions → New repository secret:**
   - `ANTHROPIC_API_KEY`: chave da API do Claude (https://platform.claude.com).
   - `INLABS_EMAIL` e `INLABS_SENHA` (opcional): cadastro gratuito em https://inlabs.in.gov.br para o robô ler o Diário Oficial completo todo dia.
5. **Actions → Publicar site → Run workflow.** O site fica em `https://iltomartinsnavesneto.github.io/fim-escala-6x1/`.
6. **Actions → Robô de atualização → Run workflow**, para testar o robô uma vez.

> Prefere repositório privado? GitHub Pages em repositório privado exige plano pago. A alternativa grátis é o **Cloudflare Pages**: conecte o repositório, deixe o comando de build vazio e use `site` como pasta de saída. Nesse caso, desative o `publicar.yml`.

### Domínio próprio (.com.br)

1. Registre no https://registro.br (cerca de R$ 40 por ano). Evite nomes que pareçam oficiais (com "gov", "ministério" etc.).
2. No GitHub: **Settings → Pages → Custom domain**, informe `www.seudominio.com.br` e depois marque **Enforce HTTPS**.
3. No DNS do registro.br:
   - `www` → **CNAME** → `iltomartinsnavesneto.github.io`
   - domínio sem www → registros **A** para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`
4. Em `site/index.html`, troque `SEU-DOMINIO` nas tags `og:url` e `og:image`.

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
- [ ] Domínio registrado e `SEU-DOMINIO` trocado no `index.html`
- [ ] Testar no celular e mandar o link para você mesmo no WhatsApp para ver a prévia
- [ ] Secrets configurados e robô rodado uma vez com sucesso
- [ ] Se possível, pedir para alguém do sindicato ou um advogado trabalhista revisar os textos
- [ ] Se for medir visitas, usar uma ferramenta sem cookies (não precisa de banner de consentimento)

## Cuidados

- O site é **informativo e independente**. O rodapé deixa claro que não tem vínculo com o governo e não substitui sindicato, advogado ou Ministério do Trabalho. Mantenha assim.
- **Nunca aprove um PR sem fonte oficial.** Uma liminar mal interpretada vira desinformação para milhares de pessoas.
- O **julgamento das ADIs 8.041 e 8.042 no STF** ainda não tinha data em 25/11/2026. Quando sair, as partes de 8h24 e das folgas compensadas podem mudar.
- A calculadora roda só no navegador. **Não guarde salário de ninguém.**
