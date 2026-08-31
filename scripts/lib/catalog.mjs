// Utilidades compartidas por verify-document-library / prepare-document-library /
// confirm-document-publication. Sin dependencias externas — solo Node builtins.
// Diseño: DOCUMENTACION/ANALISIS_F0-016_ARQUITECTURA_BIBLIOTECA_DOCUMENTAL_PUBLICA.md (Sección 7/7.1/14, repo WEB DIP).

import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export const CATALOGO_FILENAME = "catalogo.json";
export const DIST_PUBLIC_DIRNAME = "dist-public";
export const HISTORICO_DIRNAME = "_historico";
export const SCRIPTS_DIRNAME = "scripts";

// 25 MiB — límite de Cloudflare Pages Free y Workers Static Assets Free, verificado
// en Análisis F0-016 Sección 3/3.1 (idéntico en ambas plataformas).
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export const ESTADOS_VALIDOS = ["BORRADOR", "APROBADO_PARA_PUBLICAR", "PUBLICADO", "RETIRADO"];

// Extensiones permitidas — Análisis F0-016 Sección 13.
export const EXTENSIONES_PERMITIDAS = ["pdf", "xlsx", "csv", "docx", "pptx", "zip"];

export const MIME_POR_EXTENSION = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

// Extensiones nunca permitidas dentro de un ZIP, incluso si el .zip en sí es válido
// (Análisis F0-016 Sección 13/14 — ejecutables o formatos activos de riesgo).
export const EXTENSIONES_PROHIBIDAS_EN_ZIP = [
  "exe", "msi", "bat", "cmd", "sh", "ps1", "js", "mjs", "cjs", "vbs", "com", "scr", "dll", "jar", "app",
];

// Nomenclatura (TAREA F0-016 Sección 10): minúsculas, guiones, sin espacios/tildes/caracteres
// especiales, extensión permitida.
const NAME_BASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function nombreArchivoValido(nombreArchivo) {
  const ext = path.extname(nombreArchivo).slice(1).toLowerCase();
  const base = path.basename(nombreArchivo, path.extname(nombreArchivo));
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) return false;
  if (path.extname(nombreArchivo).toLowerCase() !== `.${ext}`) return false; // extensión debe ir en minúsculas
  return NAME_BASE_RE.test(base);
}

export async function readCatalogo(rootDir) {
  const filePath = path.join(rootDir, CATALOGO_FILENAME);
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(`No se pudo leer ${CATALOGO_FILENAME}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${CATALOGO_FILENAME} no es JSON válido: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${CATALOGO_FILENAME} debe ser un arreglo de registros.`);
  }
  return parsed;
}

export async function writeCatalogo(rootDir, records) {
  const filePath = path.join(rootDir, CATALOGO_FILENAME);
  const json = JSON.stringify(records, null, 2) + "\n";
  await writeFile(filePath, json, "utf8");
}

export async function sha256File(absPath) {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

export async function tamanoBytes(absPath) {
  const st = await stat(absPath);
  return st.size;
}

// Enumera archivos reales bajo rootDir, excluyendo directorios de infraestructura
// (nunca contenido documental): .git, scripts, dist-public, node_modules, _historico.
// Devuelve rutas relativas en formato POSIX (mismo formato que `ruta` en el catálogo).
export function listarArchivosFuenteMaestra(rootDir) {
  const EXCLUDED_DIRS = new Set([".git", SCRIPTS_DIRNAME, DIST_PUBLIC_DIRNAME, "node_modules", HISTORICO_DIRNAME]);
  const EXCLUDED_ROOT_FILES = new Set([
    CATALOGO_FILENAME, "wrangler.json", "package.json", "package-lock.json",
    "README.md", ".gitignore", ".env",
  ]);

  const results = [];
  function walk(dir, relPrefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (relPrefix === "" && EXCLUDED_DIRS.has(entry.name)) continue;
      if (relPrefix === "" && EXCLUDED_ROOT_FILES.has(entry.name)) continue;
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }
  walk(rootDir, "");
  return results;
}

export function existeArchivo(rootDir, relPath) {
  try {
    return statSync(path.join(rootDir, relPath)).isFile();
  } catch {
    return false;
  }
}
