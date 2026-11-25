/* Nova Jornada: "Meu ponto".
   A pessoa informa escala, horário, cidade e período; a página monta o espelho de ponto
   com dias de trabalho, folgas e feriados, e confere as semanas contra o limite de cada etapa.
   Feriados: site/feriados.json. Lista de cidades: serviço público do IBGE (só a sigla do estado é enviada).
   As escolhas ficam só neste aparelho (localStorage). */
(function () {
  "use strict";

  var CHAVE = "ponto";
  var MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
  var UFS = [
    ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
    ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
    ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
    ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
    ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
  ];
  var PRESETS = window.MotorPonto.PRESETS;

  var $ = function (id) { return document.getElementById(id); };
  var dados = null;       // dados.json (etapas)
  var feriados = null;    // feriados.json
  var cidadesCache = {};
  var estado; // preenchido logo abaixo, depois dos atalhos do motor

  // ---------- utilidades (o cálculo fica em motor-ponto.js) ----------
  var M = window.MotorPonto;
  var pad = M.pad, iso = M.iso, lerIso = M.lerIso, somarDias = M.somarDias, dataBr = M.dataBr, horas = M.horas;
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function hoje() {
    var teste = new URLSearchParams(location.search).get("hoje");
    var d = lerIso(teste);
    if (d) return d;
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function carregar() {
    var base = { uf: "", cidade: "", escala: "5x2", dias: [1, 2, 3, 4, 5], ciclo: { trabalho: 6, folga: 1, inicio: "" },
      entrada: "08:00", saida: "17:00", intervalo: 60, trabalhaFeriado: false, mes: hoje().getMonth(), ano: hoje().getFullYear(),
      ajustes: {}, extras: [] };
    try {
      var s = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (s && typeof s === "object") {
        Object.keys(base).forEach(function (k) { if (s[k] !== undefined) base[k] = s[k]; });
      }
    } catch (e) { /* sem armazenamento: começa do zero */ }
    if (!base.ciclo.inicio) base.ciclo.inicio = iso(hoje());
    return base;
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* modo privado */ }
  }

  estado = carregar();

  // Atalhos do motor com a configuração desta página.
  function chaveMunicipio() { return M.chaveMunicipio(feriados, estado.uf, estado.cidade); }
  function diaDeEscala(d) { return M.diaDeEscala(estado, d, hoje()); }
  function situacao(d, mapa) { return M.situacao(estado, d, mapa, hoje()); }

  // ---------- montagem do formulário ----------
  function montarFormulario() {
    var uf = $("ponto-uf");
    UFS.forEach(function (u) { var o = el("option", null, u[1]); o.value = u[0]; uf.append(o); });

    var dias = $("ponto-dias");
    ORDEM_DIAS.forEach(function (n) {
      var rot = el("label", "ponto__dia");
      var cb = el("input");
      cb.type = "checkbox";
      cb.value = String(n);
      cb.setAttribute("aria-label", ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][n]);
      rot.append(cb, el("span", null, DIAS_CURTOS[n]));
      dias.append(rot);
    });

    var mes = $("ponto-mes");
    var ano = el("option", null, "Ano inteiro");
    ano.value = "ano";
    mes.append(ano);
    MESES.forEach(function (m, i) { var o = el("option", null, m); o.value = String(i); mes.append(o); });

    preencherFormulario();

    uf.addEventListener("change", function () {
      estado.uf = uf.value;
      estado.cidade = "";
      carregarCidades();
      atualizar();
    });
    $("ponto-cidade").addEventListener("change", function () { estado.cidade = this.value; atualizar(); });
    $("ponto-escala").addEventListener("change", function () { aplicarPreset(this.value); });
    dias.addEventListener("change", function () {
      estado.dias = Array.prototype.filter.call(dias.querySelectorAll("input"), function (c) { return c.checked; })
        .map(function (c) { return Number(c.value); });
      atualizar();
    });
    [["ponto-ciclo-trabalho", "trabalho"], ["ponto-ciclo-folga", "folga"], ["ponto-ciclo-inicio", "inicio"]].forEach(function (p) {
      $(p[0]).addEventListener("input", function () { estado.ciclo[p[1]] = p[1] === "inicio" ? this.value : Number(this.value); atualizar(); });
    });
    $("ponto-entrada").addEventListener("input", function () { estado.entrada = this.value; atualizar(); });
    $("ponto-saida").addEventListener("input", function () { estado.saida = this.value; atualizar(); });
    $("ponto-intervalo").addEventListener("change", function () { estado.intervalo = Number(this.value); atualizar(); });
    $("ponto-trabalha-feriado").addEventListener("change", function () { estado.trabalhaFeriado = this.checked; estado.ajustes = {}; atualizar(); });
    mes.addEventListener("change", function () { estado.mes = this.value === "ano" ? "ano" : Number(this.value); atualizar(); });
    $("ponto-ano").addEventListener("input", function () {
      var a = Number(this.value);
      if (a >= 2024 && a <= 2035) { estado.ano = a; atualizar(); }
    });
    $("ponto-imprimir").addEventListener("click", function () {
      var bloco = $("ponto-feriados-bloco");
      var aberto = bloco.open;
      bloco.open = true;
      window.print();
      bloco.open = aberto;
    });
    $("ponto-novo-adicionar").addEventListener("click", adicionarFeriado);
    $("ponto-form").addEventListener("submit", function (e) { e.preventDefault(); });
  }

  function preencherFormulario() {
    $("ponto-uf").value = estado.uf;
    $("ponto-escala").value = PRESETS[estado.escala] ? estado.escala : "5x2";
    $("ponto-dias").querySelectorAll("input").forEach(function (c) { c.checked = estado.dias.indexOf(Number(c.value)) >= 0; });
    $("ponto-ciclo-trabalho").value = estado.ciclo.trabalho;
    $("ponto-ciclo-folga").value = estado.ciclo.folga;
    $("ponto-ciclo-inicio").value = estado.ciclo.inicio;
    $("ponto-entrada").value = estado.entrada;
    $("ponto-saida").value = estado.saida;
    $("ponto-intervalo").value = String(estado.intervalo);
    $("ponto-trabalha-feriado").checked = !!estado.trabalhaFeriado;
    $("ponto-mes").value = estado.mes === "ano" ? "ano" : String(estado.mes);
    $("ponto-ano").value = estado.ano;
    mostrarModo();
    if (estado.uf) carregarCidades();
  }

  function aplicarPreset(nome) {
    var p = PRESETS[nome];
    estado.escala = nome;
    if (p.dias) estado.dias = p.dias.slice();
    if (p.trabalho) { estado.ciclo.trabalho = p.trabalho; estado.ciclo.folga = p.folga; }
    if (p.entrada) { estado.entrada = p.entrada; estado.saida = p.saida; estado.intervalo = p.intervalo; }
    preencherFormulario();
    atualizar();
  }

  function mostrarModo() {
    var modo = (PRESETS[estado.escala] || PRESETS["5x2"]).modo;
    $("ponto-dias").hidden = modo !== "semana";
    $("ponto-ciclo").hidden = modo !== "ciclo";
    $("ponto-ciclo-rotulo").textContent = estado.escala === "12x36"
      ? "Um dia em que você trabalhou"
      : "Primeiro dia de trabalho depois de uma folga";
  }

  function carregarCidades() {
    var sel = $("ponto-cidade");
    var status = $("ponto-cidade-status");
    var uf = estado.uf;
    sel.replaceChildren(el("option", null, uf ? "Carregando cidades…" : "Escolha o estado primeiro"));
    sel.firstChild.value = "";
    sel.disabled = true;
    status.textContent = "";
    if (!uf) return;

    var pronto = cidadesCache[uf]
      ? Promise.resolve(cidadesCache[uf])
      : fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/" + uf + "/municipios?orderBy=nome")
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (lista) { cidadesCache[uf] = lista.map(function (c) { return c.nome; }); return cidadesCache[uf]; });

    pronto.then(function (nomes) {
      if (estado.uf !== uf) return;
      sel.replaceChildren();
      var vazio = el("option", null, "Escolha a cidade");
      vazio.value = "";
      sel.append(vazio);
      nomes.forEach(function (n) { var o = el("option", null, n); o.value = n; sel.append(o); });
      sel.disabled = false;
      sel.value = estado.cidade;
      atualizar();
    }).catch(function () {
      if (estado.uf !== uf) return;
      sel.firstChild.textContent = "Lista indisponível";
      status.textContent = "Não deu para carregar a lista de cidades agora. Os feriados nacionais e estaduais já estão valendo; os da sua cidade você pode adicionar na lista de feriados.";
    });
  }

  function adicionarFeriado() {
    var data = $("ponto-novo-data").value;
    var nome = $("ponto-novo-nome").value.trim().slice(0, 60);
    if (!lerIso(data) || !nome) {
      $("ponto-novo-nome").focus();
      return;
    }
    estado.extras = estado.extras.filter(function (x) { return x.data !== data; });
    estado.extras.push({ data: data, nome: nome });
    $("ponto-novo-nome").value = "";
    atualizar();
  }

  // ---------- resultado ----------
  function periodo() {
    if (estado.mes === "ano") return { ini: new Date(estado.ano, 0, 1), fim: new Date(estado.ano, 11, 31), titulo: "Ano de " + estado.ano };
    return { ini: new Date(estado.ano, estado.mes, 1), fim: new Date(estado.ano, estado.mes + 1, 0), titulo: MESES[estado.mes] + " de " + estado.ano };
  }

  function atualizar() {
    mostrarModo();
    salvar();
    if (!feriados) return;

    var per = periodo();
    var r = M.calcular(estado, per, feriados, (dados && dados.etapas) || [], hoje());
    var semanas = r.semanas, noPeriodo = r.noPeriodo, trabalhados = r.trabalhados, media = r.media;
    var feriadosPeriodo = r.feriadosPeriodo, mapa = r.mapa, jornada = r.jornada;

    $("ponto-titulo").textContent = per.titulo + (estado.cidade ? " · " + estado.cidade + "/" + estado.uf : estado.uf ? " · " + estado.uf : "");
    montarResumo(noPeriodo, trabalhados, feriadosPeriodo, semanas, media);
    montarAlertas(semanas, jornada, media);
    montarListaFeriados(per, mapa);
    if (estado.mes === "ano") montarTabelaAno(semanas, per);
    else montarTabelaMes(semanas, per);

    var etapas = (dados && dados.etapas) || [];
    $("ponto-nota").textContent = "As horas consideram o horário informado em todos os dias de trabalho. Os limites de cada semana seguem a etapa em vigor: " +
      etapas.map(function (e) { return e.rotulo.toLowerCase() + ", " + e.horasSemanais + "h e " + e.folgasSemanais + (e.folgasSemanais === 1 ? " folga" : " folgas"); }).join("; ") +
      ". Feriado trabalhado deve ser pago em dobro ou compensado com outra folga (Lei 605/1949). Esta é uma simulação: o que vale é o registro de ponto da empresa e a convenção coletiva.";
  }

  function cartao(rotulo, numero, legenda) {
    var c = el("div", "cartao");
    c.append(el("p", "cartao__rotulo", rotulo), el("p", "ponto__numero", numero));
    if (legenda) c.append(el("p", null, legenda));
    return c;
  }

  function montarResumo(noPeriodo, trabalhados, feriadosPeriodo, semanas, media) {
    var horasTotal = trabalhados.reduce(function (t, x) { return t + x.min; }, 0);
    var folgas = noPeriodo.length - trabalhados.length;
    var ferFolga = feriadosPeriodo.filter(function (x) { return !x.sit.trabalha; }).length;
    var ferTrab = feriadosPeriodo.filter(function (x) { return x.sit.trabalha && x.sit.feriado.tipo === "feriado"; }).length;
    var maior = semanas.reduce(function (m, s) { return s.total > m.total ? s : m; }, semanas[0]);
    $("ponto-resumo").replaceChildren(
      cartao("Dias de trabalho", String(trabalhados.length), "de " + noPeriodo.length + " dias no período"),
      cartao("Folgas", String(folgas), ferFolga ? "incluindo " + ferFolga + (ferFolga === 1 ? " feriado" : " feriados") : "nenhum feriado de folga"),
      cartao("Horas trabalhadas", horas(horasTotal), ferTrab ? ferTrab + (ferTrab === 1 ? " feriado trabalhado" : " feriados trabalhados") : "sem feriados trabalhados"),
      media
        ? cartao("Média por semana", horas(media.min), media.etapa ? "limite da época: " + media.etapa.horasSemanais + "h na média" : "")
        : cartao("Semana mais longa", horas(maior.total), maior.etapa ? "limite da época: " + maior.etapa.horasSemanais + "h" : "")
    );
  }

  function montarAlertas(semanas, jornada, media) {
    var lista = $("ponto-alertas");
    lista.replaceChildren();
    function aviso(texto, ok) { lista.append(el("li", ok ? "ok" : null, texto)); }

    if (!jornada) aviso("Confira a entrada, a saída e o intervalo: o horário informado não soma nenhuma hora.");
    var acima = semanas.filter(function (s) { return s.acima; });
    var poucas = semanas.filter(function (s) { return s.poucasFolgas; });
    if (acima.length) {
      aviso(acima.length + (acima.length === 1 ? " semana passa" : " semanas passam") + " do limite de horas da época (" +
        acima.map(function (s) { return "semana de " + dataBr(s.dias[0].data) + ": " + horas(s.total) + " de " + s.etapa.horasSemanais + "h"; }).slice(0, 4).join("; ") +
        (acima.length > 4 ? "; …" : "") + "). O que passar do limite é hora extra.");
    }
    if (poucas.length) {
      aviso(poucas.length + (poucas.length === 1 ? " semana tem" : " semanas têm") + " menos folgas do que a regra da época exige (" +
        poucas.map(function (s) { return "semana de " + dataBr(s.dias[0].data) + ": " + s.folgas + " de " + s.etapa.folgasSemanais; }).slice(0, 4).join("; ") +
        (poucas.length > 4 ? "; …" : "") + ").");
    }
    if (jornada > 600 && estado.escala !== "12x36") {
      aviso("Sua jornada diária (" + horas(jornada) + ") passa de 10 horas, o máximo de 8 horas normais mais 2 extras, fora acordos como o 12x36.");
    }
    if (media && media.etapa && jornada) {
      var limite = media.etapa.horasSemanais * 60;
      aviso(media.min > limite
        ? "Na 12x36 a conta é pela média: neste período você faz em média " + horas(media.min) + " por semana, acima do limite de " + media.etapa.horasSemanais + "h. O que passar disso vira folga compensada ou hora extra, conforme o acordo com o sindicato."
        : "Na 12x36 a conta é pela média: neste período você faz em média " + horas(media.min) + " por semana, dentro do limite de " + media.etapa.horasSemanais + "h.", media.min <= limite);
      return;
    }
    if (jornada && !acima.length && !poucas.length) aviso("Nenhuma semana do período passa do limite de horas nem fica com menos folgas do que a regra da época.", true);
  }

  function montarListaFeriados(per, mapa) {
    var lista = $("ponto-feriados");
    lista.replaceChildren();
    var chaves = Object.keys(mapa).filter(function (k) { var d = lerIso(k); return d >= per.ini && d <= per.fim; }).sort();
    $("ponto-feriados-titulo").textContent = "Feriados do período (" + chaves.length + ")" + (estado.uf ? "" : ": escolha o estado para ver os estaduais e municipais");
    var municipio = chaveMunicipio();
    $("ponto-feriados-aviso").textContent = (feriados.aviso || "") +
      (estado.cidade && !municipio ? " Ainda não temos os feriados municipais de " + estado.cidade + ": adicione-os abaixo." : "");

    if (!chaves.length) lista.append(el("li", null, "Nenhum feriado neste período."));
    chaves.forEach(function (k) {
      var f = mapa[k], d = lerIso(k);
      var li = el("li");
      var nome = el("span", "nome", f.nome);
      nome.append(el("span", "origem", f.origem + (f.tipo === "facultativo" ? " · ponto facultativo" : "") + (f.lei ? " · " + f.lei : "")));
      li.append(el("span", "data", dataBr(d) + " " + DIAS_CURTOS[d.getDay()]), nome);

      var acao = el("span", "acao");
      if (diaDeEscala(d)) {
        var rot = el("label");
        var cb = el("input");
        cb.type = "checkbox";
        var sit = situacao(d, mapa);
        cb.checked = !sit.trabalha;
        cb.addEventListener("change", function () { estado.ajustes[k] = cb.checked ? "folga" : "trabalho"; atualizar(); });
        rot.append(cb, " Folga neste dia");
        acao.append(rot);
      } else {
        acao.append(el("span", "origem", "Já é folga na sua escala"));
      }
      if (f.extra) {
        var rm = el("button", "remover", "Remover");
        rm.type = "button";
        rm.addEventListener("click", function () {
          estado.extras = estado.extras.filter(function (x) { return x.data !== k; });
          delete estado.ajustes[k];
          atualizar();
        });
        acao.append(rm);
      }
      li.append(acao);
      lista.append(li);
    });
  }

  function linha(celulas, classe) {
    var tr = el("tr", classe || null);
    celulas.forEach(function (c) {
      var td = el("td", c.classe || null);
      if (c.no) td.append(c.no); else td.textContent = c.texto;
      tr.append(td);
    });
    return tr;
  }

  function cabecalho(tabela, titulos) {
    var thead = el("thead");
    var tr = el("tr");
    titulos.forEach(function (t) {
      var th = el("th", t.num ? "num" : null, t.texto || t);
      th.scope = "col";
      tr.append(th);
    });
    thead.append(tr);
    tabela.append(thead);
  }

  function montarTabelaMes(semanas, per) {
    var t = $("ponto-tabela");
    t.replaceChildren();
    var cap = el("caption", "pular", "Espelho de ponto de " + per.titulo);
    t.append(cap);
    cabecalho(t, ["Data", "Dia", "Situação", "Entrada", "Saída", "Intervalo", { texto: "Horas", num: true }]);
    var tbody = el("tbody");
    var intervalo = Number(estado.intervalo) || 0;
    var total = 0;
    semanas.forEach(function (s) {
      s.dias.forEach(function (x) {
        if (!x.dentro) return;
        total += x.min;
        tbody.append(linha([
          { texto: dataBr(x.data) },
          { texto: DIAS_CURTOS[x.data.getDay()] },
          { texto: x.sit.rotulo, classe: "situacao" },
          { texto: x.sit.trabalha ? estado.entrada : "—" },
          { texto: x.sit.trabalha ? estado.saida : "—" },
          { texto: x.sit.trabalha ? (intervalo ? horas(intervalo) : "—") : "—" },
          { texto: x.sit.trabalha ? horas(x.min) : "—", classe: "num" }
        ], x.sit.classe));
      });
      var texto = "Semana de " + dataBr(s.dias[0].data) + " a " + dataBr(s.dias[6].data) + ": " + s.folgas + (s.folgas === 1 ? " folga" : " folgas") +
        (s.etapa ? " · limite " + s.etapa.horasSemanais + "h" : "") + (s.acima ? " · acima do limite" : "");
      var tr = linha([{ texto: texto }, { texto: horas(s.total), classe: "num" }], "semana" + (s.acima || s.poucasFolgas ? " acima" : ""));
      tr.firstChild.colSpan = 6;
      tbody.append(tr);
    });
    t.append(tbody);
    var tfoot = el("tfoot");
    var tr = linha([{ texto: "Total do mês" }, { texto: horas(total), classe: "num" }]);
    tr.firstChild.colSpan = 6;
    tfoot.append(tr);
    t.append(tfoot);
  }

  function montarTabelaAno(semanas, per) {
    var t = $("ponto-tabela");
    t.replaceChildren();
    t.append(el("caption", "pular", "Resumo de " + per.titulo));
    cabecalho(t, ["Mês", { texto: "Dias de trabalho", num: true }, { texto: "Folgas", num: true }, { texto: "Feriados de folga", num: true },
      { texto: "Feriados trabalhados", num: true }, { texto: "Horas", num: true }, ""]);
    var meses = MESES.map(function () { return { trab: 0, folga: 0, ferFolga: 0, ferTrab: 0, min: 0 }; });
    semanas.forEach(function (s) {
      s.dias.forEach(function (x) {
        if (!x.dentro) return;
        var m = meses[x.data.getMonth()];
        if (x.sit.trabalha) { m.trab++; m.min += x.min; } else m.folga++;
        if (x.sit.feriado && diaDeEscala(x.data)) {
          if (!x.sit.trabalha) m.ferFolga++;
          else if (x.sit.feriado.tipo === "feriado") m.ferTrab++;
        }
      });
    });
    var tbody = el("tbody");
    var soma = { trab: 0, folga: 0, ferFolga: 0, ferTrab: 0, min: 0 };
    meses.forEach(function (m, i) {
      Object.keys(soma).forEach(function (k) { soma[k] += m[k]; });
      var ver = el("button", null, "Ver mês");
      ver.type = "button";
      ver.setAttribute("aria-label", "Ver o ponto de " + MESES[i]);
      ver.addEventListener("click", function () {
        estado.mes = i;
        $("ponto-mes").value = String(i);
        atualizar();
        $("ponto-titulo").scrollIntoView({ block: "start" });
      });
      tbody.append(linha([
        { texto: MESES[i] }, { texto: String(m.trab), classe: "num" }, { texto: String(m.folga), classe: "num" },
        { texto: String(m.ferFolga), classe: "num" }, { texto: String(m.ferTrab), classe: "num" }, { texto: horas(m.min), classe: "num" }, { no: ver }
      ]));
    });
    t.append(tbody);
    var tfoot = el("tfoot");
    tfoot.append(linha([
      { texto: "Total do ano" }, { texto: String(soma.trab), classe: "num" }, { texto: String(soma.folga), classe: "num" },
      { texto: String(soma.ferFolga), classe: "num" }, { texto: String(soma.ferTrab), classe: "num" }, { texto: horas(soma.min), classe: "num" }, { texto: "" }
    ]));
    t.append(tfoot);
  }

  // ---------- início ----------
  montarFormulario();
  Promise.all([
    fetch("dados.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("feriados.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  ]).then(function (res) {
    dados = res[0];
    feriados = res[1];
    atualizar();
  }).catch(function (e) {
    console.error("Falha ao carregar feriados.json:", e);
    $("ponto-resultado").replaceChildren(el("p", "nota", "Não foi possível carregar a lista de feriados. Recarregue a página em instantes."));
  });
})();
