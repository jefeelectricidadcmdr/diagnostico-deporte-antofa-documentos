# Biblioteca documental — Diagnóstico del deporte en Antofagasta

Repositorio **independiente**, hermano del repositorio principal `web-dip` — nunca anidado
dentro de él. Contiene exclusivamente la fuente maestra de los documentos públicos
(informes, anexos, planillas, presentaciones, publicaciones) destinados a consulta o
descarga desde `documentos.diagnosticodeporteantofa.cl`.

Este repositorio **no** contiene código de la aplicación principal, ni documentación
técnica interna del desarrollo (esa vive en `TAREAS/`/`DOCUMENTACION/` del repositorio
`web-dip`). Diseño completo de esta arquitectura:
`DOCUMENTACION/ANALISIS_F0-016_ARQUITECTURA_BIBLIOTECA_DOCUMENTAL_PUBLICA.md` y
`TAREAS/TAREA_F0-016_ARQUITECTURA_BIBLIOTECA_DOCUMENTAL_PUBLICA.md` en el repositorio `web-dip`.

## Fuente de verdad

El repositorio Git **remoto** (`origin`) es la fuente de verdad entre PC hogar y PC
trabajo. Cada equipo trabaja mediante `git clone`/`pull`/`push` normal. OneDrive puede
actuar como respaldo pasivo adicional de los archivos en disco, pero **nunca** sustituye
a Git ni sincroniza cambios concurrentes del repositorio — la disciplina de trabajo es
`pull` antes de empezar, `commit`/`push` al terminar.

## Estructura

```
/
├── catalogo.json        ← catálogo MAESTRO: todos los estados (BORRADOR/APROBADO_PARA_PUBLICAR/PUBLICADO/RETIRADO)
├── wrangler.json         ← configuración de Cloudflare Workers Static Assets
├── package.json
├── scripts/
│   ├── lib/
│   │   ├── catalog.mjs        ← utilidades compartidas (hash, nomenclatura, listado de archivos)
│   │   ├── zip-inspect.mjs    ← lector mínimo de nombres de entrada de un ZIP
│   │   └── index-html.mjs     ← generador de la página índice pública
│   ├── verify-document-library.mjs
│   ├── prepare-document-library.mjs
│   ├── confirm-document-publication.mjs
│   └── __tests__/              ← pruebas automatizadas (node --test)
├── recursos/                   ← categoría con contenido real (otras categorías se
│                                  crean solo cuando exista un documento real que las use)
└── dist-public/                 ← ARTEFACTO derivado y regenerable — nunca fuente de
                                    verdad, excluido de Git (.gitignore)
```

`_historico/` y `scripts/` (más allá de lo ya implementado) se crean únicamente cuando
exista una necesidad real — nunca vacías por anticipación.

## Cadena de publicación (única, vía Wrangler)

```
1. npm run verify            → gate de integridad sobre la fuente maestra
2. npm run prepare-library -- --candidatos=id1,id2
                              → genera dist-public/ CANDIDATO (nunca toca catalogo.json)
3. npm run deploy             → wrangler deploy (Workers Static Assets)
4. npm run confirm -- --candidatos=id1,id2 --base-url=https://<url-del-worker>
                              → verifica la URL pública real; SOLO entonces promueve
                                estado="PUBLICADO" en el catálogo maestro
```

Un `wrangler deploy` fallido, o una verificación de URL que no coincide, **nunca** deja
un documento en `PUBLICADO` — permanece en `APROBADO_PARA_PUBLICAR` para reintentar.

`confirm-document-publication` es la **única** vía autorizada para escribir
`estado="PUBLICADO"` — nunca se edita ese campo a mano en `catalogo.json`.

## Esquema de `catalogo.json`

Ver `DOCUMENTACION/ANALISIS_F0-016_...md` (Sección 7/7.1) en el repositorio `web-dip`
para el esquema completo. Resumen de las reglas críticas:

- Exactamente uno de `ruta` / `urlExterna` debe existir por registro.
- `ruta` (documento alojado): `sha256`/`tamañoBytes`/`mimeType` siempre obligatorios.
- `urlExterna` (documento externo, política de archivos > 25 MiB): `mimeType` siempre
  obligatorio; `integridadVerificada` (boolean) siempre obligatorio — si `true`,
  `sha256`/`tamañoBytes` obligatorios; si `false`, deben quedar ausentes/`null` (nunca
  un valor inventado).
- `fechaPublicacion` solo existe una vez que `confirm-document-publication` publicó el
  documento por primera vez (estado `PUBLICADO`/`RETIRADO`) — ausente en
  `BORRADOR`/`APROBADO_PARA_PUBLICAR`.

## Pruebas

```
npm test
```

Corre `verify-document-library`, `prepare-document-library` y
`confirm-document-publication` contra repositorios de prueba aislados (nunca contra
este catálogo real) — incluye explícitamente el camino de fallo (deployment fallido,
URL que no verifica, hash incorrecto).

## Documento de prueba técnica

`recursos/documento-prueba-tecnica-f0-016.csv` — usado exclusivamente para validar la
infraestructura de Puerta B de F0-016. No es contenido público real del Diagnóstico.
`recursos/documento-borrador-prueba-f0-016.csv` — mismo propósito, en estado `BORRADOR`,
usado para comprobar que un borrador nunca llega a `dist-public/` ni queda accesible
por URL pública.
