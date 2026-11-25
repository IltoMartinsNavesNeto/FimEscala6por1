/* Nova Jornada: motor de cálculo do ponto, usado pelo "Meu ponto" e pela área da empresa.
   Funções puras: recebem a configuração da escala, os feriados (feriados.json) e as etapas (dados.json)
   e devolvem os dias, as semanas e os totais. Não mexem na página.

   cfg = { uf, cidade, escala, dias:[0..6], ciclo:{trabalho,folga,inicio}, entrada:"08:00", saida:"17:00",
           intervalo:60, trabalhaFeriado:false, ajustes:{ "aaaa-mm-dd": "folga"|"trabalho" }, extras:[{data,nome}] } */
(function (raiz) {
  "use strict";

  var DIA_MS = 86400000;
  var PRESETS = {
    "5x2": { modo: "semana", dias: [1, 2, 3, 4, 5], entrada: "08:00", saida: "17:00", intervalo: 60 },
    "6x1-fixa": { modo: "semana", dias: [1, 2, 3, 4, 5, 6], entrada: "08:00", saida: "16:20", intervalo: 60 },
    "6x1-reveza": { modo: "ciclo", trabalho: 6, folga: 1, entrada: "08:00", saida: "16:20", intervalo: 60 },
    "12x36": { modo: "ciclo", trabalho: 1, folga: 1, entrada: "07:00", saida: "19:00", intervalo: 60 },
    "semana": { modo: "semana" },
    "ciclo": { modo: "ciclo" }
  };

  // ---------- datas e horas ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function lerIso(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function somarDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function diasEntre(a, b) { return Math.round((b - a) / DIA_MS); }
  function dataBr(d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); }
  function horas(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return m ? h + "h" + pad(m) : h + "h";
  }
  function minutos(hhmm) {
    if (!/^\d{2}:\d{2}$/.test(hhmm || "")) return null;
    var p = hhmm.split(":").map(Number);
    return p[0] * 60 + p[1];
  }
  function normalizar(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }
  function hojeLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  // ---------- feriados ----------
  function pascoa(ano) { // algoritmo de Meeus/Jones/Butcher
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }

  function dataDaRegra(r, ano) {
    if (r.desde && ano < r.desde) return null;
    var d = null;
    if (r.data) {
      var p = r.data.split("-").map(Number);
      d = new Date(ano, p[0] - 1, p[1]);
    } else if (typeof r.pascoa === "number") {
      d = somarDias(pascoa(ano), r.pascoa);
    } else if (r.mes && r.ordem) {
      d = new Date(ano, r.mes - 1, 1);
      while (d.getDay() !== r.diaSemana) d = somarDias(d, 1);
      d = somarDias(d, 7 * (r.ordem - 1));
    }
    if (!d) return null;
    if (r.mover === "domingoSeguinte" && d.getDay() !== 0) d = somarDias(d, 7 - d.getDay());
    if (r.mover === "sextaSeguinte" && d.getDay() >= 2 && d.getDay() <= 4) d = somarDias(d, 5 - d.getDay());
    return d;
  }

  function chaveMunicipio(feriados, uf, cidade) {
    if (!feriados || !uf || !cidade) return null;
    var alvo = uf + "/" + normalizar(cidade);
    var achada = null;
    Object.keys(feriados.municipais || {}).forEach(function (k) {
      var p = k.split("/");
      if (p[0] + "/" + normalizar(p[1]) === alvo) achada = k;
    });
    return achada;
  }

  // Mapa "aaaa-mm-dd" -> { nome, tipo, origem, lei, extra }
  function feriadosDoAno(ano, feriados, cfg) {
    var mapa = {};
    if (!feriados) return mapa;
    function incluir(lista, origem) {
      (lista || []).forEach(function (r) {
        var d = dataDaRegra(r, ano);
        if (!d) return;
        var k = iso(d);
        var tipo = r.tipo === "facultativo" ? "facultativo" : "feriado";
        var atual = mapa[k];
        if (atual && atual.tipo === tipo && atual.nome !== r.nome) {
          // Dois feriados no mesmo dia: mostra os dois.
          atual.nome += " e " + r.nome;
          if (atual.origem !== origem) atual.origem += " e " + origem.toLowerCase();
          if (r.lei) atual.lei = atual.lei ? atual.lei + "; " + r.lei : r.lei;
        } else if (!atual || (tipo === "feriado" && atual.tipo === "facultativo")) {
          // Feriado vence ponto facultativo.
          mapa[k] = { nome: r.nome, tipo: tipo, origem: origem, lei: r.lei || "" };
        }
      });
    }
    incluir(feriados.nacionais, "Nacional");
    if (cfg.uf) incluir((feriados.estaduais || {})[cfg.uf], "Estadual");
    var municipio = chaveMunicipio(feriados, cfg.uf, cfg.cidade);
    if (municipio) incluir(feriados.municipais[municipio], "Municipal");
    (cfg.extras || []).forEach(function (x) {
      var d = lerIso(x.data);
      if (d && d.getFullYear() === ano) mapa[x.data] = { nome: x.nome, tipo: "feriado", origem: "Adicionado por você", lei: "", extra: true };
    });
    return mapa;
  }

  function mapaDoIntervalo(ini, fim, feriados, cfg) {
    var mapa = {};
    for (var a = ini.getFullYear(); a <= fim.getFullYear(); a++) Object.assign(mapa, feriadosDoAno(a, feriados, cfg));
    return mapa;
  }

  // ---------- escala ----------
  function jornadaMin(cfg) {
    var e = minutos(cfg.entrada), s = minutos(cfg.saida);
    if (e == null || s == null) return 0;
    var total = s > e ? s - e : s + 1440 - e; // saída menor que a entrada = vira a noite
    return Math.max(0, total - (Number(cfg.intervalo) || 0));
  }

  function diaDeEscala(cfg, d, hoje) {
    var p = PRESETS[cfg.escala] || PRESETS["5x2"];
    if (p.modo === "semana") return (cfg.dias || []).indexOf(d.getDay()) >= 0;
    var ciclo = cfg.ciclo || {};
    var ini = lerIso(ciclo.inicio) || hoje || hojeLocal();
    var t = Math.max(1, Number(ciclo.trabalho) || 1), f = Math.max(1, Number(ciclo.folga) || 1);
    var n = ((diasEntre(ini, d) % (t + f)) + (t + f)) % (t + f);
    return n < t;
  }

  // Situação de um dia: { trabalha, rotulo, classe, feriado }
  function situacao(cfg, d, mapa, hoje) {
    var k = iso(d);
    var fer = mapa[k];
    var escala = diaDeEscala(cfg, d, hoje);
    var ajuste = (cfg.ajustes || {})[k]; // "folga" | "trabalho"
    if (!escala) return { trabalha: false, rotulo: fer ? "Folga · " + fer.nome : "Folga", classe: fer ? "folga feriado" : "folga", feriado: fer };
    if (fer && fer.tipo === "feriado") {
      var trabalha = ajuste ? ajuste === "trabalho" : !!cfg.trabalhaFeriado;
      return trabalha
        ? { trabalha: true, rotulo: "Feriado trabalhado · " + fer.nome, classe: "feriado", feriado: fer }
        : { trabalha: false, rotulo: "Feriado · " + fer.nome, classe: "folga feriado", feriado: fer };
    }
    if (fer && fer.tipo === "facultativo") {
      return ajuste === "folga"
        ? { trabalha: false, rotulo: "Folga · " + fer.nome + " (ponto facultativo)", classe: "folga feriado", feriado: fer }
        : { trabalha: true, rotulo: "Trabalho · " + fer.nome + " é ponto facultativo", classe: "", feriado: fer };
    }
    return { trabalha: true, rotulo: "Trabalho", classe: "", feriado: null };
  }

  function etapaEm(etapas, d) {
    var atual = (etapas || [])[0];
    (etapas || []).forEach(function (e) { var i = lerIso(e.inicio); if (!i || i <= d) atual = e; });
    return atual;
  }

  // ---------- cálculo do período ----------
  // per = { ini: Date, fim: Date }. Usa semanas de segunda a domingo que tocam o período.
  function calcular(cfg, per, feriados, etapas, hoje) {
    var segunda = somarDias(per.ini, -((per.ini.getDay() + 6) % 7));
    var domingo = somarDias(per.fim, (7 - per.fim.getDay()) % 7);
    var mapa = mapaDoIntervalo(segunda, domingo, feriados, cfg);
    var jornada = jornadaMin(cfg);

    var dias = [];
    for (var d = segunda; d <= domingo; d = somarDias(d, 1)) {
      var s = situacao(cfg, d, mapa, hoje);
      dias.push({ data: d, sit: s, escala: diaDeEscala(cfg, d, hoje), min: s.trabalha ? jornada : 0, dentro: d >= per.ini && d <= per.fim });
    }

    var semanas = [];
    for (var i = 0; i < dias.length; i += 7) {
      var bloco = dias.slice(i, i + 7);
      var etapa = etapaEm(etapas, bloco[0].data);
      var total = bloco.reduce(function (t, x) { return t + x.min; }, 0);
      // Folga semanal é a da escala: feriado não substitui o descanso semanal.
      var folgas = bloco.filter(function (x) { return !x.escala; }).length;
      semanas.push({ dias: bloco, total: total, folgas: folgas, etapa: etapa,
        acima: !!etapa && total > etapa.horasSemanais * 60, poucasFolgas: !!etapa && folgas < etapa.folgasSemanais });
    }

    var noPeriodo = dias.filter(function (x) { return x.dentro; });
    var trabalhados = noPeriodo.filter(function (x) { return x.sit.trabalha; });

    // Na 12x36 a regra olha a média de horas no período, não cada semana.
    var media = null;
    if (cfg.escala === "12x36") {
      semanas.forEach(function (s) { s.acima = false; s.poucasFolgas = false; });
      var minPeriodo = trabalhados.reduce(function (t, x) { return t + x.min; }, 0);
      media = { min: minPeriodo / (noPeriodo.length / 7), etapa: etapaEm(etapas, per.fim) };
    }
    // Feriados que caem em dia de escala (os que caem na folga não mudam nada).
    var feriadosPeriodo = noPeriodo.filter(function (x) { return x.sit.feriado && x.escala; });

    return { dias: dias, semanas: semanas, noPeriodo: noPeriodo, trabalhados: trabalhados,
      feriadosPeriodo: feriadosPeriodo, media: media, mapa: mapa, jornada: jornada,
      minutosTotal: trabalhados.reduce(function (t, x) { return t + x.min; }, 0) };
  }

  var MotorPonto = {
    PRESETS: PRESETS, pad: pad, iso: iso, lerIso: lerIso, somarDias: somarDias, diasEntre: diasEntre, dataBr: dataBr,
    horas: horas, minutos: minutos, normalizar: normalizar, pascoa: pascoa, dataDaRegra: dataDaRegra,
    chaveMunicipio: chaveMunicipio, feriadosDoAno: feriadosDoAno, mapaDoIntervalo: mapaDoIntervalo,
    jornadaMin: jornadaMin, diaDeEscala: diaDeEscala, situacao: situacao, etapaEm: etapaEm, calcular: calcular
  };

  if (typeof module === "object" && module.exports) module.exports = MotorPonto;
  else raiz.MotorPonto = MotorPonto;
})(typeof window !== "undefined" ? window : this);
