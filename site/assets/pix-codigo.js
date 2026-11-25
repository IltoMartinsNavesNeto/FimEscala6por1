/* Gera o Pix "copia e cola" (BR Code estático do Banco Central), com valor e identificador opcionais.
   Mesmo cálculo de scripts/gerar-pix.js (CRC16-CCITT conferido com o exemplo do manual do BCB). */
(function (raiz) {
  "use strict";

  function limpar(texto, max) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function campo(id, valor) { return id + String(valor.length).padStart(2, "0") + valor; }
  function crc16(texto) {
    var bytes = new TextEncoder().encode(texto), crc = 0xffff;
    for (var b = 0; b < bytes.length; b++) {
      crc ^= bytes[b] << 8;
      for (var i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  // opcoes: { chave, nome, cidade, valor (número), txid (até 25 letras/números) }
  function gerar(o) {
    var conta = campo("00", "br.gov.bcb.pix") + campo("01", o.chave);
    var txid = String(o.txid || "***").replace(/[^A-Za-z0-9*]/g, "").slice(0, 25) || "***";
    var corpo = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986") +
      (o.valor ? campo("54", Number(o.valor).toFixed(2)) : "") +
      campo("58", "BR") + campo("59", limpar(o.nome, 25)) + campo("60", limpar(o.cidade, 15)) +
      campo("62", campo("05", txid)) + "6304";
    return corpo + crc16(corpo);
  }

  var PixCodigo = { gerar: gerar, crc16: crc16 };
  if (typeof module === "object" && module.exports) module.exports = PixCodigo;
  else raiz.PixCodigo = PixCodigo;
})(typeof window !== "undefined" ? window : this);
