const layers = [
  {
    name: input.backgroundLayer,
    type: "layer",
    operation: { type: "edit" },
    image: { source: { url: input.background.outputs[0].image.url } },
    transformMode: "fill",
  },
];
// Empty text means "leave this layer as it is".
const text = (name, content) => {
  if (content.length > 0) {
    layers.push({ name, type: "text_layer", operation: { type: "edit" }, text: { content } });
  }
};
text(input.headlineLayer, input.headline);
text(input.subheadLayer, input.subhead);
return { layers };
