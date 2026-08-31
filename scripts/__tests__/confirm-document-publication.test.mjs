// CASO 2 (deployment/confirmación fallida -> maestro permanece APROBADO_PARA_PUBLICAR)
// y CASO 3 (confirmación real correcta -> maestro pasa a PUBLICADO) de la corrección
// estructural de prepare-document-library.mjs están cubiertos por los tests de este
// archivo: "URL que responde 404..." (CASO 2) y "candidato con URL pública
// verificada..." (CASO 3).

import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmarPublicacion } from "../confirm-document-publication.mjs";
import { readCatalogo } from "../lib/catalog.mjs";
import { crearRepoFixture, limpiarRepoFixture, escribirArchivo, escribirCatalogo } from "./helpers/fixture-repo.mjs";

async function conFixture(fn) {
  const rootDir = await crearRepoFixture();
  try {
    await fn(rootDir);
  } finally {
    await limpiarRepoFixture(rootDir);
  }
}

function fetchFalso(respuestasPorUrl) {
  return async (url) => {
    const r = respuestasPorUrl[url];
    if (!r) throw new Error(`URL inesperada en el fetch falso: ${url}`);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      arrayBuffer: async () => Buffer.from(r.body ?? ""),
    };
  };
}

test("candidato con URL pública verificada correctamente se promueve a PUBLICADO", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/candidato.csv", "contenido publicado");
    await escribirCatalogo(rootDir, [
      { id: "candidato", titulo: "Candidato", categoria: "recursos", ruta: "recursos/candidato.csv", nombreArchivo: "candidato.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", sha256: doc.sha256, visible: true },
    ]);

    const baseUrl = "https://worker.example.workers.dev";
    const fetchImpl = fetchFalso({
      [`${baseUrl}/recursos/candidato.csv`]: { status: 200, body: "contenido publicado" },
    });

    const { promovidos, fallidos } = await confirmarPublicacion(rootDir, ["candidato"], { baseUrl, fetchImpl, now: () => "2026-08-31T00:00:00.000Z" });
    assert.deepEqual(promovidos, ["candidato"]);
    assert.deepEqual(fallidos, []);

    const maestro = await readCatalogo(rootDir);
    const r = maestro.find((x) => x.id === "candidato");
    assert.equal(r.estado, "PUBLICADO");
    assert.equal(r.fechaPublicacion, "2026-08-31T00:00:00.000Z");
  }));

test("URL que responde 404 mantiene el documento en APROBADO_PARA_PUBLICAR", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/candidato.csv", "contenido");
    await escribirCatalogo(rootDir, [
      { id: "candidato", titulo: "Candidato", categoria: "recursos", ruta: "recursos/candidato.csv", nombreArchivo: "candidato.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", sha256: doc.sha256, visible: true },
    ]);

    const baseUrl = "https://worker.example.workers.dev";
    const fetchImpl = fetchFalso({
      [`${baseUrl}/recursos/candidato.csv`]: { status: 404 },
    });

    const { promovidos, fallidos } = await confirmarPublicacion(rootDir, ["candidato"], { baseUrl, fetchImpl });
    assert.deepEqual(promovidos, []);
    assert.equal(fallidos.length, 1);
    assert.equal(fallidos[0].id, "candidato");

    const maestro = await readCatalogo(rootDir);
    const r = maestro.find((x) => x.id === "candidato");
    assert.equal(r.estado, "APROBADO_PARA_PUBLICAR");
    assert.equal(r.fechaPublicacion, undefined);
  }));

test("contenido publicado con hash distinto al esperado no se promueve", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/candidato.csv", "contenido correcto");
    await escribirCatalogo(rootDir, [
      { id: "candidato", titulo: "Candidato", categoria: "recursos", ruta: "recursos/candidato.csv", nombreArchivo: "candidato.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", sha256: doc.sha256, visible: true },
    ]);

    const baseUrl = "https://worker.example.workers.dev";
    const fetchImpl = fetchFalso({
      [`${baseUrl}/recursos/candidato.csv`]: { status: 200, body: "contenido DISTINTO al esperado" },
    });

    const { promovidos, fallidos } = await confirmarPublicacion(rootDir, ["candidato"], { baseUrl, fetchImpl });
    assert.deepEqual(promovidos, []);
    assert.equal(fallidos.length, 1);
    assert.match(fallidos[0].motivo, /sha256/);
  }));

test("fallos parciales: un candidato se promueve y otro falla sin bloquearse mutuamente", () =>
  conFixture(async (rootDir) => {
    const ok = await escribirArchivo(rootDir, "recursos/ok.csv", "bien");
    const mal = await escribirArchivo(rootDir, "recursos/mal.csv", "mal");
    await escribirCatalogo(rootDir, [
      { id: "ok", titulo: "OK", categoria: "recursos", ruta: "recursos/ok.csv", nombreArchivo: "ok.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: ok.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", sha256: ok.sha256, visible: true },
      { id: "mal", titulo: "MAL", categoria: "recursos", ruta: "recursos/mal.csv", nombreArchivo: "mal.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: mal.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", sha256: mal.sha256, visible: true },
    ]);

    const baseUrl = "https://worker.example.workers.dev";
    const fetchImpl = fetchFalso({
      [`${baseUrl}/recursos/ok.csv`]: { status: 200, body: "bien" },
      [`${baseUrl}/recursos/mal.csv`]: { status: 500 },
    });

    const { promovidos, fallidos } = await confirmarPublicacion(rootDir, ["ok", "mal"], { baseUrl, fetchImpl, now: () => "2026-08-31T00:00:00.000Z" });
    assert.deepEqual(promovidos, ["ok"]);
    assert.equal(fallidos.length, 1);
    assert.equal(fallidos[0].id, "mal");

    const maestro = await readCatalogo(rootDir);
    assert.equal(maestro.find((x) => x.id === "ok").estado, "PUBLICADO");
    assert.equal(maestro.find((x) => x.id === "mal").estado, "APROBADO_PARA_PUBLICAR");
  }));

test("candidato inexistente en el catálogo se reporta como fallido sin lanzar excepción", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, []);
    const { promovidos, fallidos } = await confirmarPublicacion(rootDir, ["no-existe"], { baseUrl: "https://x.example", fetchImpl: fetchFalso({}) });
    assert.deepEqual(promovidos, []);
    assert.equal(fallidos[0].motivo, "no existe en el catálogo maestro");
  }));

test("reemplazo de una versión ya publicada usa fechaActualizacion, no fechaPublicacion", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/candidato.csv", "v2");
    await escribirCatalogo(rootDir, [
      { id: "candidato", titulo: "Candidato", categoria: "recursos", ruta: "recursos/candidato.csv", nombreArchivo: "candidato.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 2, estado: "APROBADO_PARA_PUBLICAR", fechaPublicacion: "2026-01-01T00:00:00.000Z", sha256: doc.sha256, visible: true },
    ]);
    const baseUrl = "https://worker.example.workers.dev";
    const fetchImpl = fetchFalso({ [`${baseUrl}/recursos/candidato.csv`]: { status: 200, body: "v2" } });

    await confirmarPublicacion(rootDir, ["candidato"], { baseUrl, fetchImpl, now: () => "2026-08-31T00:00:00.000Z" });

    const maestro = await readCatalogo(rootDir);
    const r = maestro.find((x) => x.id === "candidato");
    assert.equal(r.fechaPublicacion, "2026-01-01T00:00:00.000Z");
    assert.equal(r.fechaActualizacion, "2026-08-31T00:00:00.000Z");
  }));
