"""Valida a estrutura de site/dados.json.

Uso:
    python robo/validar.py               # valida site/dados.json
    python robo/validar.py outro.json    # valida outro arquivo

Sai com código 1 se encontrar problemas. O robô usa a mesma função antes de
propor qualquer alteração, e o deploy usa antes de publicar.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQUIVO_PADRAO = RAIZ / "site" / "dados.json"

CHAVES = {
    "versao", "atualizadoEm", "site", "hero", "etapas", "adicionalHoraExtra", "mudancas",
    "linhaDoTempo", "casos", "podeMudar", "direitos", "fontes", "sobre",
}
DATA_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TAG_HTML = re.compile(r"<[^>]+>")


def _data_ok(valor):
    if not isinstance(valor, str) or not DATA_ISO.match(valor):
        return False
    try:
        date.fromisoformat(valor)
        return True
    except ValueError:
        return False


def _texto(erros, caminho, valor, maximo=600, obrigatorio=True):
    if not isinstance(valor, str):
        erros.append(f"{caminho}: deveria ser texto")
        return
    if obrigatorio and not valor.strip():
        erros.append(f"{caminho}: está vazio")
    if len(valor) > maximo:
        erros.append(f"{caminho}: passou de {maximo} caracteres ({len(valor)})")
    if TAG_HTML.search(valor):
        erros.append(f"{caminho}: não pode conter HTML")


def _url(erros, caminho, valor):
    if not isinstance(valor, str) or not valor.startswith("https://") or " " in valor:
        erros.append(f"{caminho}: precisa ser um link https:// válido")


def _lista(erros, caminho, valor, campos, minimo=1, opcionais=()):
    if not isinstance(valor, list) or len(valor) < minimo:
        erros.append(f"{caminho}: deveria ser uma lista com pelo menos {minimo} item(ns)")
        return []
    for i, item in enumerate(valor):
        if not isinstance(item, dict):
            erros.append(f"{caminho}[{i}]: deveria ser um objeto")
            continue
        extras = set(item) - set(campos) - set(opcionais)
        if extras:
            erros.append(f"{caminho}[{i}]: campos desconhecidos {sorted(extras)}")
        for campo in campos:
            if campo not in item:
                erros.append(f"{caminho}[{i}].{campo}: está faltando")
    return valor


def validar(d):
    """Devolve a lista de problemas encontrados (vazia se estiver tudo certo)."""
    erros = []
    if not isinstance(d, dict):
        return ["o arquivo deveria conter um objeto JSON"]

    faltando = CHAVES - set(d)
    sobrando = set(d) - CHAVES
    if faltando:
        erros.append(f"chaves faltando: {sorted(faltando)}")
    if sobrando:
        erros.append(f"chaves desconhecidas: {sorted(sobrando)}")
    if faltando:
        return erros

    if not isinstance(d["versao"], int):
        erros.append("versao: deveria ser número inteiro")
    if not _data_ok(d["atualizadoEm"]):
        erros.append("atualizadoEm: deveria ser uma data AAAA-MM-DD")

    for bloco, campos in (("site", ("nome", "descricao")), ("hero", ("titulo", "subtitulo"))):
        if not isinstance(d[bloco], dict):
            erros.append(f"{bloco}: deveria ser um objeto")
            continue
        for campo in campos:
            _texto(erros, f"{bloco}.{campo}", d[bloco].get(campo), maximo=400)

    # Etapas da transição: são a "tabela de regras" do site
    etapas = _lista(erros, "etapas", d["etapas"],
                    ("inicio", "rotulo", "horasSemanais", "folgasSemanais", "divisor", "descricaoContagem"))
    anterior = None
    for i, e in enumerate(etapas):
        if not isinstance(e, dict):
            continue
        cam = f"etapas[{i}]"
        if i == 0:
            if e.get("inicio") is not None:
                erros.append(f"{cam}.inicio: a primeira etapa deve ter inicio null (regra anterior)")
        else:
            if not _data_ok(e.get("inicio")):
                erros.append(f"{cam}.inicio: deveria ser uma data AAAA-MM-DD")
            elif anterior and e["inicio"] <= anterior:
                erros.append(f"{cam}.inicio: as etapas precisam estar em ordem de data")
            else:
                anterior = e["inicio"]
            _texto(erros, f"{cam}.descricaoContagem", e.get("descricaoContagem"), maximo=200)
        _texto(erros, f"{cam}.rotulo", e.get("rotulo"), maximo=40)
        for campo, minimo, maximo in (("horasSemanais", 1, 44), ("folgasSemanais", 1, 7), ("divisor", 100, 240)):
            v = e.get(campo)
            if not isinstance(v, int) or not (minimo <= v <= maximo):
                erros.append(f"{cam}.{campo}: deveria ser inteiro entre {minimo} e {maximo}")

    adicional = d["adicionalHoraExtra"]
    if not isinstance(adicional, (int, float)) or not (0.5 <= adicional <= 2):
        erros.append("adicionalHoraExtra: deveria ser número entre 0.5 e 2 (0.5 = 50%)")

    for chave, campos, minimo in (("mudancas", ("rotulo", "titulo", "texto"), 1),
                                 ("casos", ("titulo", "texto"), 1),
                                 ("podeMudar", ("titulo", "texto"), 0)):
        for i, item in enumerate(_lista(erros, chave, d[chave], campos, minimo=minimo)):
            if isinstance(item, dict):
                for campo in campos:
                    _texto(erros, f"{chave}[{i}].{campo}", item.get(campo), maximo=120 if campo != "texto" else 600)

    datas = []
    for i, item in enumerate(_lista(erros, "linhaDoTempo", d["linhaDoTempo"], ("data", "titulo", "texto"), opcionais=("fonte",))):
        if not isinstance(item, dict):
            continue
        if not _data_ok(item.get("data")):
            erros.append(f"linhaDoTempo[{i}].data: deveria ser uma data AAAA-MM-DD")
        else:
            datas.append(item["data"])
        _texto(erros, f"linhaDoTempo[{i}].titulo", item.get("titulo"), maximo=120)
        _texto(erros, f"linhaDoTempo[{i}].texto", item.get("texto"))
        if "fonte" in item:
            _url(erros, f"linhaDoTempo[{i}].fonte", item["fonte"])
    if datas != sorted(datas):
        erros.append("linhaDoTempo: os itens precisam estar em ordem de data")

    direitos = d["direitos"]
    if not isinstance(direitos, dict):
        erros.append("direitos: deveria ser um objeto")
    else:
        _texto(erros, "direitos.intro", direitos.get("intro"), maximo=400)
        for i, p in enumerate(_lista(erros, "direitos.passos", direitos.get("passos"), ("titulo", "texto"))):
            if isinstance(p, dict):
                _texto(erros, f"direitos.passos[{i}].titulo", p.get("titulo"), maximo=120)
                _texto(erros, f"direitos.passos[{i}].texto", p.get("texto"))

    for i, f in enumerate(_lista(erros, "fontes", d["fontes"], ("titulo", "url"))):
        if isinstance(f, dict):
            _texto(erros, f"fontes[{i}].titulo", f.get("titulo"), maximo=160)
            _url(erros, f"fontes[{i}].url", f.get("url"))

    _texto(erros, "sobre", d["sobre"], maximo=400)
    return erros


def main(argv):
    caminho = Path(argv[1]) if len(argv) > 1 else ARQUIVO_PADRAO
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"Não consegui ler {caminho}: {e}")
        return 1
    erros = validar(dados)
    if erros:
        print(f"{caminho}: {len(erros)} problema(s)")
        for e in erros:
            print(" -", e)
        return 1
    print(f"{caminho}: tudo certo")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
