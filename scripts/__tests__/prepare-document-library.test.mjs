// Casos exigidos por la corrección estructural de la semántica de "estado" entre el
// catálogo maestro y el catálogo público generado (ver comentario de cabecera de
// prepare-document-library.mjs):
//   CASO 1: maestro=APROBADO_PARA_PUBLICAR + prepare -> maestro sigue igual, público=PUBLICADO
//   CASO 4: maestro=PUBLICADO (ya vigente) -> público=PUBLICADO
//   CASO 5: BORRADOR -> no aparece en dist-public
//   CASO 6: RETIRADO -> no aparece en dist-public
// (CASO 2 y CASO 3 — fallo/éxito de confirm-document-publication sobre el catálogo
// maestro — están cubiertos en confirm-document-publication.test.mjs.)

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, access } from "node:fs/promises";
import { prepararBiblioteca } from "../prepare-document-library.mjs";
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

async function existeArchivo(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

test("CASO 1: candidato APROBADO_PARA_PUBLICAR -> maestro sin cambios, público=PUBLICADO; BORRADOR excluido", () =>
  conFixture(async (rootDir) => {
    const publicado = await escribirArchivo(rootDir, "recursos/publicado.csv", "ya publicado");
    const candidato = await escribirArchivo(rootDir, "recursos/candidato.csv", "candidato de esta corrida");
    const borrador = await escribirArchivo(rootDir, "recursos/borrador.csv", "nunca debe salir");

    await escribirCatalogo(rootDir, [
      { id: "publicado", titulo: "Publicado", categoria: "recursos", ruta: "recursos/publicado.csv", nombreArchivo: "publicado.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: publicado.tamañoBytes, version: 1, estado: "PUBLICADO", fechaPublicacion: "2026-01-01", sha256: publicado.sha256, visible: true, orden: 1 },
      { id: "candidato", titulo: "Candidato", categoria: "recursos", ruta: "recursos/candidato.csv", nombreArchivo: "candidato.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: candidato.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", sha256: candidato.sha256, visible: true, orden: 2 },
      { id: "borrador", titulo: "Borrador", categoria: "recursos", ruta: "recursos/borrador.csv", nombreArchivo: "borrador.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: borrador.tamañoBytes, version: 1, estado: "BORRADOR", sha256: borrador.sha256, visible: false },
    ]);

    const resultado = await prepararBiblioteca(rootDir, ["candidato"]);

    assert.deepEqual(new Set(resultado.incluidos), new Set(["publicado", "candidato"]));
    assert.ok(await existeArchivo(path.join(resultado.distDir, "recursos/publicado.csv")));
    assert.ok(await existeArchivo(path.join(resultado.distDir, "recursos/candidato.csv")));
    assert.ok(!(await existeArchivo(path.join(resultado.distDir, "recursos/borrador.csv"))));

    const catalogoPublico = JSON.parse(await readFile(path.join(resultado.distDir, "catalogo.json"), "utf8"));
    assert.deepEqual(new Set(catalogoPublico.map((r) => r.id)), new Set(["publicado", "candidato"]));

    // CASO 1 — el catálogo PÚBLICO representa al candidato como PUBLICADO...
    const candidatoPublico = catalogoPublico.find((r) => r.id === "candidato");
    assert.equal(candidatoPublico.estado, "PUBLICADO");
    // CASO 4 — ...y el ya-vigente PUBLICADO se mantiene PUBLICADO en el público.
    const publicadoPublico = catalogoPublico.find((r) => r.id === "publicado");
    assert.equal(publicadoPublico.estado, "PUBLICADO");

    // ...pero el catálogo MAESTRO NO cambia — el candidato sigue APROBADO_PARA_PUBLICAR
    // hasta que confirm-document-publication confirme el deployment real.
    const maestro = await readCatalogo(rootDir);
    const candidatoMaestro = maestro.find((r) => r.id === "candidato");
    assert.equal(candidatoMaestro.estado, "APROBADO_PARA_PUBLICAR");
    const publicadoMaestro = maestro.find((r) => r.id === "publicado");
    assert.equal(publicadoMaestro.estado, "PUBLICADO");

    assert.ok(await existeArchivo(path.join(resultado.distDir, "index.html")));
  }));

test("CASO 6: RETIRADO no aparece en dist-public ni en su catálogo público", () =>
  conFixture(async (rootDir) => {
    const publicado = await escribirArchivo(rootDir, "recursos/publicado.csv", "vigente");
    const retirado = await escribirArchivo(rootDir, "recursos/retirado.csv", "ya no debe exponerse");

    await escribirCatalogo(rootDir, [
      { id: "publicado", titulo: "Publicado", categoria: "recursos", ruta: "recursos/publicado.csv", nombreArchivo: "publicado.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: publicado.tamañoBytes, version: 1, estado: "PUBLICADO", fechaPublicacion: "2026-01-01", sha256: publicado.sha256, visible: true },
      { id: "retirado", titulo: "Retirado", categoria: "recursos", ruta: "recursos/retirado.csv", nombreArchivo: "retirado.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: retirado.tamañoBytes, version: 1, estado: "RETIRADO", fechaPublicacion: "2026-01-01", sha256: retirado.sha256, visible: false },
    ]);

    const resultado = await prepararBiblioteca(rootDir, []);
    assert.deepEqual(resultado.incluidos, ["publicado"]);
    assert.ok(!(await existeArchivo(path.join(resultado.distDir, "recursos/retirado.csv"))));

    const catalogoPublico = JSON.parse(await readFile(path.join(resultado.distDir, "catalogo.json"), "utf8"));
    assert.ok(!catalogoPublico.some((r) => r.id === "retirado"));
  }));

test("prepararBiblioteca sin candidatos regenera solo lo ya PUBLICADO", () =>
  conFixture(async (rootDir) => {
    const publicado = await escribirArchivo(rootDir, "recursos/publicado.csv", "ya publicado");
    await escribirCatalogo(rootDir, [
      { id: "publicado", titulo: "Publicado", categoria: "recursos", ruta: "recursos/publicado.csv", nombreArchivo: "publicado.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: publicado.tamañoBytes, version: 1, estado: "PUBLICADO", fechaPublicacion: "2026-01-01", sha256: publicado.sha256, visible: true },
    ]);
    const resultado = await prepararBiblioteca(rootDir, []);
    assert.deepEqual(resultado.incluidos, ["publicado"]);
  }));

test("prepararBiblioteca rechaza un candidato que no está APROBADO_PARA_PUBLICAR", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "a", titulo: "A", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    await assert.rejects(() => prepararBiblioteca(rootDir, ["a"]), /APROBADO_PARA_PUBLICAR/);
  }));

test("prepararBiblioteca aborta si verify-document-library reporta bloqueantes", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/no-existe.csv", nombreArchivo: "no-existe.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: 1, version: 1, estado: "BORRADOR", sha256: "0".repeat(64), visible: false },
    ]);
    await assert.rejects(() => prepararBiblioteca(rootDir, []), /bloqueante/);
  }));

test("prepararBiblioteca regenera dist-public desde cero (no arrastra archivos viejos)", () =>
  conFixture(async (rootDir) => {
    const publicado = await escribirArchivo(rootDir, "recursos/publicado.csv", "v1");
    await escribirCatalogo(rootDir, [
      { id: "publicado", titulo: "Publicado", categoria: "recursos", ruta: "recursos/publicado.csv", nombreArchivo: "publicado.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: publicado.tamañoBytes, version: 1, estado: "PUBLICADO", fechaPublicacion: "2026-01-01", sha256: publicado.sha256, visible: true },
    ]);
    const primero = await prepararBiblioteca(rootDir, []);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(primero.distDir, "archivo-obsoleto.txt"), "no debería sobrevivir", "utf8");

    const segundo = await prepararBiblioteca(rootDir, []);
    assert.ok(!(await existeArchivo(path.join(segundo.distDir, "archivo-obsoleto.txt"))));
  }));
