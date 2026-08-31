#!/usr/bin/env node
// prepare-document-library — genera el artefacto publicable CANDIDATO (dist-public/)
// a partir de la fuente maestra. NUNCA modifica catalogo.json maestro — nunca escribe
// estado="PUBLICADO". Esa promoción es responsabilidad exclusiva de
// confirm-document-publication, ejecutada después de un `wrangler deploy` exitoso y de
// verificar la URL pública real.
//
// Diseño: TAREA_F0-016 Sección 8-bis, ANALISIS_F0-016 Sección 6-bis (repo WEB DIP).
//
// Uso: node scripts/prepare-document-library.mjs --candidatos=id1,id2,...
//   (sin --candidatos: solo regenera dist-public/ con lo ya PUBLICADO vigente,
//    sin promover ningún candidato nuevo — útil para reconstrucción/verificación)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import { readCatalogo, DIST_PUBLIC_DIRNAME } from "./lib/catalog.mjs";
import { verificarBiblioteca } from "./verify-document-library.mjs";
import { generarIndexHtml } from "./lib/index-html.mjs";

export async function prepararBiblioteca(rootDir, candidatoIds = []) {
  const { bloqueantes } = await verificarBiblioteca(rootDir);
  if (bloqueantes.length > 0) {
    throw new Error(
      `prepare-document-library abortado: verify-document-library reportó ${bloqueantes.length} hallazgo(s) bloqueante(s). Corregirlos antes de preparar el artefacto.\n` +
        bloqueantes.map((b) => `  - ${b}`).join("\n"),
    );
  }

  const registros = await readCatalogo(rootDir);
  const porId = new Map(registros.map((r) => [r.id, r]));

  for (const id of candidatoIds) {
    const r = porId.get(id);
    if (!r) {
      throw new Error(`Candidato "${id}" no existe en el catálogo maestro.`);
    }
    if (r.estado !== "APROBADO_PARA_PUBLICAR") {
      throw new Error(`Candidato "${id}" tiene estado "${r.estado}" — solo se pueden preparar candidatos en estado APROBADO_PARA_PUBLICAR.`);
    }
  }

  const candidatoSet = new Set(candidatoIds);
  const seleccionados = registros.filter(
    (r) => (r.estado === "PUBLICADO" && r.visible === true) || candidatoSet.has(r.id),
  );

  const distDir = path.join(rootDir, DIST_PUBLIC_DIRNAME);
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const r of seleccionados) {
    if (r.ruta) {
      const src = path.join(rootDir, r.ruta);
      const dest = path.join(distDir, r.ruta);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
    }
    // urlExterna: no hay archivo que copiar, solo entra en el catálogo público.
  }

  const catalogoPublico = seleccionados.map((r) => ({ ...r }));
  await writeFile(
    path.join(distDir, "catalogo.json"),
    JSON.stringify(catalogoPublico, null, 2) + "\n",
    "utf8",
  );

  await writeFile(path.join(distDir, "index.html"), generarIndexHtml(), "utf8");

  return {
    distDir,
    incluidos: seleccionados.map((r) => r.id),
    candidatosPromovidosEsteRun: candidatoIds,
  };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const arg = process.argv.find((a) => a.startsWith("--candidatos="));
  const candidatoIds = arg
    ? arg
        .slice("--candidatos=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const resultado = await prepararBiblioteca(rootDir, candidatoIds);
  console.log(`prepare-document-library — dist-public/ regenerado en ${resultado.distDir}`);
  console.log(`  Documentos incluidos (${resultado.incluidos.length}): ${resultado.incluidos.join(", ") || "(ninguno)"}`);
  console.log(`  Candidatos de esta corrida: ${resultado.candidatosPromovidosEsteRun.join(", ") || "(ninguno — solo se regeneró lo ya PUBLICADO)"}`);
  console.log(`  catalogo.json maestro: sin cambios (solo confirm-document-publication puede escribir estado="PUBLICADO").`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(`prepare-document-library falló: ${err.message}`);
    process.exitCode = 1;
  });
}
