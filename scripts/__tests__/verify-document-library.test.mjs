import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarBiblioteca } from "../verify-document-library.mjs";
import { crearRepoFixture, limpiarRepoFixture, escribirArchivo, escribirCatalogo } from "./helpers/fixture-repo.mjs";

async function conFixture(fn) {
  const rootDir = await crearRepoFixture();
  try {
    await fn(rootDir);
  } finally {
    await limpiarRepoFixture(rootDir);
  }
}

test("catálogo consistente: sin hallazgos bloqueantes", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/documento-ok.csv", "a,b\n1,2\n");
    await escribirCatalogo(rootDir, [
      {
        id: "doc-ok",
        titulo: "Documento OK",
        categoria: "recursos",
        componente: null,
        ruta: "recursos/documento-ok.csv",
        nombreArchivo: "documento-ok.csv",
        extension: "csv",
        mimeType: "text/csv",
        tamañoBytes: doc.tamañoBytes,
        version: 1,
        estado: "APROBADO_PARA_PUBLICAR",
        sha256: doc.sha256,
        visible: true,
        orden: 1,
      },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.deepEqual(bloqueantes, []);
  }));

test("JSON inválido es bloqueante", () =>
  conFixture(async (rootDir) => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    await writeFile(path.join(rootDir, "catalogo.json"), "{ esto no es json válido", "utf8");
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.length >= 1);
  }));

test("ids duplicados son bloqueantes", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "dup", titulo: "A", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
      { id: "dup", titulo: "A2", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("id duplicado")));
  }));

test("ruta y urlExterna simultáneas son bloqueantes", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", urlExterna: "https://example.org/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", version: 1, estado: "BORRADOR", visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("ruta")));
  }));

test("ni ruta ni urlExterna es bloqueante", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", version: 1, estado: "BORRADOR", visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.length >= 1);
  }));

test("BORRADOR con visible=true es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: true },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("visible=true")));
  }));

test("archivo referenciado que no existe físicamente es bloqueante", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/no-existe.csv", nombreArchivo: "no-existe.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: 1, version: 1, estado: "BORRADOR", sha256: "0".repeat(64), visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("no existe físicamente")));
  }));

test("sha256 declarado incorrecto es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "contenido real");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: "f".repeat(64), visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("sha256")));
  }));

test("tamañoBytes declarado incorrecto es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "contenido real");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: 999999, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("tamañoBytes")));
  }));

test("nombre de archivo con mayúsculas/espacios es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/Informe FINAL (1).csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/Informe FINAL (1).csv", nombreArchivo: "Informe FINAL (1).csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("nomenclatura")));
  }));

test("extensión no permitida es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/script.exe", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/script.exe", nombreArchivo: "script.exe", extension: "exe", mimeType: "application/octet-stream", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("no está permitida")));
  }));

test("mimeType incoherente con la extensión es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "application/pdf", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("no es coherente")));
  }));

test("archivo físico huérfano (no catalogado) es bloqueante", () =>
  conFixture(async (rootDir) => {
    await escribirArchivo(rootDir, "recursos/huerfano.csv", "x");
    await escribirCatalogo(rootDir, []);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("huérfano")));
  }));

test("ruta apuntando dentro de _historico es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "_historico/x/v1-a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "_historico/x/v1-a.csv", nombreArchivo: "v1-a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "RETIRADO", fechaPublicacion: "2026-01-01", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("_historico")));
  }));

test("archivo mayor a 25 MiB es bloqueante", () =>
  conFixture(async (rootDir) => {
    const grande = "a".repeat(26 * 1024 * 1024);
    const doc = await escribirArchivo(rootDir, "recursos/grande.csv", grande);
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/grande.csv", nombreArchivo: "grande.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "BORRADOR", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("25 MiB")));
  }));

test("urlExterna con integridadVerificada=true sin sha256 es bloqueante", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", urlExterna: "https://example.org/a.pdf", nombreArchivo: "a.pdf", extension: "pdf", mimeType: "application/pdf", version: 1, estado: "BORRADOR", integridadVerificada: true, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("sha256")));
  }));

test("urlExterna con integridadVerificada=false y sha256 presente es bloqueante (valor inventado)", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", urlExterna: "https://example.org/a.pdf", nombreArchivo: "a.pdf", extension: "pdf", mimeType: "application/pdf", version: 1, estado: "BORRADOR", integridadVerificada: false, sha256: "0".repeat(64), visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("ausente/null")));
  }));

test("urlExterna con integridadVerificada=false y sin sha256/tamañoBytes: sin hallazgos", () =>
  conFixture(async (rootDir) => {
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", urlExterna: "https://example.org/a.pdf", nombreArchivo: "a.pdf", extension: "pdf", mimeType: "application/pdf", version: 1, estado: "BORRADOR", integridadVerificada: false, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.deepEqual(bloqueantes, []);
  }));

test("fechaPublicacion presente antes de PUBLICADO/RETIRADO es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "APROBADO_PARA_PUBLICAR", fechaPublicacion: "2026-01-01", sha256: doc.sha256, visible: false },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes("no debe existir")));
  }));

test("PUBLICADO sin fechaPublicacion es bloqueante", () =>
  conFixture(async (rootDir) => {
    const doc = await escribirArchivo(rootDir, "recursos/a.csv", "x");
    await escribirCatalogo(rootDir, [
      { id: "x", titulo: "X", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: doc.tamañoBytes, version: 1, estado: "PUBLICADO", sha256: doc.sha256, visible: true },
    ]);
    const { bloqueantes } = await verificarBiblioteca(rootDir);
    assert.ok(bloqueantes.some((b) => b.includes('requiere "fechaPublicacion"')));
  }));

test("duplicados por hash son advertencia, no bloqueante", () =>
  conFixture(async (rootDir) => {
    const a = await escribirArchivo(rootDir, "recursos/a.csv", "mismo contenido");
    const b = await escribirArchivo(rootDir, "recursos/b.csv", "mismo contenido");
    await escribirCatalogo(rootDir, [
      { id: "a", titulo: "A", categoria: "recursos", ruta: "recursos/a.csv", nombreArchivo: "a.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: a.tamañoBytes, version: 1, estado: "BORRADOR", sha256: a.sha256, visible: false },
      { id: "b", titulo: "B", categoria: "recursos", ruta: "recursos/b.csv", nombreArchivo: "b.csv", extension: "csv", mimeType: "text/csv", tamañoBytes: b.tamañoBytes, version: 1, estado: "BORRADOR", sha256: b.sha256, visible: false },
    ]);
    const { bloqueantes, advertencias } = await verificarBiblioteca(rootDir);
    assert.deepEqual(bloqueantes, []);
    assert.ok(advertencias.some((a2) => a2.includes("comparten el mismo sha256")));
  }));
