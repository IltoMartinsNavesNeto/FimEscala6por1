/* Modo claro / escuro.
   Sem escolha salva, segue o tema do sistema. A escolha fica só neste aparelho (localStorage), sem cookies. */
(function () {
  "use strict";
  var CHAVE = "tema";
  var raiz = document.documentElement;
  var sistema = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function salvo() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }

  function aplicar(tema) {
    raiz.setAttribute("data-tema", tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", tema === "escuro" ? "#111216" : "#15171C");
    var botao = document.getElementById("botao-tema");
    if (botao) {
      var escuro = tema === "escuro";
      botao.setAttribute("aria-pressed", String(escuro));
      botao.setAttribute("aria-label", escuro ? "Mudar para o modo claro" : "Mudar para o modo escuro");
      botao.title = botao.getAttribute("aria-label");
    }
  }

  // Roda antes de a página aparecer, para não piscar no tema errado.
  aplicar(salvo() || (sistema && sistema.matches ? "escuro" : "claro"));

  if (sistema && sistema.addEventListener) {
    sistema.addEventListener("change", function (e) {
      if (!salvo()) aplicar(e.matches ? "escuro" : "claro");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var botao = document.getElementById("botao-tema");
    if (!botao) return;
    aplicar(raiz.getAttribute("data-tema"));
    botao.addEventListener("click", function () {
      var novo = raiz.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
      try { localStorage.setItem(CHAVE, novo); } catch (e) { /* modo privado: vale só nesta visita */ }
      aplicar(novo);
    });
  });
})();
