/* Gera o código Pix "copia e cola" (BR Code estático do Banco Central) e o QR Code em SVG.
   Uso (uma vez, ou quando mudar a chave/cidade):
     node scripts/gerar-pix.js --cidade "GOIANIA"
   Precisa do pacote "qrcode" disponível (NODE_PATH apontando para a pasta onde ele foi instalado).
   Saída: site/assets/pix.json e site/assets/pix-qr.svg */
"use strict";
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const CHAVE = "024df450-24e1-44e9-bb57-728de50b8297";
const NOME = "ILTO MARTINS NAVES NETO";

function arg(nome) {
  const i = process.argv.indexOf("--" + nome);
  return i > 0 ? process.argv[i + 1] : "";
}

// Sem acentos, maiúsculas e só caracteres aceitos pelo BR Code.
function limpar(texto, max) {
  return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function campo(id, valor) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), como exige o padrão EMV do Pix.
function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function brCode(chave, nome, cidade) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave);
  const corpo =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("58", "BR") +
    campo("59", limpar(nome, 25)) +
    campo("60", limpar(cidade, 15)) +
    campo("62", campo("05", "***")) +
    "6304";
  return corpo + crc16(corpo);
}

async function main() {
  const cidade = arg("cidade");
  if (!limpar(cidade, 15)) {
    console.error('Informe a cidade: node scripts/gerar-pix.js --cidade "GOIANIA"');
    process.exit(1);
  }
  const codigo = brCode(CHAVE, NOME, cidade);
  const svg = await QRCode.toString(codigo, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#15171C", light: "#FFFFFF" } });
  const destino = path.join(__dirname, "..", "site", "assets");
  fs.writeFileSync(path.join(destino, "pix.json"), JSON.stringify({ chave: CHAVE, copiaECola: codigo }, null, 2) + "\n");
  fs.writeFileSync(path.join(destino, "pix-qr.svg"), svg);
  console.log("Código Pix:", codigo);
  console.log("Gravado em site/assets/pix.json e site/assets/pix-qr.svg");
}

if (require.main === module) main();
module.exports = { brCode, crc16 };
