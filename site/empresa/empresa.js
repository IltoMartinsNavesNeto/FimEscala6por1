/* Nova Jornada: área da empresa.
   Login com Google (Supabase), cadastro da empresa, colaboradores com escala e horário,
   visão da equipe no mês e espelho de cada colaborador (mesmo motor do "Meu ponto"). */
(function () {
  "use strict";

  var M = window.MotorPonto;
  var S = window.Supa;
  var PRECO = (window.CONFIG_EMPRESA && window.CONFIG_EMPRESA.preco) || 10;
  var MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
  var NOMES_ESCALA = { "5x2": "5x2", "6x1-fixa": "6x1 folga fixa", "6x1-reveza": "6x1 revezando", "12x36": "12x36", "semana": "Dias fixos", "ciclo": "Revezamento" };
  var UFS = [
    ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
    ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
    ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
    ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
    ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var feriados = null, etapas = [];
  var empresa = null, colaboradores = [], editando = null, detalheId = null, pedido = null;
  var hoje = (function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  var periodo = { mes: hoje.getMonth(), ano: hoje.getFullYear() };

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function dataLonga(iso) { var d = M.lerIso(iso); return d ? M.pad(d.getDate()) + "/" + M.pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; }
  function mostrar(id) { ["tela-config", "tela-entrar", "tela-cadastro", "tela-painel"].forEach(function (t) { $(t).hidden = t !== id; }); }
  function avisar(texto, tipo) {
    var a = $("aviso");
    a.textContent = texto || "";
    a.className = "emp-aviso" + (tipo ? " emp-aviso--" + tipo : "");
    a.hidden = !texto;
  }
  function ativa() { var d = empresa && M.lerIso(empresa.pago_ate); return !!d && d >= hoje; }

  // ---------- início ----------
  function iniciar() {
    if (!S.configurado) { mostrar("tela-config"); return; }
    $("preco-texto").textContent = "R$ " + PRECO + " por mês por empresa, sem fidelidade. Pagamento por Pix.";
    var erro = S.lerRetorno();
    if (erro) avisar("Não deu para entrar com o Google: " + erro, "erro");

    $("botao-google").addEventListener("click", S.entrarComGoogle);
    $("botao-sair").addEventListener("click", function () { S.sair().then(function () { location.reload(); }); });

    Promise.all([
      fetch("../feriados.json").then(function (r) { return r.json(); }),
      fetch("../dados.json").then(function (r) { return r.json(); })
    ]).then(function (res) {
      feriados = res[0];
      etapas = res[1].etapas || [];
      if (!S.logado()) { mostrar("tela-entrar"); return; }
      $("botao-sair").hidden = false;
      S.rpc("eh_admin").then(function (v) { $("link-admin").hidden = v !== true; }).catch(function () {});
      return carregarEmpresa();
    }).catch(function (e) {
      console.error(e);
      if (e && e.status === 401) { S.sair().then(function () { mostrar("tela-entrar"); }); return; }
      avisar("Não deu para carregar a área da empresa. Recarregue a página em instantes.", "erro");
    });
  }

  function carregarEmpresa() {
    return S.ler("empresas?select=*").then(function (lista) {
      empresa = (lista || [])[0] || null;
      if (!empresa) { montarCadastro(); mostrar("tela-cadastro"); return; }
      return Promise.all([carregarColaboradores(), carregarPedido()]).then(function () { montarPainel(); mostrar("tela-painel"); });
    });
  }

  function carregarColaboradores() {
    return S.ler("colaboradores?select=*&empresa_id=eq." + empresa.id + "&order=nome.asc").then(function (lista) {
      colaboradores = lista || [];
    });
  }

  // ---------- cidades (IBGE) ----------
  function preencherUFs(sel) {
    UFS.forEach(function (u) { var o = el("option", null, u[1]); o.value = u[0]; sel.append(o); });
  }
  function carregarCidades(uf, sel, valor) {
    sel.replaceChildren(el("option", null, uf ? "Carregando cidades…" : "Escolha o estado primeiro"));
    sel.firstChild.value = "";
    sel.disabled = true;
    if (!uf) return;
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/" + uf + "/municipios?orderBy=nome")
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (lista) {
        sel.replaceChildren();
        var vazio = el("option", null, "Escolha a cidade");
        vazio.value = "";
        sel.append(vazio);
        lista.forEach(function (c) { var o = el("option", null, c.nome); o.value = c.nome; sel.append(o); });
        sel.disabled = false;
        if (valor) sel.value = valor;
      })
      .catch(function () { sel.firstChild.textContent = "Lista indisponível"; });
  }

  // ---------- cadastro da empresa ----------
  function montarCadastro() {
    var uf = $("empresa-uf");
    if (uf.options.length <= 1) preencherUFs(uf);
    uf.onchange = function () { carregarCidades(uf.value, $("empresa-cidade")); };
    $("form-empresa").onsubmit = function (ev) {
      ev.preventDefault();
      var nome = $("empresa-nome").value.trim();
      if (nome.length < 2) { $("empresa-nome").focus(); return; }
      if (!uf.value) { uf.focus(); return; }
      S.inserir("empresas", { nome: nome, uf: uf.value, cidade: $("empresa-cidade").value || null })
        .then(function () { avisar("Empresa cadastrada. Agora é só pagar o primeiro mês para cadastrar a equipe.", "ok"); return carregarEmpresa(); })
        .catch(function (e) { avisar("Não deu para cadastrar a empresa: " + e.message, "erro"); });
    };
  }

  // ---------- pagamento por Pix ----------
  // A empresa gera o Pix copia e cola (valor e identificador próprios), paga e avisa.
  // O administrador confere o extrato e confirma em /empresa/admin.html, o que libera 1 mês.
  function txidDaEmpresa() { return ("NJ" + empresa.id.replace(/-/g, "")).slice(0, 25).toUpperCase(); }

  function carregarPedido() {
    return S.ler("pedidos_pix?select=*&empresa_id=eq." + empresa.id + "&order=criado_em.desc&limit=1")
      .then(function (l) { pedido = (l || [])[0] || null; })
      .catch(function () { pedido = null; });
  }

  function aguardando() { return !!(pedido && pedido.status === "aguardando"); }

  function abrirPix() {
    var pix = (window.CONFIG_EMPRESA || {}).pix || {};
    var codigo = window.PixCodigo.gerar({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: PRECO, txid: txidDaEmpresa() });
    $("pix-codigo").value = codigo;
    var qr = $("pix-qr");
    if (window.QRMini) {
      qr.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(window.QRMini.svg(codigo));
      qr.parentElement.hidden = false;
    } else qr.parentElement.hidden = true;
    $("pix-valor").textContent = "R$ " + PRECO.toFixed(2).replace(".", ",");
    $("pix-recebedor").textContent = pix.nome || "";
    $("pix-identificador").textContent = txidDaEmpresa();
    $("pix-msg").textContent = "";
    $("pix-avisei").disabled = aguardando();
    $("pix-avisei").textContent = aguardando() ? "Pix em conferência" : "Já fiz o Pix";
    $("dialogo-pix").showModal();
  }

  function copiarCodigo() {
    var campo = $("pix-codigo"), msg = $("pix-msg");
    var feito = function () { msg.textContent = "Código copiado. No app do banco: Pix › Pix copia e cola."; };
    var antigo = function () {
      campo.select();
      try { document.execCommand("copy"); feito(); } catch (e) { msg.textContent = "Selecione o código e copie."; }
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(campo.value).then(feito, antigo);
    else antigo();
  }

  function aviseiPix() {
    var b = $("pix-avisei");
    b.disabled = true;
    // O banco libera 1 mês na hora; o administrador confere o extrato depois.
    S.rpc("avisar_pix", { p_empresa: empresa.id, p_txid: txidDaEmpresa() })
      .then(function () { return Promise.all([S.ler("empresas?select=*"), carregarPedido()]); })
      .then(function (r) {
        empresa = r[0][0] || empresa;
        $("dialogo-pix").close();
        montarPainel();
        avisar("Acesso liberado até " + dataLonga(empresa.pago_ate) + ". Vamos conferir o Pix; se ele não chegar, o mês liberado é retirado.", "ok");
      })
      .catch(function (e) {
        b.disabled = false;
        $("pix-msg").textContent = /aguardando confer/i.test(e.message)
          ? "Você já avisou um Pix que ainda está em conferência. Aguarde a conferência para avisar outro."
          : "Não deu para enviar o aviso: " + e.message;
      });
  }

  // ---------- painel ----------
  function montarPainel() {
    $("painel-nome").textContent = empresa.nome;
    $("painel-local").textContent = [empresa.cidade, empresa.uf].filter(Boolean).join(" / ") +
      " · os feriados dessa cidade valem para toda a equipe";
    montarPlano();

    var mes = $("painel-mes");
    if (!mes.options.length) {
      MESES.forEach(function (m, i) { var o = el("option", null, m); o.value = String(i); mes.append(o); });
      mes.addEventListener("change", function () { periodo.mes = Number(mes.value); montarEquipe(); });
      $("painel-ano").addEventListener("input", function () {
        var a = Number(this.value);
        if (a >= 2024 && a <= 2035) { periodo.ano = a; montarEquipe(); }
      });
      $("botao-novo").addEventListener("click", function () { abrirFormulario(null); });
      $("botao-pagar").addEventListener("click", abrirPix);
      $("pix-copiar").addEventListener("click", copiarCodigo);
      $("pix-avisei").addEventListener("click", aviseiPix);
      $("pix-fechar").addEventListener("click", function () { $("dialogo-pix").close(); });
      $("detalhe-fechar").addEventListener("click", function () { detalheId = null; $("detalhe").hidden = true; });
      $("detalhe-imprimir").addEventListener("click", function () {
        document.body.classList.add("imprimindo-detalhe");
        window.print();
        document.body.classList.remove("imprimindo-detalhe");
      });
      montarFormularioColaborador();
    }
    mes.value = String(periodo.mes);
    $("painel-ano").value = periodo.ano;
    montarEquipe();
  }

  function montarPlano() {
    var selo = $("plano-selo"), texto = $("plano-texto"), b = $("botao-pagar");
    var ok = ativa();
    selo.textContent = ok ? "Plano ativo" : "Pagamento pendente";
    selo.className = "emp-selo" + (ok ? " emp-selo--ok" : "");
    texto.textContent = ok
      ? "Liberado até " + dataLonga(empresa.pago_ate) + "."
      : (empresa.pago_ate ? "Venceu em " + dataLonga(empresa.pago_ate) + ". " : "") + "Pague R$ " + PRECO + " para cadastrar e editar colaboradores.";
    if (aguardando() && ok) {
      selo.textContent = "Plano ativo · Pix em conferência";
      texto.textContent = "Liberado até " + dataLonga(empresa.pago_ate) + ". Seu último Pix está em conferência.";
    }
    // Quanto falta até vencer (o acesso vale até o fim do dia de pago_ate).
    var prazo = $("plano-prazo");
    prazo.hidden = !ok;
    if (ok) {
      var dias = M.diasEntre(hoje, M.lerIso(empresa.pago_ate));
      $("prazo-dias").textContent = dias === 0 ? "Vence hoje" : "Faltam " + dias;
      $("prazo-unidade").textContent = dias === 0 ? "" : (dias === 1 ? "dia" : "dias");
      $("prazo-barra").style.width = Math.max(4, Math.min(100, Math.round((dias + 1) / 31 * 100))) + "%";
      prazo.classList.toggle("emp-prazo--perto", dias <= 5);
      if (dias <= 5 && !aguardando()) {
        texto.textContent = "Liberado até " + dataLonga(empresa.pago_ate) + ". Renove para não perder o acesso ao cadastro da equipe.";
      }
    }
    b.textContent = ok ? "Pagar mais 1 mês com Pix (R$ " + PRECO + ")" : "Pagar R$ " + PRECO + " com Pix";
    b.disabled = aguardando();
    b.title = aguardando() ? "Disponível depois da conferência do último Pix" : "";
    $("botao-novo").disabled = !ok;
    $("botao-novo").title = ok ? "" : "Disponível com o plano ativo";
  }

  function configDe(c) {
    return Object.assign({}, c.escala, { uf: empresa.uf, cidade: empresa.cidade });
  }

  function per() {
    return { ini: new Date(periodo.ano, periodo.mes, 1), fim: new Date(periodo.ano, periodo.mes + 1, 0) };
  }

  function resumoColaborador(c) {
    var r = M.calcular(configDe(c), per(), feriados, etapas, hoje);
    var acima = r.semanas.filter(function (s) { return s.acima; }).length;
    var poucas = r.semanas.filter(function (s) { return s.poucasFolgas; }).length;
    var ferTrab = r.feriadosPeriodo.filter(function (x) { return x.sit.trabalha && x.sit.feriado.tipo === "feriado"; }).length;
    var mediaAcima = r.media && r.media.etapa && r.media.min > r.media.etapa.horasSemanais * 60;
    var alertas = [];
    if (acima) alertas.push(acima + (acima === 1 ? " semana" : " semanas") + " acima do limite");
    if (poucas) alertas.push(poucas + (poucas === 1 ? " semana" : " semanas") + " sem as folgas exigidas");
    if (mediaAcima) alertas.push("média de " + M.horas(r.media.min) + "/semana acima de " + r.media.etapa.horasSemanais + "h");
    if (ferTrab) alertas.push(ferTrab + (ferTrab === 1 ? " feriado trabalhado" : " feriados trabalhados"));
    return { r: r, alertas: alertas, problema: !!(acima || poucas || mediaAcima) };
  }

  function descreverEscala(e) {
    var p = M.PRESETS[e.escala] || M.PRESETS["5x2"];
    var nome = NOMES_ESCALA[e.escala] || "Escala";
    if (p.modo === "semana") {
      var dias = ORDEM_DIAS.filter(function (d) { return (e.dias || []).indexOf(d) >= 0; }).map(function (d) { return DIAS_CURTOS[d]; });
      return nome + " · " + (dias.length ? dias.join(", ") : "sem dias");
    }
    var c = e.ciclo || {};
    return nome + " · " + c.trabalho + "x" + c.folga + (c.inicio ? " desde " + dataLonga(c.inicio) : "");
  }

  function cartao(rotulo, numero, legenda) {
    var c = el("div", "cartao");
    c.append(el("p", "cartao__rotulo", rotulo), el("p", "ponto__numero", numero));
    if (legenda) c.append(el("p", null, legenda));
    return c;
  }

  function montarEquipe() {
    var t = $("equipe-tabela");
    t.replaceChildren();
    var ativos = colaboradores.filter(function (c) { return c.ativo !== false; });
    $("equipe-vazio").hidden = ativos.length > 0;
    $("equipe-tabela").parentElement.hidden = ativos.length === 0;

    var totalMin = 0, comProblema = 0;
    var linhas = ativos.map(function (c) {
      var s = resumoColaborador(c);
      totalMin += s.r.minutosTotal;
      if (s.problema) comProblema++;
      return { c: c, s: s };
    });
    var mapaMes = M.mapaDoIntervalo(per().ini, per().fim, feriados, { uf: empresa.uf, cidade: empresa.cidade });
    var ferMes = Object.keys(mapaMes).filter(function (k) { var d = M.lerIso(k); return d >= per().ini && d <= per().fim && mapaMes[k].tipo === "feriado"; }).length;
    $("equipe-resumo").replaceChildren(
      cartao("Colaboradores", String(ativos.length), MESES[periodo.mes] + " de " + periodo.ano),
      cartao("Horas planejadas", M.horas(totalMin), "somando a equipe no mês"),
      cartao("Com alerta", String(comProblema), comProblema ? "passam do limite ou faltam folgas" : "todos dentro das regras"),
      cartao("Feriados no mês", String(ferMes), [empresa.cidade, empresa.uf].filter(Boolean).join("/"))
    );
    if (!ativos.length) return;

    var thead = el("thead"), tr = el("tr");
    ["Colaborador", "Escala", "Horário", "Dias", "Horas", "Situação", ""].forEach(function (h, i) {
      var th = el("th", i === 3 || i === 4 ? "num" : null, h);
      th.scope = "col";
      tr.append(th);
    });
    thead.append(tr);
    t.append(thead);

    var tbody = el("tbody");
    linhas.forEach(function (x) {
      var c = x.c, s = x.s, e = c.escala || {};
      var linha = el("tr", s.problema ? "emp-linha--alerta" : null);
      var nome = el("td", "emp-nome");
      nome.append(el("strong", null, c.nome));
      if (c.cargo) nome.append(el("span", "emp-cargo", c.cargo));
      var situacao = el("td", "situacao");
      situacao.append(el("span", "emp-situacao" + (s.problema ? " emp-situacao--alerta" : ""), s.alertas.length ? s.alertas.join(" · ") : "Dentro das regras"));
      var acoes = el("td", "emp-acoes");
      acoes.append(botao("Ver espelho", function () { abrirDetalhe(c.id); }));
      var ed = botao("Editar", function () { abrirFormulario(c); });
      var rm = botao("Remover", function () { remover(c); });
      if (!ativa()) { ed.disabled = true; rm.disabled = true; }
      acoes.append(ed, rm);
      linha.append(
        nome,
        el("td", "situacao", descreverEscala(e)),
        el("td", null, (e.entrada || "—") + "–" + (e.saida || "—")),
        el("td", "num", String(s.r.trabalhados.length)),
        el("td", "num", M.horas(s.r.minutosTotal)),
        situacao, acoes
      );
      tbody.append(linha);
    });
    t.append(tbody);
    if (detalheId) abrirDetalhe(detalheId);
  }

  function botao(texto, acao) {
    var b = el("button", null, texto);
    b.type = "button";
    b.addEventListener("click", acao);
    return b;
  }

  // ---------- espelho de um colaborador ----------
  function abrirDetalhe(id) {
    var c = colaboradores.find(function (x) { return x.id === id; });
    if (!c) return;
    detalheId = id;
    var s = resumoColaborador(c), e = c.escala || {};
    $("detalhe-titulo").textContent = c.nome + " · " + MESES[periodo.mes] + " de " + periodo.ano;
    var al = $("detalhe-alertas");
    al.replaceChildren();
    if (s.alertas.length) s.alertas.forEach(function (a) { al.append(el("li", null, a)); });
    else al.append(el("li", "ok", "Nenhuma semana passa do limite de horas nem fica sem as folgas exigidas."));

    var t = $("detalhe-tabela");
    t.replaceChildren();
    var thead = el("thead"), tr = el("tr");
    ["Data", "Dia", "Situação", "Entrada", "Saída", "Intervalo", "Horas"].forEach(function (h, i) {
      var th = el("th", i === 6 ? "num" : null, h);
      th.scope = "col";
      tr.append(th);
    });
    thead.append(tr);
    t.append(thead);
    var tbody = el("tbody"), intervalo = Number(e.intervalo) || 0;
    s.r.semanas.forEach(function (sem) {
      sem.dias.forEach(function (x) {
        if (!x.dentro) return;
        var l = el("tr", x.sit.classe || null);
        [M.dataBr(x.data), DIAS_CURTOS[x.data.getDay()], x.sit.rotulo,
          x.sit.trabalha ? e.entrada : "—", x.sit.trabalha ? e.saida : "—",
          x.sit.trabalha && intervalo ? M.horas(intervalo) : "—", x.sit.trabalha ? M.horas(x.min) : "—"
        ].forEach(function (v, i) { l.append(el("td", i === 2 ? "situacao" : i === 6 ? "num" : null, v)); });
        tbody.append(l);
      });
      var resumo = el("tr", "semana" + (sem.acima || sem.poucasFolgas ? " acima" : ""));
      var td = el("td", null, "Semana de " + M.dataBr(sem.dias[0].data) + " a " + M.dataBr(sem.dias[6].data) + ": " + sem.folgas +
        (sem.folgas === 1 ? " folga" : " folgas") + (sem.etapa ? " · limite " + sem.etapa.horasSemanais + "h" : "") + (sem.acima ? " · acima do limite" : ""));
      td.colSpan = 6;
      resumo.append(td, el("td", "num", M.horas(sem.total)));
      tbody.append(resumo);
    });
    t.append(tbody);
    var tfoot = el("tfoot"), tot = el("tr"), rot = el("td", null, "Total do mês");
    rot.colSpan = 6;
    tot.append(rot, el("td", "num", M.horas(s.r.minutosTotal)));
    tfoot.append(tot);
    t.append(tfoot);
    $("detalhe").hidden = false;
  }

  // ---------- cadastro de colaborador ----------
  function montarFormularioColaborador() {
    var dias = $("colab-dias");
    ORDEM_DIAS.forEach(function (n) {
      var rot = el("label", "ponto__dia"), cb = el("input");
      cb.type = "checkbox";
      cb.value = String(n);
      cb.setAttribute("aria-label", ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][n]);
      rot.append(cb, el("span", null, DIAS_CURTOS[n]));
      dias.append(rot);
    });
    $("colab-escala").addEventListener("change", function () { aplicarPreset(this.value); });
    $("colab-cancelar").addEventListener("click", function () { $("dialogo-colab").close(); });
    $("form-colab").addEventListener("submit", function (ev) { ev.preventDefault(); salvarColaborador(); });
  }

  function aplicarPreset(nome) {
    var p = M.PRESETS[nome] || {};
    if (p.dias) marcarDias(p.dias);
    if (p.trabalho) { $("colab-ciclo-trabalho").value = p.trabalho; $("colab-ciclo-folga").value = p.folga; }
    if (p.entrada) { $("colab-entrada").value = p.entrada; $("colab-saida").value = p.saida; $("colab-intervalo").value = String(p.intervalo); }
    var modo = p.modo || "semana";
    $("colab-dias").hidden = modo !== "semana";
    $("colab-ciclo").hidden = modo !== "ciclo";
  }

  function marcarDias(lista) {
    $("colab-dias").querySelectorAll("input").forEach(function (cb) { cb.checked = lista.indexOf(Number(cb.value)) >= 0; });
  }

  function abrirFormulario(c) {
    if (!ativa()) { avisar("Pague o mês para cadastrar e editar colaboradores.", "erro"); return; }
    editando = c;
    $("colab-titulo").textContent = c ? "Editar colaborador" : "Novo colaborador";
    $("colab-erro").textContent = "";
    var e = c ? c.escala : { escala: "5x2", ciclo: { inicio: M.iso(hoje) } };
    $("colab-nome").value = c ? c.nome : "";
    $("colab-cargo").value = c ? (c.cargo || "") : "";
    $("colab-escala").value = M.PRESETS[e.escala] ? e.escala : "5x2";
    aplicarPreset($("colab-escala").value);
    if (c) {
      marcarDias(e.dias || []);
      $("colab-ciclo-trabalho").value = (e.ciclo || {}).trabalho || 6;
      $("colab-ciclo-folga").value = (e.ciclo || {}).folga || 1;
      $("colab-entrada").value = e.entrada || "08:00";
      $("colab-saida").value = e.saida || "17:00";
      $("colab-intervalo").value = String(e.intervalo != null ? e.intervalo : 60);
    }
    $("colab-ciclo-inicio").value = (e.ciclo || {}).inicio || M.iso(hoje);
    $("colab-feriado").checked = !!e.trabalhaFeriado;
    $("dialogo-colab").showModal();
    $("colab-nome").focus();
  }

  function lerFormulario() {
    var dias = Array.prototype.filter.call($("colab-dias").querySelectorAll("input"), function (cb) { return cb.checked; })
      .map(function (cb) { return Number(cb.value); });
    return {
      nome: $("colab-nome").value.trim().slice(0, 120),
      cargo: $("colab-cargo").value.trim().slice(0, 80) || null,
      escala: {
        escala: $("colab-escala").value,
        dias: dias,
        ciclo: { trabalho: Number($("colab-ciclo-trabalho").value) || 1, folga: Number($("colab-ciclo-folga").value) || 1, inicio: $("colab-ciclo-inicio").value || M.iso(hoje) },
        entrada: $("colab-entrada").value || "08:00",
        saida: $("colab-saida").value || "17:00",
        intervalo: Number($("colab-intervalo").value) || 0,
        trabalhaFeriado: $("colab-feriado").checked
      }
    };
  }

  function salvarColaborador() {
    var d = lerFormulario();
    var erro = $("colab-erro");
    if (d.nome.length < 2) { erro.textContent = "Informe o nome do colaborador."; $("colab-nome").focus(); return; }
    if ((M.PRESETS[d.escala.escala] || {}).modo === "semana" && !d.escala.dias.length) { erro.textContent = "Marque pelo menos um dia de trabalho."; return; }
    if (!M.jornadaMin(d.escala)) { erro.textContent = "Confira a entrada, a saída e o intervalo."; return; }
    $("colab-salvar").disabled = true;
    var pedido = editando
      ? S.atualizar("colaboradores?id=eq." + editando.id, d)
      : S.inserir("colaboradores", Object.assign({ empresa_id: empresa.id }, d));
    pedido.then(function () { return carregarColaboradores(); }).then(function () {
      $("dialogo-colab").close();
      montarEquipe();
      avisar(editando ? "Colaborador atualizado." : "Colaborador cadastrado.", "ok");
    }).catch(function (e) {
      erro.textContent = /row-level security|permission|42501/i.test(e.message)
        ? "O plano não está ativo. Pague o mês para salvar."
        : "Não deu para salvar: " + e.message;
    }).then(function () { $("colab-salvar").disabled = false; });
  }

  function remover(c) {
    if (!window.confirm("Remover " + c.nome + " da equipe? Essa ação não pode ser desfeita.")) return;
    S.apagar("colaboradores?id=eq." + c.id).then(function () { return carregarColaboradores(); }).then(function () {
      if (detalheId === c.id) { detalheId = null; $("detalhe").hidden = true; }
      montarEquipe();
      avisar(c.nome + " não faz mais parte da equipe.", "ok");
    }).catch(function (e) { avisar("Não deu para remover: " + e.message, "erro"); });
  }

  iniciar();
})();
