# Publicación de documentos pesados en GitHub Releases — `documentos-diagnostico-v1`

- **Fecha:** 2026-09-25. Release publicado a las 17:01:30 UTC.
- **Estado:** PUBLICADO y verificado. Todavía no está integrado en la web.

## Alcance

Dos PDF pesados se publican **sin optimización, compresión ni modificación alguna** como assets de un GitHub Release de este repositorio. Quedan disponibles mediante URLs públicas de descarga directa, que se conectarán más adelante a la sección "DESCARGAS" de https://diagnosticodeporteantofa.cl.

Esta publicación **no** modifica la web (`web-dip` / PROYECTO 02), Cloudflare, DNS ni el dominio. Tampoco se usó Git LFS ni se versionaron los PDF como blobs: existen solo como assets del release.

## Repositorio y release

| Dato | Valor |
|---|---|
| Repositorio | `jefeelectricidadcmdr/diagnostico-deporte-antofa-documentos` (ya existía; carpeta local hermana de PROYECTO 02) |
| URL | https://github.com/jefeelectricidadcmdr/diagnostico-deporte-antofa-documentos |
| Rama principal | `main` |
| Visibilidad | **Pública**. Era privada y se cambió el 2026-09-25 por decisión explícita del desarrollador, tras auditar el historial completo: sin secretos versionados (`.env*`, `.dev.vars` y `.wrangler/` están ignorados) |
| Tag | `documentos-diagnostico-v1` (sobre `main`, commit `521e331`) |
| Título | Documentos públicos — Diagnóstico del deporte en Antofagasta |
| Descripción | Documentos oficiales asociados al Diagnóstico del deporte en Antofagasta. |
| Página del release | https://github.com/jefeelectricidadcmdr/diagnostico-deporte-antofa-documentos/releases/tag/documentos-diagnostico-v1 |

## Documentos

Las rutas originales están en `D:\OneDrive\APP+WEB DIP\ARCHIVOS_FUENTE_DOCUMENTOS\`, fuera de ambos repositorios.

| Destino funcional | Archivo original | Bytes | MiB | SHA-256 | Nombre publicado |
|---|---|---|---|---|---|
| **INFORME FINAL (LIBRO DIAGNÓSTICO)** | `Libro Diagnóstico para web.pdf` | 358 810 643 | 342,19 | `4fad93035fdb67641c612c38d44496e3753157590eefce0237650fb043a418ac` | `Libro.Diagnostico.para.web.pdf` |
| **CATASTRO DEL DEPORTE (ANEXO 1)** | `Libro Anexos para versión digital.pdf` | 160 668 805 | 153,23 | `0fb480652afcbe8f1045bfd44b2b42ea862436a6339c134c049f8cf4ecd92c76` | `Libro.Anexos.para.version.digital.pdf` |

**Cambio de nombre:** lo aplica GitHub automáticamente al subir un asset (espacios → puntos, sin tildes). No se creó ninguna copia renombrada y el contenido no cambió.

## URLs públicas de descarga directa

- **INFORME FINAL (LIBRO DIAGNÓSTICO)**
  https://github.com/jefeelectricidadcmdr/diagnostico-deporte-antofa-documentos/releases/download/documentos-diagnostico-v1/Libro.Diagnostico.para.web.pdf
- **CATASTRO DEL DEPORTE (ANEXO 1)**
  https://github.com/jefeelectricidadcmdr/diagnostico-deporte-antofa-documentos/releases/download/documentos-diagnostico-v1/Libro.Anexos.para.version.digital.pdf

## Verificación (sin credenciales, `curl` sin autenticación)

| Documento | Respuesta | Content-Length | Content-Type | Content-Disposition | SHA-256 de la copia descargada |
|---|---|---|---|---|---|
| Libro Diagnóstico | 302 → `release-assets.githubusercontent.com` → **200** | 358810643 | application/octet-stream | `attachment; filename=Libro.Diagnostico.para.web.pdf` | idéntico al original ✓ |
| Libro Anexos | 302 → `release-assets.githubusercontent.com` → **200** | 160668805 | application/octet-stream | `attachment; filename=Libro.Anexos.para.version.digital.pdf` | idéntico al original ✓ |

- La API de GitHub registra ambos assets con `state: uploaded`, `contentType: application/pdf` y tamaño idéntico al original.
- Después de la subida se recalculó el SHA-256 de los originales: siguen intactos.
- La URL `…/releases/download/…` es estable. La redirección firmada que devuelve GitHub es temporal y **no** debe usarse como enlace.

## Confirmaciones

- Sin optimización, compresión, rasterización, división ni cambio de metadatos: los bytes publicados son los originales (SHA-256 verificado por descarga).
- Los originales permanecen en `ARCHIVOS_FUENTE_DOCUMENTOS` sin cambios.
- Sin tarjeta de crédito ni servicios de pago. Se usó GitHub Releases gratuito, con un límite de 2 GiB por asset.
- Autenticación: GitHub CLI 2.101.0 (instalado con winget) y `gh auth login` interactivo completado por el desarrollador. Ningún token se imprimió ni se documentó.
- `catalogo.json` no se modificó. El estado `PUBLICADO` solo lo escribe `confirm-document-publication`; registrar estos documentos como `urlExterna` queda para la tarea de integración.
