const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
mock.module('react-native', { namedExports: { View: 'View', StyleSheet: { create: styles => styles, absoluteFill: {} } } });
const { DefaultTrajectoryEffectRenderer } = require('../lib/commonjs/Render/Trajectory/DefaultTrajectoryEffectRenderer');

test('default effects fade while idle, release RAF on reset and can be reused with custom colors', t => {
  const frames = new Map();
  let next = 0, now = 0;
  const previousRequest = global.requestAnimationFrame, previousCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
  global.cancelAnimationFrame = id => frames.delete(id);
  t.mock.method(performance, 'now', () => now * 1000);
  class Custom extends DefaultTrajectoryEffectRenderer {
    colorsForTrajectory() { return { core: '#FFFFFF', glow: '#FF2EB8' }; }
  }
  const renderer = new Custom();
  let updates = 0;
  const off = renderer.subscribe(() => updates++);
  const point = (x, timestamp) => ({ id: 'finger', location: { x, y: 20 }, normalizedLocation: { x: x / 100, y: 0.2 }, timestamp });
  function step(time) {
    now = time;
    const queued = [...frames.values()]; frames.clear();
    queued.forEach(callback => callback(now * 1000));
  }
  try {
    renderer.renderBegan([point(10, 0)]);
    step(0.01);
    renderer.renderMoved([point(20, 0.02)]);
    renderer.renderEnded(['finger']);
    step(0.03);
    assert.equal(frames.size, 1, 'Trail continues fading after finger release');
    step(2);
    assert.equal(frames.size, 0, 'Idle renderer does not keep an animation loop');
    renderer.renderBegan([point(30, 2)]);
    assert.equal(frames.size, 1);
    renderer.reset();
    assert.equal(frames.size, 0);
    renderer.renderBegan([point(40, 2)]);
    assert.equal(frames.size, 1, 'Renderer survives a cancelled gesture or task change');
    assert(updates > 0);
  } finally {
    renderer.reset(); off();
    if (previousRequest) global.requestAnimationFrame = previousRequest; else delete global.requestAnimationFrame;
    if (previousCancel) global.cancelAnimationFrame = previousCancel; else delete global.cancelAnimationFrame;
  }
});
