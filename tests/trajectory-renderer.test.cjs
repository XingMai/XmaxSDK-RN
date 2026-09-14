const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
mock.module('react-native', { namedExports: {
  View: 'View', StyleSheet: { absoluteFill: {} }, findNodeHandle: () => 1,
} });
mock.module(require.resolve('../lib/commonjs/Foundation/Native/NativeXmaxRuntime.js'), { defaultExport: { renderTrajectory() {} } });
const { DefaultTrajectoryEffectRenderer } = require('../lib/commonjs/Render/Trajectory/DefaultTrajectoryEffectRenderer');

function fixture() {
  class Custom extends DefaultTrajectoryEffectRenderer {
    colorsForTrajectory(id) { return { core: '#FFFFFF', glow: id === 'second' ? '#24BDFF' : '#FF2EB8' }; }
  }
  const renderer = new Custom();
  const commands = [];
  const point = (x, y = 20, id = 'finger') => ({ id, location: { x, y }, normalizedLocation: { x: x / 100, y: y / 100 }, timestamp: 0 });
  return { renderer, commands, point, attach: () => renderer.attach(command => commands.push(command)) };
}

test('native canvas receives unscaled viewport coordinates and stable per-finger palettes without React frames', t => {
  const f = fixture();
  const raf = t.mock.method(global, 'setTimeout', () => { throw Error('No JS animation timer'); });
  const detach = f.attach();
  f.renderer.renderBegan([f.point(30, 80), f.point(90, 60, 'second')]);
  assert.deepEqual(f.commands.at(-1), { action: 'begin', points: [
    { id: 'finger', x: 30, y: 80, core: '#FFFFFF', glow: '#FF2EB8' },
    { id: 'second', x: 90, y: 60, core: '#FFFFFF', glow: '#24BDFF' },
  ] });
  const view = f.renderer.view;
  for (let x = 31; x <= 100; x++) f.renderer.renderMoved([f.point(x, 120)]);
  assert.equal(f.renderer.view, view);
  assert.deepEqual(f.commands.at(-1).points[0], { id: 'finger', x: 100, y: 120, core: '#FFFFFF', glow: '#FF2EB8' });
  assert.equal(f.commands.filter(command => command.action === 'move').length, 70, 'Preserve intermediate input endpoints rather than replacing a whole frame by its final point');
  assert.equal(raf.mock.callCount(), 0);
  detach();
});

test('mount catches up with the latest active touch; ended touches cannot reappear', () => {
  const f = fixture();
  f.renderer.renderBegan([f.point(10), f.point(20, 30, 'second')]);
  f.renderer.renderMoved([f.point(50)]);
  f.renderer.renderEnded(['second']);
  const detach = f.attach();
  assert.equal(f.commands[0].action, 'reset');
  assert.deepEqual(f.commands[1].points, [{ id: 'finger', x: 50, y: 20, core: '#FFFFFF', glow: '#FF2EB8' }]);
  f.renderer.renderEnded(['finger']);
  const count = f.commands.length;
  f.renderer.renderMoved([f.point(80)]);
  assert.equal(f.commands.length, count, 'Late movement must not resurrect a released finger');
  detach();
});

test('reset is reusable; detached hosts receive no late commands and old cleanup cannot detach replacements', () => {
  const f = fixture();
  const oldDetach = f.attach();
  f.renderer.renderBegan([f.point(10)]);
  f.renderer.reset();
  assert.equal(f.commands.at(-1).action, 'reset');
  f.renderer.renderBegan([f.point(20)]);
  const next = [];
  const detach = f.renderer.attach(command => next.push(command));
  assert.equal(f.commands.at(-1).action, 'detach');
  oldDetach();
  f.renderer.renderMoved([f.point(40)]);
  assert.equal(next.at(-1).points[0].x, 40);
  const oldCount = f.commands.length;
  detach();
  assert.equal(next.at(-1).action, 'detach');
  const count = next.length;
  f.renderer.reset();
  f.renderer.renderMoved([f.point(60)]);
  assert.equal(next.length, count);
  assert.equal(f.commands.length, oldCount);
});
