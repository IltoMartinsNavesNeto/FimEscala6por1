/* Nova Jornada: administração dos pagamentos por Pix.
   Só funciona para contas cadastradas na tabela "admins" (o banco confere em cada ação). */
(function () {
  "use strict";
  var S = window.Supa, M = window.MotorPonto;
  var $ = function (id) { return document.getElementById(id); };
  var empresas = {};

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function data(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return M.pad(d.getDate()) + "/" + M.pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + M.pad(d.getHours()) + ":" + M.pad(d.getMinutes());
  }
  function dia(iso) { var d = M.lerIso(iso); return d ? M.pad(d.getDate()) + "/" + M.pad(d.getMonth() + 1) + "/" + d.getFullYear() : "—"; }
  function avisar(texto, tipo) {
    var a = $("aviso");
    a.textContent = texto || "";
    a.className = "emp-aviso" + (tipo ? " emp-aviso--" + tipo : "");
    a.hidden = !texto;
  }
  function cabecalho(t, titulos) {
    var thead = el("thead"), tr = el("tr");
    titulos.forEach(function (x) { var th = el("th", null, x); th.scope = "col"; tr.append(th); });
    thead.append(tr);
    t.append(thead);
  }

  function carregar() {
    return Promise.all([
      S.ler("empresas?select=id,nome,uf,cidade,pago_ate,criada_em&order=criada_em.desc"),
      S.ler("pedidos_pix?select=*&status=eq.aguardando&order=criado_em.asc")
    ]).then(function (r) {
      empresas = {};
      r[0].forEach(function (e) { empresas[e.id] = e; });
      montarPedidos(r[1]);
      montarEmpresas(r[0]);
    });
  }

  function montarPedidos(pedidos) {
    var t = $("tabela-pedidos");
    t.replaceChildren();
    $("pedidos-vazio").hidden = pedidos.length > 0;
    t.parentElement.hidden = !pedidos.length;
    if (!pedidos.length) return;
    cabecalho(t, ["Avisado em", "Empresa", "Identificador", "Valor", "Liberado até", ""]);
    var tbody = el("tbody");
    pedidos.forEach(function (p) {
      var e = empresas[p.empresa_id] || {};
      var tr = el("tr");
      var acoes = el("td", "emp-acoes");
      var ok = el("button", null, "Confirmar");
      ok.type = "button";
      ok.addEventListener("click", function () { decidir(p, true, ok); });
      var nao = el("button", null, "Recusar");
      nao.type = "button";
      nao.addEventListener("click", function () { decidir(p, false, nao); });
      acoes.append(ok, nao);
      var nome = el("td", "emp-nome");
      nome.append(el("strong", null, e.nome || p.empresa_id), el("span", "emp-cargo", [e.cidade, e.uf].filter(Boolean).join(" / ")));
      tr.append(el("td", null, data(p.criado_em)), nome, el("td", null, p.txid), el("td", null, "R$ " + Number(p.valor).toFixed(2).replace(".", ",")), el("td", null, dia(p.liberado_ate)), acoes);
      tbody.append(tr);
    });
    t.append(tbody);
  }

  function montarEmpresas(lista) {
    var t = $("tabela-empresas");
    t.replaceChildren();
    cabecalho(t, ["Empresa", "Cidade", "Cadastrada em", "Pago até"]);
    var tbody = el("tbody");
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    lista.forEach(function (e) {
      var ativa = e.pago_ate && M.lerIso(e.pago_ate) >= hoje;
      var tr = el("tr");
      tr.append(el("td", null, e.nome), el("td", null, [e.cidade, e.uf].filter(Boolean).join(" / ")),
        el("td", null, data(e.criada_em)), el("td", ativa ? null : "emp-situacao--alerta", e.pago_ate ? dia(e.pago_ate) : "Nunca pagou"));
      tbody.append(tr);
    });
    t.append(tbody);
  }

  function decidir(p, confirmar, botao) {
    var e = empresas[p.empresa_id] || {};
    var pergunta = confirmar
      ? "Confirmar que o Pix de " + (e.nome || "empresa") + " (" + p.txid + ") chegou?"
      : "O Pix de " + (e.nome || "empresa") + " não chegou? Recusar retira o mês que foi liberado.";
    if (!window.confirm(pergunta)) return;
    botao.disabled = true;
    S.rpc(confirmar ? "confirmar_pix" : "recusar_pix", { p_pedido: p.id })
      .then(function (fim) {
        avisar(confirmar ? "Pix de " + (e.nome || "empresa") + " confirmado (liberado até " + dia(fim) + ")."
          : "Aviso recusado. " + (e.nome || "A empresa") + " ficou com acesso até " + dia(fim) + ".", "ok");
        return carregar();
      })
      .catch(function (err) { botao.disabled = false; avisar("Não deu: " + err.message, "erro"); });
  }

  if (!S.configurado) { avisar("Supabase não configurado.", "erro"); return; }
  if (!S.logado()) { location.href = "./"; return; }
  S.rpc("eh_admin").then(function (ok) {
    if (ok !== true) { avisar("Esta página é só para administradores.", "erro"); $("conteudo").querySelectorAll("h2, .ponto__tabela-caixa, .intro").forEach(function (n) { n.hidden = true; }); return; }
    return carregar();
  }).catch(function (e) { avisar("Não deu para carregar: " + e.message, "erro"); });
})();
