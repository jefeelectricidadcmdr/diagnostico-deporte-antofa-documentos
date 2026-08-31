#!/usr/bin/env node
// confirm-document-publication — ÚNICA vía autorizada para escribir estado="PUBLICADO"
// en el catálogo maestro. Se ejecuta después de un `wrangler deploy` exitoso; verifica
// la URL pública real de cada candidato antes de promoverlo. Un candidato cuya URL no
// verifica permanece en APROBADO_PARA_PUBLICAR — nunca se promueve sin confirmación real.
// Comportamiento ante fallos parciales: cada candidato se procesa de forma independiente;
// el fallo de uno no bloquea la promoción de los demás.
//
// Diseño: TAREA_F0-016 Sección 8-bis, ANALISIS_F0-016 Sección 6-bis (repo WEB DIP).
//
// Uso: node scripts/confirm-document-publication.mjs --candidatos=id1,id2 --base-url=https://<worker>.workers.dev

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readCatalogo, writeCatalogo } from "./lib/catalog.mjs";

export async function confirmarPublicacion(rootDir, candidatoIds, { baseUrl, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const registros = await readCatalogo(rootDir);
  const porId = new Map(registros.map((r) => [r.id, r]));

  const promovidos = [];
  const fallidos = [];

  for (const id of candidatoIds) {
    const r = porId.get(id);
    if (!r) {
      fallidos.push({ id, motivo: "no existe en el catálogo maestro" });
      continue;
    }
    if (r.estado !== "APROBADO_PARA_PUBLICAR") {
      fallidos.push({ id, motivo: `estado actual es "${r.estado}", no APROBADO_PARA_PUBLICAR` });
      continue;
    }

    try {
      const urlPublica = r.ruta ? `${baseUrl.replace(/\/+$/, "")}/${r.ruta}` : r.urlExterna;
      const res = await fetchImpl(urlPublica);
      if (!res.ok) {
        fallidos.push({ id, motivo: `URL pública respondió ${res.status} (${urlPublica})` });
        continue;
      }

      if (r.ruta) {
        const buf = Buffer.from(await res.arrayBuffer());
        const hashReal = createHash("sha256").update(buf).digest("hex");
        if (hashReal !== r.sha256) {
          fallidos.push({ id, motivo: `contenido publicado no coincide con sha256 esperado (${urlPublica})` });
          continue;
        }
        if (buf.length !== r.tamañoBytes) {
          fallidos.push({ id, motivo: `tamaño publicado (${buf.length}) no coincide con tamañoBytes esperado (${r.tamañoBytes})` });
          continue;
        }
      } else if (r.integridadVerificada && r.sha256) {
        const buf = Buffer.from(await res.arrayBuffer());
        const hashReal = createHash("sha256").update(buf).digest("hex");
        if (hashReal !== r.sha256) {
          fallidos.push({ id, motivo: `contenido externo no coincide con sha256 esperado (${urlPublica})` });
          continue;
        }
      }

      // Verificación exitosa: promover. Primera publicación -> fechaPublicacion;
      // reemplazo de una versión previa -> fechaActualizacion (Análisis Sección 9).
      const yaHabiaSidoPublicadoAntes = typeof r.fechaPublicacion === "string" && r.fechaPublicacion.length > 0;
      r.estado = "PUBLICADO";
      if (yaHabiaSidoPublicadoAntes) {
        r.fechaActualizacion = now();
      } else {
        r.fechaPublicacion = now();
      }
      promovidos.push(id);
    } catch (err) {
      fallidos.push({ id, motivo: `error de red/verificación: ${err.message}` });
    }
  }

  if (promovidos.length > 0) {
    await writeCatalogo(rootDir, registros);
  }

  return { promovidos, fallidos };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const candidatosArg = process.argv.find((a) => a.startsWith("--candidatos="));
  const baseUrlArg = process.argv.find((a) => a.startsWith("--base-url="));

  if (!candidatosArg || !baseUrlArg) {
    console.error("Uso: node scripts/confirm-document-publication.mjs --candidatos=id1,id2 --base-url=https://<worker>.workers.dev");
    process.exitCode = 1;
    return;
  }

  const candidatoIds = candidatosArg.slice("--candidatos=".length).split(",").map((s) => s.trim()).filter(Boolean);
  const baseUrl = baseUrlArg.slice("--base-url=".length);

  const { promovidos, fallidos } = await confirmarPublicacion(rootDir, candidatoIds, { baseUrl });

  console.log(`confirm-document-publication — ${promovidos.length} promovido(s), ${fallidos.length} fallido(s)`);
  for (const id of promovidos) console.log(`  [PUBLICADO] ${id}`);
  for (const f of fallidos) console.log(`  [PERMANECE APROBADO_PARA_PUBLICAR] ${f.id}: ${f.motivo}`);

  process.exitCode = fallidos.length > 0 ? 1 : 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
