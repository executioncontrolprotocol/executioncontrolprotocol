const out = [];
const walk = (layers, parents) => {
  for (const layer of layers || []) {
    const row = {
      name: layer.name,
      type: layer.type,
      id: layer.id,
      path: [...parents, layer.name].join(" / "),
      depth: parents.length,
      visible: layer.visible,
    };
    if (layer.text && typeof layer.text.content === "string") row.text = layer.text.content;
    out.push(row);
    if (Array.isArray(layer.children)) walk(layer.children, [...parents, layer.name]);
  }
};
const manifest = input.manifest || {};
walk(manifest.layers || [], []);
const document = manifest.document
  ? {
      width: manifest.document.bounds.right - manifest.document.bounds.left,
      height: manifest.document.bounds.bottom - manifest.document.bounds.top,
      mode: manifest.document.imageMode,
    }
  : undefined;
return {
  document,
  layers: out,
  names: out.map((layer) => layer.name),
  count: out.length,
};