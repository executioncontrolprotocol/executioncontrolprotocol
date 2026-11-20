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
const first = ((input.manifest && input.manifest.outputs) || [])[0] || {};
const content = first.content ?? (first.destination && first.destination.content);
walk(first.layers || (content && content.layers), []);
const document =
  content && content.document
    ? {
        width: content.document.bounds.right - content.document.bounds.left,
        height: content.document.bounds.bottom - content.document.bounds.top,
        mode: content.document.imageMode,
      }
    : undefined;
return {
  document,
  layers: out,
  names: out.map((layer) => layer.name),
  count: out.length,
};