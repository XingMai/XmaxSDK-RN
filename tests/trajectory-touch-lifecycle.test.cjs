const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
let cleanups = [];
mock.module('react', { namedExports: {
  ...require('react'),
  useMemo: create => create(), useCallback: callback => callback,
  useRef: current => ({ current }),
  useState: () => [{ width: 100, height: 100 }, () => {}],
  useSyncExternalStore: (_subscribe, read) => read(),
  useLayoutEffect: effect => { cleanups.push(effect()); },
} });
mock.module('react-native', { namedExports: {
  View: 'View', StyleSheet: { absoluteFill: {} }, findNodeHandle: () => 1,
  AppState: { addEventListener: () => ({ remove() {} }) },
} });
mock.module(require.resolve('../lib/commonjs/Foundation/Native/NativeXmaxRuntime.js'), { defaultExport: {} });
const { DefaultTrajectoryEffectRenderer } = require('../lib/commonjs/Render/Trajectory/DefaultTrajectoryEffectRenderer');
const { TrajectoryOverlay } = require('../lib/commonjs/Render/Trajectory/TrajectoryOverlay');

function fixture(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const commands = [], samples = [], fingers = new Set();
  const renderer = new DefaultTrajectoryEffectRenderer();
  const detach = renderer.attach(command => {
    commands.push(command);
    if (command.action === 'begin') command.points.forEach(point => fingers.add(point.id));
    if (command.action === 'end') command.ids.forEach(id => fingers.delete(id));
    if (['reset', 'detach'].includes(command.action)) fingers.clear();
  });
  const view = TrajectoryOverlay({
    binding: {
      valid: true, confirmed: true, version: 1, listeners: new Set(),
      format: { width: 100, height: 100 },
      interaction: { generation: 1, isActive: true, subscribe: () => () => {}, submitInteraction: sample => samples.push(sample) },
    },
    renderer, contentMode: 'fill',
  });
  view.props.ref.current = { getBoundingClientRect: () => ({ x: 24, y: 180, width: 100, height: 100 }) };
  const touch = id => ({ identifier: id, pageX: 24 + 10 * (id + 1), pageY: 220 });
  const event = (changed, active) => ({ nativeEvent: { changedTouches: changed.map(touch), touches: active.map(touch) } });
  t.after(() => { cleanups.splice(0).forEach(cleanup => cleanup?.()); detach(); });
  return { handlers: view.props, commands, samples, fingers, event };
}

test('responder release clears every native head and stops sampling even without an end delta', t => {
  const f = fixture(t);
  f.handlers.onResponderGrant(f.event([0], [0]));
  f.handlers.onResponderStart(f.event([0], [0]));
  assert.equal(f.fingers.size, 1, 'Grant/start must not duplicate a native head');
  f.handlers.onResponderRelease(f.event([], []));
  assert.equal(f.fingers.size, 0);
  assert.equal(f.commands.at(-1).action, 'end', 'Release removes heads while letting the native trail fade');
  assert.equal(f.samples.at(-1).isCurrent(), false);
  const count = f.samples.length, commands = f.commands.length;
  f.handlers.onResponderMove(f.event([0], []));
  t.mock.timers.tick(1000);
  assert.equal(f.samples.length, count);
  assert.equal(f.commands.length, commands, 'Late move cannot restart a lifted finger');
});

test('an incomplete end delta reconciles active fingers without removing a stationary held finger', t => {
  const f = fixture(t);
  f.handlers.onResponderGrant(f.event([0], [0]));
  f.handlers.onResponderStart(f.event([1], [0, 1]));
  const ids = [...f.fingers];
  assert.equal(ids.length, 2);
  const previous = f.samples.at(-1);
  f.handlers.onResponderEnd(f.event([], [1]));
  assert.deepEqual([...f.fingers], [ids[1]]);
  assert.equal(previous.isCurrent(), false, 'Queued samples must not retain the lifted finger');
  t.mock.timers.tick(2000);
  assert.deepEqual([...f.fingers], [ids[1]], 'A long stationary press must not be removed by a timeout');
  assert.equal(f.samples.at(-1).points.length, 1);
  f.handlers.onResponderEnd(f.event([], []));
  assert.equal(f.fingers.size, 0);
  const count = f.samples.length;
  t.mock.timers.tick(1000);
  assert.equal(f.samples.length, count);
});

test('new grants replace stale fingers even when native IDs are reused; termination clears both effects and input', t => {
  const f = fixture(t);
  f.handlers.onResponderGrant(f.event([0], [0]));
  const first = [...f.fingers][0];
  f.handlers.onResponderGrant(f.event([0], [0]));
  assert.equal(f.fingers.size, 1);
  assert.notEqual([...f.fingers][0], first);
  f.handlers.onResponderTerminate(f.event([], []));
  assert.equal(f.commands.at(-1).action, 'reset');
  assert.equal(f.fingers.size, 0);
  f.handlers.onResponderRelease(f.event([], []));
  assert.equal(f.fingers.size, 0);
  const count = f.samples.length;
  t.mock.timers.tick(1000);
  assert.equal(f.samples.length, count);
});
