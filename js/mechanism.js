// The physical pieces in a 3 by 3 cube. This module has no WebGL dependency so
// its arrangement and teaching copy stay testable outside the browser.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeMechanism = api;
})(this, function () {
  'use strict';

  const STICKERS = [
    { axis: 0, value: 1, color: 'r', normal: [1, 0, 0] },
    { axis: 0, value: -1, color: 'o', normal: [-1, 0, 0] },
    { axis: 1, value: 1, color: 'w', normal: [0, 1, 0] },
    { axis: 1, value: -1, color: 'y', normal: [0, -1, 0] },
    { axis: 2, value: 1, color: 'g', normal: [0, 0, 1] },
    { axis: 2, value: -1, color: 'b', normal: [0, 0, -1] },
  ];
  const COPY = {
    core: {
      kind: 'core', title: 'Core',
      detail: 'The core stays in the middle. Its six arms hold the centers, so the cube has a fixed frame to turn around.',
    },
    center: {
      kind: 'center', title: 'Center piece',
      detail: 'A center is fastened to the core. It can turn with a face, but it stays opposite its matching center and makes the tracks for the other pieces.',
    },
    edge: {
      kind: 'edge', title: 'Edge piece',
      detail: 'An edge has two colors. Its hidden foot runs in the tracks between the centers, so it can move around the cube but stays captured inside.',
    },
    corner: {
      kind: 'corner', title: 'Corner piece',
      detail: 'A corner has three colors. Its wide hidden foot locks beneath the surrounding centers and edges, letting it turn without falling out.',
    },
  };
  const BASE = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const origin = [x, y, z];
    const nonZero = origin.filter(Boolean).length;
    const kind = nonZero === 0 ? 'core' : nonZero === 1 ? 'center' : nonZero === 2 ? 'edge' : 'corner';
    BASE.push({
      id: kind === 'core' ? 'core' : `${kind}-${origin.join(',')}`,
      kind, origin,
      stickers: STICKERS.filter(sticker => origin[sticker.axis] === sticker.value),
    });
  }

  function partsAt(amount) {
    const progress = Math.max(0, Math.min(1, Number(amount) || 0));
    const scale = 1 + progress * 1.7;
    return BASE.map(part => ({
      ...part,
      origin: part.origin.slice(),
      position: part.kind === 'core' ? [0, 0, 0] : part.origin.map(value => value * scale),
      stickers: part.stickers.map(sticker => ({ ...sticker, normal: sticker.normal.slice() })),
    }));
  }

  function describe(kind) { return COPY[kind] || COPY.core; }

  return { partsAt, describe };
});
