const test = require('node:test');
const assert = require('node:assert/strict');
const Mechanism = require('../js/mechanism.js');

test('the mechanism names all 27 physical parts of a 3 by 3 cube', () => {
  const parts = Mechanism.partsAt(0);
  assert.equal(parts.length, 27);
  assert.equal(parts.filter(part => part.kind === 'core').length, 1);
  assert.equal(parts.filter(part => part.kind === 'center').length, 6);
  assert.equal(parts.filter(part => part.kind === 'edge').length, 12);
  assert.equal(parts.filter(part => part.kind === 'corner').length, 8);
  assert.deepEqual(parts.find(part => part.id === 'core').position, [0, 0, 0]);
});

test('exploding the mechanism preserves every part identity and moves pieces away from the core', () => {
  const assembled = Mechanism.partsAt(0);
  const exploded = Mechanism.partsAt(1);
  assert.deepEqual(exploded.map(part => part.id), assembled.map(part => part.id));
  const edge = exploded.find(part => part.id === 'edge-1,1,0');
  assert.ok(Math.hypot(...edge.position) > Math.hypot(1, 1, 0));
  assert.deepEqual(exploded.find(part => part.id === 'core').position, [0, 0, 0]);
});

test('part descriptions explain how every movable type stays captured', () => {
  for (const kind of ['core', 'center', 'edge', 'corner']) {
    const info = Mechanism.describe(kind);
    assert.equal(info.kind, kind);
    assert.ok(info.title.length > 0);
    assert.match(info.detail, /core|captured|track|turn/i);
  }
});
