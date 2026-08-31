// Inspector mínimo de ZIP: lee únicamente los nombres de entrada desde el directorio
// central (End Of Central Directory + Central Directory records), sin descomprimir
// contenido. Suficiente para verificar extensiones prohibidas dentro de un .zip
// (Análisis F0-016 Sección 13/14). No soporta ZIP64 (no necesario para documentos
// públicos de este proyecto — archivos < 25 MiB).
//
// Formato de referencia: PKZIP APPNOTE — EOCD signature 0x06054b50,
// Central Directory File Header signature 0x02014b50.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 65535;

export function listarNombresZip(buffer) {
  const eocdOffset = encontrarEOCD(buffer);
  if (eocdOffset === -1) {
    throw new Error("No se encontró el registro End Of Central Directory — archivo ZIP inválido o corrupto.");
  }

  const totalEntradas = buffer.readUInt16LE(eocdOffset + 10);
  const offsetDirCentral = buffer.readUInt32LE(eocdOffset + 16);

  const nombres = [];
  let cursor = offsetDirCentral;
  for (let i = 0; i < totalEntradas; i++) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Entrada de directorio central inesperada en offset ${cursor} — ZIP inválido o corrupto.`);
    }
    const nombreLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const comentarioLen = buffer.readUInt16LE(cursor + 32);
    const nombre = buffer.toString("utf8", cursor + 46, cursor + 46 + nombreLen);
    nombres.push(nombre);
    cursor += 46 + nombreLen + extraLen + comentarioLen;
  }
  return nombres;
}

function encontrarEOCD(buffer) {
  const searchStart = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}
