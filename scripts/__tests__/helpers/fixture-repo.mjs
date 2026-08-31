// Construye un repositorio de prueba aislado (directorio temporal) con la misma
// forma que la fuente maestra real, para que los tests nunca toquen catalogo.json
// ni recursos/ del repositorio real.
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export async function crearRepoFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "f0016-fixture-"));
  return rootDir;
}

export async function limpiarRepoFixture(rootDir) {
  await rm(rootDir, { recursive: true, force: true });
}

export async function escribirArchivo(rootDir, relPath, contenido) {
  const abs = path.join(rootDir, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, contenido, "utf8");
  return {
    tamañoBytes: Buffer.byteLength(contenido, "utf8"),
    sha256: createHash("sha256").update(contenido, "utf8").digest("hex"),
  };
}

export async function escribirCatalogo(rootDir, registros) {
  await writeFile(path.join(rootDir, "catalogo.json"), JSON.stringify(registros, null, 2), "utf8");
}
