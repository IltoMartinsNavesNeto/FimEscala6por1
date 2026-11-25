/* Cliente mínimo do Supabase (login com Google, banco e funções) feito com fetch,
   para não carregar bibliotecas de terceiros no site. */
(function () {
  "use strict";
  var cfg = window.CONFIG_EMPRESA || {};
  var URL_BASE = String(cfg.supabaseUrl || "").replace(/\/$/, "");
  var CHAVE = cfg.supabaseAnonKey || "";
  var GUARDA = "empresa-sessao";
  var sessao = ler();

  function ler() {
    try { return JSON.parse(localStorage.getItem(GUARDA) || "null"); } catch (e) { return null; }
  }
  function guardar(s) {
    sessao = s;
    try { s ? localStorage.setItem(GUARDA, JSON.stringify(s)) : localStorage.removeItem(GUARDA); } catch (e) { /* modo privado */ }
  }

  // Volta do Google: o Supabase devolve os tokens no "#" da URL.
  function lerRetorno() {
    if (!location.hash || location.hash.length < 2) return null;
    var p = new URLSearchParams(location.hash.slice(1));
    var erro = p.get("error_description");
    if (p.get("access_token")) {
      var expira = Number(p.get("expires_at")) || (Math.floor(Date.now() / 1000) + (Number(p.get("expires_in")) || 3600));
      guardar({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: expira });
    }
    if (p.get("access_token") || erro) history.replaceState(null, "", location.pathname + location.search);
    return erro;
  }

  function cabecalhos(extra) {
    var h = { apikey: CHAVE, "Content-Type": "application/json" };
    if (sessao && sessao.access_token) h.Authorization = "Bearer " + sessao.access_token;
    return Object.assign(h, extra || {});
  }

  function renovar() {
    if (!sessao || !sessao.refresh_token) return Promise.resolve(false);
    return fetch(URL_BASE + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: CHAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: sessao.refresh_token })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.access_token) { guardar(null); return false; }
      guardar({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)) });
      return true;
    }).catch(function () { return false; });
  }

  function garantirToken() {
    if (sessao && sessao.expires_at && sessao.expires_at - 60 > Date.now() / 1000) return Promise.resolve(true);
    return renovar();
  }

  function pedir(metodo, caminho, corpo, extra) {
    return garantirToken().then(function () {
      return fetch(URL_BASE + caminho, { method: metodo, headers: cabecalhos(extra), body: corpo == null ? undefined : JSON.stringify(corpo) });
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.text().then(function (t) {
        var dados = t ? JSON.parse(t) : null;
        if (!r.ok) {
          var e = new Error((dados && (dados.message || dados.erro || dados.msg)) || ("Erro " + r.status));
          e.status = r.status;
          throw e;
        }
        return dados;
      });
    });
  }

  window.Supa = {
    configurado: !!(URL_BASE && CHAVE),
    lerRetorno: lerRetorno,
    logado: function () { return !!(sessao && sessao.access_token); },
    entrarComGoogle: function () {
      var volta = location.origin + location.pathname;
      location.href = URL_BASE + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(volta);
    },
    sair: function () {
      var p = sessao ? fetch(URL_BASE + "/auth/v1/logout", { method: "POST", headers: cabecalhos() }).catch(function () {}) : Promise.resolve();
      return p.then(function () { guardar(null); });
    },
    usuario: function () { return pedir("GET", "/auth/v1/user"); },
    // Banco (PostgREST): caminho no formato "tabela?filtros"
    ler: function (caminho) { return pedir("GET", "/rest/v1/" + caminho); },
    inserir: function (tabela, linha) { return pedir("POST", "/rest/v1/" + tabela, linha, { Prefer: "return=representation" }).then(function (d) { return d && d[0]; }); },
    atualizar: function (caminho, campos) { return pedir("PATCH", "/rest/v1/" + caminho, campos, { Prefer: "return=representation" }).then(function (d) { return d && d[0]; }); },
    apagar: function (caminho) { return pedir("DELETE", "/rest/v1/" + caminho); },
    rpc: function (nome, args) { return pedir("POST", "/rest/v1/rpc/" + nome, args || {}); }
  };
})();
