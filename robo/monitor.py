"""Robô de atualização do site Nova Jornada.

O que ele faz, a cada execução:
  1. Verifica se páginas oficiais monitoradas mudaram (texto da EC 141, processos no STF).
  2. Se houver credenciais do INLABS, procura atos novos no Diário Oficial da União.
  3. Pede ao Claude (com busca na web limitada a sites oficiais) para checar novidades
     desde a última atualização do site e, se houver, devolver o dados.json atualizado.
  4. Valida o JSON proposto e prepara o texto do Pull Request.
  Quem abre o PR é o workflow (.github/workflows/robo.yml). Nada vai ao ar sem a sua aprovação.

Uso local:
    python robo/monitor.py --seco       # roda tudo, mas não grava arquivos
    python robo/monitor.py --sem-ia     # só as verificações sem o Claude (não gasta API)
    python robo/monitor.py              # roda e grava (é o que o GitHub Actions usa)

Variáveis de ambiente (ou arquivo robo/.env):
    ANTHROPIC_API_KEY   obrigatória para a etapa 3
    INLABS_EMAIL        opcional (cadastro gratuito em https://inlabs.in.gov.br)
    INLABS_SENHA        opcional
"""
import argparse
import hashlib
import html
import http.cookiejar
import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validar import validar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PASTA_ROBO = RAIZ / "robo"
ARQ_DADOS = RAIZ / "site" / "dados.json"
ARQ_ESTADO = PASTA_ROBO / "estado.json"
ARQ_CONFIG = PASTA_ROBO / "config.json"
ARQ_PROMPT = PASTA_ROBO / "prompt_sistema.md"
ARQ_RECUSADOS = PASTA_ROBO / "recusados.json"  # gerado pelo workflow
PASTA_SAIDA = PASTA_ROBO / "saida"

FUSO_BR = timezone(timedelta(hours=-3))
UA = "Mozilla/5.0 (compatible; NovaJornadaBot/1.0; +https://github.com/)"
MARCA_INICIO, MARCA_FIM = "<<<JSON", "JSON>>>"


# ---------------------------------------------------------------- utilidades
def log(msg):
    print(f"[robô] {msg}", flush=True)


def hoje_br():
    return datetime.now(FUSO_BR).date()


def ler_json(caminho, padrao=None):
    try:
        return json.loads(Path(caminho).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return padrao


def gravar_json(caminho, dados):
    Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    Path(caminho).write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def carregar_env():
    """Lê robo/.env (CHAVE=valor) sem sobrescrever o que já estiver no ambiente."""
    arq = PASTA_ROBO / ".env"
    if not arq.exists():
        return
    for linha in arq.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def normalizar(texto):
    """Minúsculas, sem acentos e sem º/°, para comparar termos."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("º", "").replace("°", "").replace("n.", "n")
    return re.sub(r"\s+", " ", t)


def baixar(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        bruto = r.read()
        charset = r.headers.get_content_charset() or "utf-8"
    try:
        return bruto.decode(charset, errors="replace")
    except LookupError:
        return bruto.decode("utf-8", errors="replace")


class _Texto(HTMLParser):
    def __init__(self):
        super().__init__()
        self.partes, self._ignorar = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._ignorar += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._ignorar:
            self._ignorar -= 1

    def handle_data(self, data):
        if not self._ignorar:
            self.partes.append(data)


def html_para_texto(conteudo):
    p = _Texto()
    p.feed(conteudo)
    return re.sub(r"\s+", " ", " ".join(p.partes)).strip()


# ------------------------------------------------- 1. páginas monitoradas
def verificar_paginas(config, estado):
    sinais = []
    vistas = estado.setdefault("paginas", {})
    for pagina in config.get("paginas_monitoradas", []):
        url, nome = pagina["url"], pagina["nome"]
        try:
            texto = html_para_texto(baixar(url))
        except Exception as e:  # rede, bloqueio, timeout: não interrompe o robô
            log(f"aviso: não consegui ler {nome} ({e})")
            continue
        if len(texto) < 200:
            log(f"aviso: {nome} veio quase vazia; ignorando nesta rodada")
            continue
        h = hashlib.sha256(texto.encode("utf-8")).hexdigest()
        anterior = vistas.get(url, {}).get("hash")
        if anterior and anterior != h:
            log(f"mudou: {nome}")
            sinais.append({"tipo": "pagina", "nome": nome, "url": url, "trecho": texto[:12000]})
        elif not anterior:
            log(f"primeira leitura de {nome}; guardando referência")
        vistas[url] = {"hash": h, "verificado_em": hoje_br().isoformat()}
    return sinais


# --------------------------------------------------- 2. Diário Oficial (INLABS)
def _inlabs_sessao(email, senha):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    corpo = urllib.parse.urlencode({"email": email, "password": senha}).encode()
    req = urllib.request.Request(
        "https://inlabs.in.gov.br/logar.php", data=corpo,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA,
                 "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
    opener.open(req, timeout=60).read()
    cookie = next((c.value for c in jar if c.name == "inlabs_session_cookie"), None)
    if not cookie:
        raise RuntimeError("login no INLABS falhou (confira INLABS_EMAIL e INLABS_SENHA)")
    return opener, cookie


def _inlabs_zip(opener, cookie, dia, secao):
    url = f"https://inlabs.in.gov.br/index.php?p={dia}&dl={dia}-{secao}.zip"
    req = urllib.request.Request(url, headers={
        "Cookie": f"inlabs_session_cookie={cookie}", "origem": "736372697074", "User-Agent": UA})
    try:
        with opener.open(req, timeout=180) as r:
            dados = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return dados if zipfile.is_zipfile(io.BytesIO(dados)) else None


def _artigos(zip_bytes):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        for nome in z.namelist():
            if not nome.lower().endswith(".xml"):
                continue
            try:
                raiz = ET.fromstring(z.read(nome))
            except ET.ParseError:
                continue
            for art in raiz.iter("article"):
                bruto = " ".join(art.itertext())
                texto = html.unescape(re.sub(r"<[^>]+>", " ", bruto))
                texto = re.sub(r"\s+", " ", texto).strip()
                ident = art.findtext(".//Identifica") or art.get("name") or ""
                yield {
                    "id": art.get("id") or hashlib.sha1(texto[:500].encode()).hexdigest()[:16],
                    "titulo": re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", ident))).strip(),
                    "orgao": art.get("artCategory", ""),
                    "tipo": art.get("artType", ""),
                    "data": art.get("pubDate", ""),
                    "secao": art.get("pubName", ""),
                    "pagina": art.get("numberPage") or art.get("pdfPage", ""),
                    "texto": texto,
                }


def verificar_dou(config, estado):
    email, senha = os.environ.get("INLABS_EMAIL"), os.environ.get("INLABS_SENHA")
    if not (email and senha):
        log("INLABS não configurado; pulando a leitura do Diário Oficial")
        return []
    cfg = config["dou"]
    fortes = [normalizar(t) for t in cfg["termos_fortes"]]
    orgao = normalizar(cfg["orgao"])
    do_orgao = [normalizar(t) for t in cfg["termos_do_orgao"]]
    vistos = set(estado.setdefault("dou_vistos", []))
    sinais = []
    try:
        opener, cookie = _inlabs_sessao(email, senha)
    except Exception as e:
        log(f"aviso: {e}")
        return []
    for atraso in range(cfg.get("dias_para_tras", 1), -1, -1):
        dia = (hoje_br() - timedelta(days=atraso)).isoformat()
        for secao in cfg["secoes"]:
            try:
                z = _inlabs_zip(opener, cookie, dia, secao)
            except Exception as e:
                log(f"aviso: falha ao baixar DOU {dia} {secao}: {e}")
                continue
            if not z:
                continue
            for art in _artigos(z):
                if art["id"] in vistos:
                    continue
                t = normalizar(art["titulo"] + " " + art["texto"])
                achou = any(f in t for f in fortes) or (
                    orgao in normalizar(art["orgao"]) and any(x in t for x in do_orgao))
                if achou:
                    vistos.add(art["id"])
                    log(f"DOU: {art['tipo']} {art['titulo'][:80]}")
                    art["trecho"] = art.pop("texto")[:6000]
                    art["tipo_sinal"] = "dou"
                    sinais.append(art)
    estado["dou_vistos"] = sorted(vistos)[-1000:]
    return sinais


# ------------------------------------------------------------ 3. Claude
def montar_mensagem(dados, sinais, recusados):
    partes = [
        f"Hoje é {hoje_br().strftime('%d/%m/%Y')}.",
        f"A última atualização do site foi em {dados['atualizadoEm']}. "
        "Pesquise novidades oficiais publicadas desde essa data (inclusive) sobre o fim da escala 6x1: "
        "EC 141/2026, Decreto 13.173/2026, portarias e guias do Ministério do Trabalho e Emprego, "
        "e as ADIs 8.041 e 8.042 no STF (liminar do ministro Flávio Dino, julgamento no plenário).",
        "",
        "## dados.json atual",
        "```json",
        json.dumps(dados, ensure_ascii=False, indent=2),
        "```",
    ]
    if sinais:
        partes += ["", "## Sinais encontrados pelo robô nesta rodada",
                   "Leia com atenção: são trechos de páginas oficiais que mudaram ou atos novos do Diário Oficial. "
                   "Confirme o que for relevante antes de alterar o site.", "```json",
                   json.dumps(sinais, ensure_ascii=False, indent=2)[:40000], "```"]
    if recusados:
        partes += ["", "## Propostas recusadas recentemente (não repita sem fato novo)",
                   *[f"- {r.get('title', '')}" for r in recusados]]
    return "\n".join(partes)


def chamar_claude(config, sistema, mensagem):
    chave = os.environ.get("ANTHROPIC_API_KEY")
    if not chave:
        raise RuntimeError("ANTHROPIC_API_KEY não definida")
    ferramenta = {
        "type": "web_search_20260209",  # versão atual da busca na web (Sonnet 5.5)
        "name": "web_search",
        "max_uses": config.get("max_buscas", 6),
        "allowed_domains": config["dominios_permitidos"],
        "user_location": {"type": "approximate", "country": "BR", "timezone": "America/Sao_Paulo"},
    }
    mensagens = [{"role": "user", "content": mensagem}]
    textos, uso_total = [], {"input_tokens": 0, "output_tokens": 0, "buscas": 0}

    for _ in range(6):  # a API pode pausar buscas longas (pause_turn)
        corpo = {
            "model": config["modelo"],
            "max_tokens": config.get("max_tokens", 12000),
            "system": sistema,
            "messages": mensagens,
            "tools": [ferramenta],
        }
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(corpo).encode("utf-8"),
            headers={"x-api-key": chave, "anthropic-version": config.get("versao_api", "2026-10-21"),
                     "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                resp = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"API do Claude respondeu {e.code}: {e.read().decode('utf-8', 'replace')[:800]}")

        uso = resp.get("usage", {})
        uso_total["input_tokens"] += uso.get("input_tokens", 0)
        uso_total["output_tokens"] += uso.get("output_tokens", 0)
        uso_total["buscas"] += uso.get("server_tool_use", {}).get("web_search_requests", 0)
        textos += [b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text"]

        if resp.get("stop_reason") == "pause_turn":
            mensagens.append({"role": "assistant", "content": resp["content"]})
            continue
        break

    log(f"uso da API: {uso_total['input_tokens']} tokens de entrada, "
        f"{uso_total['output_tokens']} de saída, {uso_total['buscas']} busca(s)")
    return extrair_resposta("".join(textos))


def extrair_resposta(texto):
    ini = texto.rfind(MARCA_INICIO)
    fim = texto.rfind(MARCA_FIM)
    if ini == -1 or fim == -1 or fim < ini:
        raise RuntimeError("a resposta do Claude não veio no formato combinado:\n" + texto[-1500:])
    bloco = texto[ini + len(MARCA_INICIO):fim].strip()
    bloco = re.sub(r"^```(?:json)?\s*|\s*```$", "", bloco)
    return json.loads(bloco)


# --------------------------------------------------------- 4. comparar e saída
def diferencas(antes, depois, caminho=""):
    """Lista legível do que mudou entre dois JSONs (para o texto do PR)."""
    linhas = []
    if isinstance(antes, dict) and isinstance(depois, dict):
        for k in sorted(set(antes) | set(depois), key=str):
            c = f"{caminho}.{k}" if caminho else k
            if k not in antes:
                linhas.append(f"+ `{c}` adicionado")
            elif k not in depois:
                linhas.append(f"- `{c}` removido")
            else:
                linhas += diferencas(antes[k], depois[k], c)
    elif isinstance(antes, list) and isinstance(depois, list):
        for i in range(max(len(antes), len(depois))):
            c = f"{caminho}[{i}]"
            if i >= len(antes):
                linhas.append(f"+ `{c}`: {json.dumps(depois[i], ensure_ascii=False)[:300]}")
            elif i >= len(depois):
                linhas.append(f"- `{c}`: {json.dumps(antes[i], ensure_ascii=False)[:300]}")
            else:
                linhas += diferencas(antes[i], depois[i], c)
    elif antes != depois:
        linhas.append(f"~ `{caminho}`: {json.dumps(antes, ensure_ascii=False)[:200]} → "
                      f"{json.dumps(depois, ensure_ascii=False)[:200]}")
    return linhas


def texto_pr(resposta, diffs, sinais):
    def lista(itens):
        return "\n".join(f"- {i}" for i in itens) or "- (nenhum)"

    fontes = [f"- [{f.get('titulo', f.get('url'))}]({f.get('url')}) ({f.get('data', 's/ data')})"
              for f in resposta.get("fontes", []) if str(f.get("url", "")).startswith("https://")]
    partes = [
        "## O que mudou", resposta.get("resumo", ""), "",
        "## Alterações propostas", lista(resposta.get("alteracoes", [])), "",
        "## Fontes", "\n".join(fontes) or "- (nenhuma informada)", "",
    ]
    if resposta.get("a_confirmar"):
        partes += ["## A confirmar (fonte não oficial, não entrou no site)", lista(resposta["a_confirmar"]), ""]
    partes += ["## Diferenças em `site/dados.json`", lista(diffs[:80]), ""]
    if sinais:
        partes += ["## Sinais que o robô detectou",
                   lista([f"{s.get('nome') or s.get('tipo', '')} {s.get('titulo', '')} {s.get('url', '')}".strip()
                          for s in sinais]), ""]
    partes += ["---",
               "Proposta gerada automaticamente pelo robô com o Claude. Confira as fontes e o diff "
               "antes de aprovar: ao fazer o merge, o site é publicado."]
    return "\n".join(partes)


def saida_github(chave, valor):
    arq = os.environ.get("GITHUB_OUTPUT")
    if arq:
        with open(arq, "a", encoding="utf-8") as f:
            f.write(f"{chave}={valor}\n")


# ------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Robô de atualização do site Nova Jornada")
    ap.add_argument("--seco", action="store_true", help="não grava nenhum arquivo")
    ap.add_argument("--sem-ia", action="store_true", help="não chama o Claude")
    args = ap.parse_args()

    carregar_env()
    resultado = {"abrir_pr": False, "estado_gravado": False, "titulo": ""}
    try:
        return executar(args, resultado)
    except Exception as e:  # mostra o motivo no resumo da execução do GitHub
        msg = " ".join(str(e).split())[:900]
        print(f"::error title=Robô de atualização::{msg}")
        raise
    finally:
        saida_github("abrir_pr", "true" if resultado["abrir_pr"] else "false")
        saida_github("estado_gravado", "true" if resultado["estado_gravado"] else "false")
        saida_github("titulo", resultado["titulo"])


def executar(args, resultado):
    def salvar_estado():
        if not args.seco and estado_mudou:
            gravar_json(ARQ_ESTADO, estado)
            resultado["estado_gravado"] = True

    config = ler_json(ARQ_CONFIG)
    dados = ler_json(ARQ_DADOS)
    estado = ler_json(ARQ_ESTADO, {"paginas": {}, "dou_vistos": []})
    estado_antes = json.dumps(estado, sort_keys=True)
    recusados = ler_json(ARQ_RECUSADOS, []) or []
    recusados = [r for r in recusados if not r.get("mergedAt")][:10]

    erros = validar(dados)
    if erros:
        log("o dados.json atual tem problemas; corrija antes de rodar o robô:")
        for e in erros:
            log(f"  - {e}")
        print("::error title=dados.json com problemas::" + "; ".join(erros)[:900])
        return 1

    sinais = verificar_paginas(config, estado) + verificar_dou(config, estado)
    estado_mudou = json.dumps(estado, sort_keys=True) != estado_antes

    if args.sem_ia:
        log(f"modo --sem-ia: {len(sinais)} sinal(is) encontrado(s)")
        salvar_estado()
        return 0

    resposta = chamar_claude(config, ARQ_PROMPT.read_text(encoding="utf-8"),
                             montar_mensagem(dados, sinais, recusados))
    log(f"resumo: {resposta.get('resumo', '')}")

    novos = resposta.get("dados") if resposta.get("ha_novidade") else None
    if not isinstance(novos, dict):
        log("sem novidade que mude o site")
        salvar_estado()
        return 0

    novos["versao"] = dados["versao"]
    novos["atualizadoEm"] = dados["atualizadoEm"]
    diffs = diferencas(dados, novos)
    if not diffs:
        log("o Claude apontou novidade, mas o JSON veio igual; nada a propor")
        salvar_estado()
        return 0

    novos["atualizadoEm"] = hoje_br().isoformat()
    erros = validar(novos)
    if erros:
        log("o JSON proposto não passou na validação; nada será proposto:")
        for e in erros:
            log(f"  - {e}")
        return 1

    titulo = re.sub(r"\s+", " ", str(resposta.get("titulo") or "Atualização de conteúdo"))[:70]
    corpo = texto_pr(resposta, diffs, sinais)
    if args.seco:
        log("modo --seco: proposta abaixo (nada foi gravado)")
        print("\nTÍTULO:", titulo, "\n")
        print(corpo)
        return 0

    gravar_json(ARQ_DADOS, novos)
    gravar_json(ARQ_ESTADO, estado)
    PASTA_SAIDA.mkdir(parents=True, exist_ok=True)
    (PASTA_SAIDA / "pr.md").write_text(corpo, encoding="utf-8")
    resultado.update(abrir_pr=True, titulo=titulo)
    log(f"proposta pronta: {titulo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
