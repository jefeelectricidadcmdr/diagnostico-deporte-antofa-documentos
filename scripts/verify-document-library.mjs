#!/usr/bin/env node
// verify-document-library — gate de integridad de la fuente maestra.
// Se ejecuta SIEMPRE antes de prepare-document-library. No escribe nada — solo lee
// y reporta. Nunca modifica `estado` en catalogo.json (esa es la única responsabilidad
// de confirm-document-publication).
//
// Diseño: TAREA_F0-016 Sección 16, ANALISIS_F0-016 Sección 14 (repo WEB DIP).
//
// Uso: node scripts/verify-document-library.mjs [--json]
// Exit code: 0 si no hay hallazgos BLOQUEANTES, 1 en caso contrario.

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readCatalogo,
  listarArchivosFuenteMaestra,
  existeArchivo,
  sha256File,
  tamanoBytes,
  ESTADOS_VALIDOS,
  EXTENSIONES_PERMITIDAS,
  MIME_POR_EXTENSION,
  MAX_ASSET_BYTES,
  HISTORICO_DIRNAME,
  nombreArchivoValido,
  EXTENSIONES_PROHIBIDAS_EN_ZIP,
} from "./lib/catalog.mjs";
import { readFile } from "node:fs/promises";
import { listarNombresZip } from "./lib/zip-inspect.mjs";

export async function verificarBiblioteca(rootDir) {
  const bloqueantes = [];
  const advertencias = [];
  const bloqueante = (msg) => bloqueantes.push(msg);
  const advertencia = (msg) => advertencias.push(msg);

  let registros;
  try {
    registros = await readCatalogo(rootDir);
  } catch (err) {
    bloqueante(err.message);
    return { bloqueantes, advertencias };
  }

  const idsVistos = new Map(); // id -> index
  const hashesVistos = new Map(); // sha256 -> [ids]
  const rutasReferenciadas = new Set();

  for (let i = 0; i < registros.length; i++) {
    const r = registros[i];
    const etiqueta = `registro[${i}] (id=${r?.id ?? "?"})`;

    if (!r || typeof r.id !== "string" || r.id.length === 0) {
      bloqueante(`${etiqueta}: falta un "id" válido.`);
      continue;
    }
    if (idsVistos.has(r.id)) {
      bloqueante(`id duplicado en el catálogo: "${r.id}" (registros ${idsVistos.get(r.id)} y ${i}).`);
    } else {
      idsVistos.set(r.id, i);
    }

    if (!ESTADOS_VALIDOS.includes(r.estado)) {
      bloqueante(`${etiqueta}: estado "${r.estado}" no es válido (esperado uno de ${ESTADOS_VALIDOS.join(", ")}).`);
    }

    // Exclusión mutua ruta / urlExterna (Análisis Sección 7.1).
    const tieneRuta = typeof r.ruta === "string" && r.ruta.length > 0;
    const tieneUrlExterna = typeof r.urlExterna === "string" && r.urlExterna.length > 0;
    if (tieneRuta === tieneUrlExterna) {
      bloqueante(`${etiqueta}: debe existir exactamente uno de "ruta"/"urlExterna" (tiene ruta=${tieneRuta}, urlExterna=${tieneUrlExterna}).`);
      continue; // sin ruta clara, el resto de las validaciones de archivo no aplican
    }

    if (typeof r.mimeType !== "string" || r.mimeType.length === 0) {
      bloqueante(`${etiqueta}: "mimeType" es obligatorio siempre (alojado o externo).`);
    }

    if (typeof r.visible !== "boolean") {
      bloqueante(`${etiqueta}: "visible" debe ser boolean.`);
    } else if ((r.estado === "BORRADOR" || r.estado === "RETIRADO") && r.visible === true) {
      bloqueante(`${etiqueta}: estado "${r.estado}" con visible=true — inconsistencia del catálogo maestro.`);
    }

    if (!(Number.isInteger(r.version) && r.version >= 1)) {
      bloqueante(`${etiqueta}: "version" debe ser un entero >= 1.`);
    }

    // fechaPublicacion es obligatoria únicamente una vez que el documento fue
    // efectivamente publicado alguna vez (PUBLICADO/RETIRADO); ausente en BORRADOR/
    // APROBADO_PARA_PUBLICAR, porque confirm-document-publication es quien la fija
    // (Análisis Sección 6-bis — semántica de PUBLICADO corregida en Revisión 3).
    const debeTenerFechaPublicacion = r.estado === "PUBLICADO" || r.estado === "RETIRADO";
    const tieneFechaPublicacion = typeof r.fechaPublicacion === "string" && r.fechaPublicacion.length > 0;
    if (debeTenerFechaPublicacion && !tieneFechaPublicacion) {
      bloqueante(`${etiqueta}: estado "${r.estado}" requiere "fechaPublicacion" (debió fijarla confirm-document-publication).`);
    }
    if (!debeTenerFechaPublicacion && tieneFechaPublicacion) {
      bloqueante(`${etiqueta}: "fechaPublicacion" no debe existir antes de una publicación confirmada (estado actual "${r.estado}").`);
    }

    if (tieneRuta) {
      rutasReferenciadas.add(r.ruta);

      if (r.ruta.startsWith(`${HISTORICO_DIRNAME}/`) || r.ruta === HISTORICO_DIRNAME) {
        bloqueante(`${etiqueta}: "ruta" no puede apuntar dentro de ${HISTORICO_DIRNAME}/ — el histórico nunca se publica por referencia directa (Análisis Sección 9).`);
      }

      if (typeof r.nombreArchivo !== "string" || !nombreArchivoValido(r.nombreArchivo)) {
        bloqueante(`${etiqueta}: "nombreArchivo" (${r.nombreArchivo}) no cumple la convención de nomenclatura (minúsculas, guiones, sin espacios/tildes, extensión permitida).`);
      }
      if (!r.ruta.endsWith(r.nombreArchivo ?? " ")) {
        bloqueante(`${etiqueta}: "ruta" (${r.ruta}) no termina en "nombreArchivo" (${r.nombreArchivo}).`);
      }

      if (!EXTENSIONES_PERMITIDAS.includes(r.extension)) {
        bloqueante(`${etiqueta}: extensión "${r.extension}" no está permitida (Análisis Sección 13).`);
      } else if (r.mimeType !== MIME_POR_EXTENSION[r.extension]) {
        bloqueante(`${etiqueta}: mimeType "${r.mimeType}" no es coherente con la extensión "${r.extension}" (esperado "${MIME_POR_EXTENSION[r.extension]}").`);
      }

      if (!existeArchivo(rootDir, r.ruta)) {
        bloqueante(`${etiqueta}: "ruta" (${r.ruta}) no existe físicamente en la fuente maestra.`);
        continue; // sin archivo real, el resto de las comprobaciones de integridad no aplican
      }

      const absPath = path.join(rootDir, r.ruta);
      const tamanoReal = await tamanoBytes(absPath);
      if (tamanoReal > MAX_ASSET_BYTES) {
        bloqueante(`${etiqueta}: "${r.ruta}" pesa ${tamanoReal} bytes, excede el máximo de ${MAX_ASSET_BYTES} bytes (25 MiB) admitido por la plataforma (Análisis Sección 3/3.1).`);
      }
      if (r.tamañoBytes !== tamanoReal) {
        bloqueante(`${etiqueta}: "tamañoBytes" declarado (${r.tamañoBytes}) no coincide con el tamaño real (${tamanoReal}).`);
      }

      const hashReal = await sha256File(absPath);
      if (r.sha256 !== hashReal) {
        bloqueante(`${etiqueta}: "sha256" declarado no coincide con el hash real del archivo (${r.ruta}).`);
      } else {
        if (!hashesVistos.has(hashReal)) hashesVistos.set(hashReal, []);
        hashesVistos.get(hashReal).push(r.id);
      }

      if (r.extension === "zip") {
        try {
          const buf = await readFile(absPath);
          const nombres = listarNombresZip(buf);
          for (const nombreInterno of nombres) {
            const extInterna = nombreInterno.split(".").pop()?.toLowerCase();
            if (extInterna && EXTENSIONES_PROHIBIDAS_EN_ZIP.includes(extInterna)) {
              bloqueante(`${etiqueta}: el ZIP "${r.ruta}" contiene un archivo con extensión prohibida ("${nombreInterno}").`);
            }
          }
        } catch (err) {
          bloqueante(`${etiqueta}: no se pudo inspeccionar el ZIP "${r.ruta}": ${err.message}`);
        }
      }
    } else {
      // urlExterna
      if (typeof r.integridadVerificada !== "boolean") {
        bloqueante(`${etiqueta}: "urlExterna" requiere "integridadVerificada" (boolean) — Análisis Sección 7.1.`);
      } else if (r.integridadVerificada) {
        if (typeof r.sha256 !== "string" || r.sha256.length === 0) {
          bloqueante(`${etiqueta}: integridadVerificada=true requiere "sha256".`);
        }
        if (!(Number.isInteger(r.tamañoBytes) && r.tamañoBytes >= 0)) {
          bloqueante(`${etiqueta}: integridadVerificada=true requiere "tamañoBytes".`);
        }
      } else {
        if (r.sha256 !== undefined && r.sha256 !== null) {
          bloqueante(`${etiqueta}: integridadVerificada=false — "sha256" debe estar ausente/null, nunca un valor no verificado.`);
        }
        if (r.tamañoBytes !== undefined && r.tamañoBytes !== null) {
          bloqueante(`${etiqueta}: integridadVerificada=false — "tamañoBytes" debe estar ausente/null, nunca un valor no verificado.`);
        }
      }
    }
  }

  // Duplicados por hash — advertencia, no bloqueante (puede ser legítimo).
  for (const [hash, ids] of hashesVistos) {
    if (ids.length > 1) {
      advertencia(`${ids.length} registros comparten el mismo sha256 (${hash}): ${ids.join(", ")}.`);
    }
  }

  // Archivos físicos huérfanos: existen en la fuente maestra pero ningún registro los referencia.
  const archivosReales = listarArchivosFuenteMaestra(rootDir);
  for (const relPath of archivosReales) {
    if (!rutasReferenciadas.has(relPath)) {
      bloqueante(`Archivo huérfano: "${relPath}" existe en la fuente maestra pero no está referenciado por ningún registro del catálogo.`);
    }
  }

  return { bloqueantes, advertencias };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { bloqueantes, advertencias } = await verificarBiblioteca(rootDir);

  const jsonMode = process.argv.includes("--json");
  if (jsonMode) {
    console.log(JSON.stringify({ bloqueantes, advertencias }, null, 2));
  } else {
    console.log(`verify-document-library — ${bloqueantes.length} bloqueante(s), ${advertencias.length} advertencia(s)\n`);
    for (const b of bloqueantes) console.log(`  [BLOQUEANTE] ${b}`);
    for (const a of advertencias) console.log(`  [ADVERTENCIA] ${a}`);
    if (bloqueantes.length === 0) console.log("  Sin hallazgos bloqueantes — fuente maestra consistente.");
  }

  process.exitCode = bloqueantes.length > 0 ? 1 : 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
