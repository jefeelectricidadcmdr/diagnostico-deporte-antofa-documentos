import { test } from "node:test";
import assert from "node:assert/strict";
import { listarNombresZip } from "../lib/zip-inspect.mjs";

// Construye un ZIP mínimo válido (método "stored", sin compresión, CRC32=0 —
// suficiente porque listarNombresZip nunca valida CRC, solo nombres) con las
// entradas dadas. Usado exclusivamente para pruebas.
function buildMinimalZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const dataBuf = Buffer.from(data, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // method: stored
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(0, 14); // crc32 (no validado por nuestro lector)
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // method
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(0, 16); // crc32
    centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
    centralHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16); // offset del directorio central
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralSection, eocd]);
}

test("listarNombresZip lee los nombres de un ZIP mínimo válido", () => {
  const zip = buildMinimalZip([
    { name: "informe.pdf", data: "contenido de prueba" },
    { name: "anexo.csv", data: "a,b\n1,2" },
  ]);
  const nombres = listarNombresZip(zip);
  assert.deepEqual(nombres, ["informe.pdf", "anexo.csv"]);
});

test("listarNombresZip detecta un ejecutable oculto dentro del ZIP", () => {
  const zip = buildMinimalZip([
    { name: "informe.pdf", data: "contenido" },
    { name: "instalador.exe", data: "binario falso" },
  ]);
  const nombres = listarNombresZip(zip);
  assert.ok(nombres.includes("instalador.exe"));
});

test("listarNombresZip lanza error ante un buffer que no es ZIP", () => {
  assert.throws(() => listarNombresZip(Buffer.from("esto no es un zip")));
});
