/* Nova Jornada: monta a página a partir de dados.json.
   Todo o conteúdo que muda (datas, divisores, textos, fontes) fica em dados.json.
   Para testar outra data: abra a página com ?hoje=2026-12-20 */
(function () {
  "use strict";

  var DIA_MS = 86400000;

  // ---------- utilidades ----------
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function lerData(iso) {
    if (!iso) return null;
    var p = String(iso).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function formatarData(d) {
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  }

  function diasEntre(a, b) {
    return Math.round((b - a) / DIA_MS);
  }

  function hojeLocal() {
    var teste = new URLSearchParams(location.search).get("hoje");
    if (teste && /^\d{4}-\d{2}-\d{2}$/.test(teste)) return lerData(teste);
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function pegar(obj, caminho) {
    return caminho.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }

  function linkSeguro(url) {
    return typeof url === "string" && /^https:\/\//.test(url);
  }

  var moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var percentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

  function lerSalario(texto) {
    var s = String(texto || "").replace(/[^\d.,]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, "");
    var n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // ---------- partes da página ----------
  function preencherCampos(d) {
    document.querySelectorAll("[data-campo]").forEach(function (n) {
      var v = pegar(d, n.getAttribute("data-campo"));
      if (typeof v === "string" && v) n.textContent = v;
    });
    var atualizado = formatarData(lerData(d.atualizadoEm));
    document.getElementById("atualizado-em").textContent = atualizado;
    document.getElementById("atualizado-em-rodape").textContent = atualizado;
  }

  function etapaAtual(etapas, hoje) {
    var idx = 0;
    etapas.forEach(function (e, i) {
      var ini = lerData(e.inicio);
      if (!ini || ini <= hoje) idx = i;
    });
    return idx;
  }

  function montarFases(etapas, hoje) {
    var lista = document.getElementById("fases");
    var atual = etapaAtual(etapas, hoje);
    lista.replaceChildren();
    etapas.forEach(function (e, i) {
      var li = el("li", "fase" + (i === atual ? " fase--agora" : ""));
      li.append(
        el("p", "fase__rotulo", e.rotulo + (i === atual ? " · agora" : "")),
        el("p", "fase__valor", e.horasSemanais + "h · " + e.folgasSemanais + (e.folgasSemanais === 1 ? " folga" : " folgas"))
      );
      lista.append(li);
    });
  }

  function montarContagem(etapas, hoje) {
    var proxima = etapas.find(function (e) { var d = lerData(e.inicio); return d && d >= hoje; });
    var rotulo = document.getElementById("contagem-rotulo");
    var numero = document.getElementById("contagem-numero");
    var unidade = document.getElementById("contagem-unidade");
    var texto = document.getElementById("contagem-texto");

    if (!proxima) {
      var ultima = etapas[etapas.length - 1];
      rotulo.textContent = "";
      numero.textContent = "Transição concluída";
      numero.classList.add("contagem__numero--texto");
      unidade.textContent = "";
      texto.textContent = "Jornada máxima de " + ultima.horasSemanais + " horas e " + ultima.folgasSemanais + " folgas remuneradas por semana.";
      return;
    }
    var d = lerData(proxima.inicio);
    var dias = diasEntre(hoje, d);
    numero.classList.remove("contagem__numero--texto");
    if (dias === 0) {
      rotulo.textContent = "Começa";
      numero.textContent = "Hoje";
      unidade.textContent = "";
      texto.textContent = "A partir de hoje (" + formatarData(d) + "), " + proxima.descricaoContagem;
    } else {
      rotulo.textContent = "Faltam";
      numero.textContent = String(dias);
      unidade.textContent = dias === 1 ? "dia" : "dias";
      texto.textContent = "para " + formatarData(d) + ", " + proxima.descricaoContagem;
    }
  }

  function montarCartoes(idLista, itens, opcoes) {
    var lista = document.getElementById(idLista);
    lista.replaceChildren();
    itens.forEach(function (it) {
      var c = el("article", "cartao" + (opcoes && opcoes.grande ? " cartao--grande" : ""));
      if (it.rotulo) c.append(el("p", "cartao__rotulo", it.rotulo));
      c.append(el("h3", null, it.titulo), el("p", null, it.texto));
      lista.append(c);
    });
  }

  function montarLinhaDoTempo(itens, hoje) {
    var lista = document.getElementById("lista-tempo");
    lista.replaceChildren();
    var ordenados = itens.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    var proximoIdx = ordenados.findIndex(function (it) { return lerData(it.data) > hoje; });

    ordenados.forEach(function (it, i) {
      var d = lerData(it.data);
      var selo;
      if (d < hoje) selo = el("span", "selo selo--passado", "Já aconteceu");
      else if (d.getTime() === hoje.getTime()) selo = el("span", "selo selo--proximo", "Hoje");
      else if (i === proximoIdx) selo = el("span", "selo selo--proximo", "Próxima etapa");
      else selo = el("span", "selo", "Previsto");

      var li = el("li", "tempo__item");
      var data = el("p", "tempo__data" + (d >= hoje ? " tempo__data--futuro" : ""), formatarData(d));
      var corpo = el("div", "tempo__corpo");
      var cabeca = el("div", "tempo__cabeca");
      cabeca.append(el("h3", null, it.titulo), selo);
      corpo.append(cabeca, el("p", null, it.texto));
      if (linkSeguro(it.fonte)) {
        var a = el("a", "tempo__fonte", "Ver fonte");
        a.href = it.fonte;
        a.target = "_blank";
        a.rel = "noopener";
        corpo.append(a);
      }
      li.append(data, corpo);
      lista.append(li);
    });
  }

  function montarCalculadora(d) {
    var etapas = d.etapas;
    var adicional = typeof d.adicionalHoraExtra === "number" ? d.adicionalHoraExtra : 0.5;
    var lista = document.getElementById("lista-calculo");
    var input = document.getElementById("salario");
    var base = etapas[0].divisor;

    var saidas = etapas.map(function (e, i) {
      var c = el("div", "cartao");
      var hora = el("p", "calc__hora", "—");
      var legenda = el("p", "calc__legenda");
      var extra = el("p", "calc__extra");
      c.append(
        el("p", "calc__etapa" + (i > 0 ? " calc__etapa--nova" : ""), e.rotulo + " · " + e.horasSemanais + "h · ÷ " + e.divisor),
        hora, legenda, extra
      );
      lista.append(c);
      return { etapa: e, hora: hora, legenda: legenda, extra: extra };
    });

    function atualizar() {
      var salario = lerSalario(input.value);
      saidas.forEach(function (s, i) {
        var valor = salario ? salario / s.etapa.divisor : 0;
        s.hora.textContent = salario ? moeda.format(valor) : "—";
        var ganho = (base / s.etapa.divisor - 1) * 100;
        s.legenda.textContent = "por hora" + (i > 0 ? " · " + percentual.format(ganho) + "% a mais" : "");
        s.extra.textContent = "";
        s.extra.append("Hora extra (+" + Math.round(adicional * 100) + "%): ");
        s.extra.append(el("strong", null, salario ? moeda.format(valor * (1 + adicional)) : "—"));
      });
    }

    input.addEventListener("input", atualizar);
    atualizar();
  }

  function montarDireitos(direitos) {
    var lista = document.getElementById("lista-direitos");
    lista.replaceChildren();
    direitos.passos.forEach(function (p, i) {
      var li = el("li", "passo");
      li.append(el("p", "passo__numero", String(i + 1)), el("h3", null, p.titulo), el("p", null, p.texto));
      lista.append(li);
    });
  }

  function montarFontes(fontes) {
    var lista = document.getElementById("lista-fontes");
    lista.replaceChildren();
    fontes.filter(function (f) { return linkSeguro(f.url); }).forEach(function (f) {
      var li = el("li");
      var a = el("a", null, f.titulo);
      a.href = f.url;
      a.target = "_blank";
      a.rel = "noopener";
      li.append(a);
      lista.append(li);
    });
  }

  function montar(d) {
    var hoje = hojeLocal();
    preencherCampos(d);
    montarFases(d.etapas, hoje);
    montarContagem(d.etapas, hoje);
    montarCartoes("lista-mudancas", d.mudancas, { grande: true });
    montarLinhaDoTempo(d.linhaDoTempo, hoje);
    montarCalculadora(d);
    montarCartoes("lista-casos", d.casos);
    montarCartoes("lista-pode-mudar", d.podeMudar);
    montarDireitos(d.direitos);
    montarFontes(d.fontes);
  }

  fetch("dados.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(montar)
    .catch(function (e) {
      console.error("Falha ao carregar dados.json:", e);
      document.getElementById("erro").hidden = false;
    });
})();
