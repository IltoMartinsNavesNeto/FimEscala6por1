"""Testes do robô. Rodar com:  python -m unittest discover -s robo/testes -v"""
import copy
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path
from unittest import mock

PASTA_ROBO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PASTA_ROBO))

import monitor  # noqa: E402
from validar import validar  # noqa: E402

DADOS = json.loads((PASTA_ROBO.parent / "site" / "dados.json").read_text(encoding="utf-8"))


class TesteValidar(unittest.TestCase):
    def test_dados_atuais_validos(self):
        self.assertEqual(validar(DADOS), [])

    def test_pega_erros_comuns(self):
        d = copy.deepcopy(DADOS)
        d["etapas"][2]["inicio"] = "2026-01-01"           # fora de ordem
        d["linhaDoTempo"].append({"data": "2020-01-01", "titulo": "x", "texto": "y"})  # fora de ordem
        d["fontes"].append({"titulo": "x", "url": "javascript:alert(1)"})
        d["novidade"] = True
        erros = " | ".join(validar(d))
        for trecho in ("ordem de data", "linhaDoTempo", "https", "chaves desconhecidas"):
            self.assertIn(trecho, erros)


class TesteResposta(unittest.TestCase):
    def test_extrai_json_entre_marcas(self):
        texto = 'Vou pesquisar. Achei algo. <<<JSON\n{"ha_novidade": false, "resumo": "ok", "dados": null}\nJSON>>>'
        self.assertEqual(monitor.extrair_resposta(texto)["resumo"], "ok")

    def test_aceita_cerca_de_codigo(self):
        texto = '<<<JSON\n```json\n{"ha_novidade": false}\n```\nJSON>>>'
        self.assertFalse(monitor.extrair_resposta(texto)["ha_novidade"])

    def test_formato_errado_falha(self):
        with self.assertRaises(RuntimeError):
            monitor.extrair_resposta('{"ha_novidade": false}')


class TesteDiferencas(unittest.TestCase):
    def test_lista_mudancas(self):
        novo = copy.deepcopy(DADOS)
        novo["podeMudar"].pop(0)
        novo["linhaDoTempo"].append({"data": "2028-01-01", "titulo": "t", "texto": "x"})
        linhas = "\n".join(monitor.diferencas(DADOS, novo))
        self.assertIn("linhaDoTempo[6]", linhas)
        self.assertIn("podeMudar", linhas)


class TesteDOU(unittest.TestCase):
    def _zip(self):
        xml = """<xml><article id="123" artType="Portaria" artCategory="Ministério do Trabalho e Emprego/Gabinete do Ministro"
        pubDate="23/11/2026" pubName="DO1E" numberPage="1"><body><Identifica><![CDATA[PORTARIA MTE Nº 9.999]]></Identifica>
        <Texto><![CDATA[<p>Dispõe sobre o repouso semanal remunerado de que trata a Emenda Constitucional nº 141.</p>]]></Texto>
        </body></article>
        <article id="124" artType="Portaria" artCategory="Ministério da Saúde"><body><Texto>Outra coisa</Texto></body></article></xml>"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("teste.xml", xml)
        return buf.getvalue()

    def test_encontra_ato_relevante_e_ignora_o_resto(self):
        config = json.loads((PASTA_ROBO / "config.json").read_text(encoding="utf-8"))
        estado = {"dou_vistos": []}
        with mock.patch.dict("os.environ", {"INLABS_EMAIL": "a@b.c", "INLABS_SENHA": "x"}), \
             mock.patch.object(monitor, "_inlabs_sessao", return_value=(None, "c")), \
             mock.patch.object(monitor, "_inlabs_zip", side_effect=lambda *a: self._zip() if a[3] == "DO1E" else None):
            sinais = monitor.verificar_dou(config, estado)
        ids = {s["id"] for s in sinais}
        self.assertEqual(ids, {"123"})
        self.assertIn("PORTARIA MTE", sinais[0]["titulo"])
        # na segunda rodada o mesmo ato não é repetido
        with mock.patch.dict("os.environ", {"INLABS_EMAIL": "a@b.c", "INLABS_SENHA": "x"}), \
             mock.patch.object(monitor, "_inlabs_sessao", return_value=(None, "c")), \
             mock.patch.object(monitor, "_inlabs_zip", side_effect=lambda *a: self._zip()):
            self.assertEqual(monitor.verificar_dou(config, estado), [])


class TesteFluxo(unittest.TestCase):
    """Simula uma rodada completa com uma resposta falsa do Claude, sem gravar nada."""

    def _rodar(self, resposta):
        args = mock.Mock(seco=True, sem_ia=False)
        resultado = {"abrir_pr": False, "estado_gravado": False, "titulo": ""}
        saida = io.StringIO()
        with mock.patch.object(monitor, "verificar_paginas", return_value=[]), \
             mock.patch.object(monitor, "verificar_dou", return_value=[]), \
             mock.patch.object(monitor, "chamar_claude", return_value=resposta), \
             mock.patch("sys.stdout", saida):
            codigo = monitor.executar(args, resultado)
        return codigo, saida.getvalue()

    def test_sem_novidade(self):
        codigo, saida = self._rodar({"ha_novidade": False, "resumo": "nada novo", "dados": None})
        self.assertEqual(codigo, 0)
        self.assertIn("sem novidade", saida)

    def test_com_novidade_gera_pr(self):
        novo = copy.deepcopy(DADOS)
        novo["linhaDoTempo"].append({"data": "2027-12-20", "titulo": "STF julga as ADIs",
                                     "texto": "Texto de teste.", "fonte": "https://portal.stf.jus.br/"})
        codigo, saida = self._rodar({"ha_novidade": True, "titulo": "STF julga as ADIs", "resumo": "Teste.",
                                     "alteracoes": ["novo item"], "fontes": [], "dados": novo})
        self.assertEqual(codigo, 0)
        self.assertIn("TÍTULO: STF julga as ADIs", saida)
        self.assertIn("linhaDoTempo[6]", saida)

    def test_proposta_invalida_e_barrada(self):
        novo = copy.deepcopy(DADOS)
        novo["etapas"][1]["divisor"] = 999
        codigo, saida = self._rodar({"ha_novidade": True, "titulo": "x", "resumo": "x", "dados": novo})
        self.assertEqual(codigo, 1)
        self.assertIn("não passou na validação", saida)


if __name__ == "__main__":
    unittest.main()
