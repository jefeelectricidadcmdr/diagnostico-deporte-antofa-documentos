// Página índice pública mínima — sin framework, sin build. Lee dist-public/catalogo.json
// en el navegador y agrupa por categoria/componente, respetando visible/orden.
// Diseño: ANALISIS_F0-016 Sección 16 (repo WEB DIP).

export function generarIndexHtml() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Biblioteca documental — Diagnóstico del deporte en Antofagasta</title>
<meta name="robots" content="index,follow">
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: .25rem; }
  ul { list-style: none; padding: 0; }
  li { padding: .5rem 0; border-bottom: 1px solid #8882; }
  a { text-decoration: none; }
  a:hover { text-decoration: underline; }
  .desc { display: block; font-size: .85rem; opacity: .75; }
  .vacio { opacity: .7; font-style: italic; }
</style>
</head>
<body>
<h1>Biblioteca documental — Diagnóstico del deporte en Antofagasta</h1>
<div id="contenido"><p class="vacio">Cargando catálogo…</p></div>
<script>
(async () => {
  const contenedor = document.getElementById("contenido");
  let catalogo;
  try {
    const res = await fetch("catalogo.json");
    catalogo = await res.json();
  } catch (e) {
    contenedor.innerHTML = '<p class="vacio">No fue posible cargar el catálogo.</p>';
    return;
  }

  const visibles = catalogo.filter((d) => d.visible);
  if (visibles.length === 0) {
    contenedor.innerHTML = '<p class="vacio">Aún no hay documentos publicados.</p>';
    return;
  }

  const grupos = new Map();
  for (const doc of visibles) {
    const clave = doc.componente ? \`\${doc.categoria} / \${doc.componente}\` : doc.categoria;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(doc);
  }

  const orden = (a, b) => (a.orden ?? 999999) - (b.orden ?? 999999) || a.titulo.localeCompare(b.titulo);
  let html = "";
  for (const [grupo, docs] of grupos) {
    html += \`<h2>\${grupo}</h2><ul>\`;
    for (const doc of docs.sort(orden)) {
      const href = doc.ruta ?? doc.urlExterna;
      html += \`<li><a href="\${href}">\${doc.titulo}</a>\${doc.descripcion ? \`<span class="desc">\${doc.descripcion}</span>\` : ""}</li>\`;
    }
    html += "</ul>";
  }
  contenedor.innerHTML = html;
})();
</script>
</body>
</html>
`;
}
