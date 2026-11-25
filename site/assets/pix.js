/* Apoio por Pix: botões de copiar a chave e o código "copia e cola".
   O código e o QR são gerados uma vez (scripts/gerar-pix.js) e ficam em assets/pix.json e assets/pix-qr.svg. */
(function () {
  "use strict";
  var status = document.getElementById("pix-status");

  function avisar(texto) {
    if (!status) return;
    status.textContent = texto;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(function () { status.textContent = ""; }, 4000);
  }

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).catch(function () { return copiarAntigo(texto); });
    }
    return copiarAntigo(texto);
  }

  function copiarAntigo(texto) {
    return new Promise(function (ok, erro) {
      var area = document.createElement("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      try { document.execCommand("copy") ? ok() : erro(); } catch (e) { erro(e); }
      area.remove();
    });
  }

  document.querySelectorAll("[data-copiar]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      var alvo = document.getElementById(botao.getAttribute("data-copiar"));
      var texto = alvo ? (alvo.value || alvo.textContent || "").trim() : "";
      if (!texto) return;
      copiar(texto).then(
        function () { avisar(botao.id === "pix-botao-codigo" ? "Código Pix copiado. Cole em Pix › Copia e cola." : "Chave copiada. Cole em Pix › Pagar com chave."); },
        function () { avisar("Não deu para copiar automaticamente. Selecione o texto e copie."); }
      );
    });
  });

  // Mostra o QR e o "copia e cola" só quando já tiverem sido gerados.
  fetch("assets/pix.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (p) {
      if (!p || typeof p.copiaECola !== "string" || p.copiaECola.indexOf("br.gov.bcb.pix") < 0) return;
      document.getElementById("pix-copia-cola").value = p.copiaECola;
      document.getElementById("pix-botao-codigo").hidden = false;
      document.getElementById("pix-qr").hidden = false;
    })
    .catch(function () { /* sem QR gerado: fica só a chave */ });
})();
