export const $ = (id) => document.getElementById(id);
export const asset = (color, type) =>
  `/assets/${color}${type.toUpperCase()}.svg`;
