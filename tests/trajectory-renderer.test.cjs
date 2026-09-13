const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const effects = [], animations = [];
mock.module('react', { namedExports: {
  ...require('react'), useMemo: create => create(), useEffect: effect => effects.push(effect()),
  useLayoutEffect: effect => effects.push(effect()),
} });
const animation = config => {
  const value = { config, starts: 0, stops: 0, start() { this.starts++; }, stop() { this.stops++; } };
  animations.push(value);
  return value;
};
mock.module('react-native', { namedExports: {
  View: 'View', StyleSheet: { create: styles => styles, absoluteFill: {} },
  Easing: { linear: t => t },
  Animated: {
    View: 'Animated.View',
    Value: class { constructor(value) { this.value = value; } interpolate(config) { return { animated: this, config }; } },
    ValueXY: class {
      constructor(value, config) { this.value = value; this.config = config; this.updates = 0; }
      setValue(value) { this.value = value; this.updates++; }
      getTranslateTransform() { return [{ translateX: this }, { translateY: this }]; }
    },
    timing: (value, config) => animation({ ...config, value }),
    loop: child => animation({ child }),
  },
} });
const { DefaultTrajectoryEffectRenderer } = require('../lib/commonjs/Render/Trajectory/DefaultTrajectoryEffectRenderer');

function fixture(t) {
  const frames = new Map(), timers = new Map();
  let next = 0, now = 0;
  const previousRequest = global.requestAnimationFrame, previousCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
  global.cancelAnimationFrame = id => frames.delete(id);
  t.mock.method(global, 'setTimeout', (callback, delay) => { timers.set(++next, { callback, at: now + delay / 1000 }); return next; });
  t.mock.method(global, 'clearTimeout', id => timers.delete(id));
  t.mock.method(performance, 'now', () => now * 1000);
  class Custom extends DefaultTrajectoryEffectRenderer {
    colorsForTrajectory(id) { return { core: '#FFFFFF', glow: id === 'second' ? '#24BDFF' : '#FF2EB8' }; }
  }
  const renderer = new Custom();
  let updates = 0;
  const off = renderer.subscribe(() => updates++);
  const point = (x, id = 'finger') => ({ id, location: { x, y: 20 }, normalizedLocation: { x: x / 100, y: 0.2 }, timestamp: now });
  const draw = () => renderer.content().props.children;
  const frame = time => {
    now = time;
    const queued = [...frames.values()]; frames.clear();
    queued.forEach(callback => callback(now * 1000));
  };
  const advance = time => {
    now = time;
    for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); }
  };
  t.after(() => {
    renderer.reset(); off();
    effects.splice(0).forEach(cleanup => cleanup?.());
    animations.length = 0;
    if (previousRequest) global.requestAnimationFrame = previousRequest; else delete global.requestAnimationFrame;
    if (previousCancel) global.cancelAnimationFrame = previousCancel; else delete global.cancelAnimationFrame;
  });
  return { renderer, point, draw, frame, advance, frames, timers, updates: () => updates };
}

test('stationary heads and fading trails have no recurring JS animation frame; reset releases all work and is reusable', t => {
  const f = fixture(t), r = f.renderer;
  r.renderBegan([f.point(10)]);
  f.frame(0.01);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  const updates = f.updates();
  f.advance(0.2);
  assert.equal(f.updates(), updates, 'Holding a finger must not rerender effects every frame');
  r.renderMoved([f.point(20)]);
  r.renderEnded(['finger']);
  f.frame(0.21);
  assert.equal(f.frames.size, 0, 'Native animation fades the trail after release');
  assert.equal(f.timers.size, 1, 'Only expiry cleanup remains');
  assert.equal(f.draw()[0].length, 1);
  assert.equal(f.draw()[1].length, 0);
  f.advance(2);
  assert.equal(f.draw()[0].length, 0);
  assert.equal(f.timers.size, 0);
  r.renderBegan([f.point(30)]);
  r.renderMoved([f.point(40)]);
  r.reset();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.draw(), [[], []]);
  r.renderBegan([f.point(50)]);
  f.frame(2.1);
  assert.equal(f.draw()[1].length, 1);
});

test('dense input coalesces per finger and frame, preserves endpoints and palette, and keeps old segment props stable', t => {
  const f = fixture(t), r = f.renderer;
  r.renderBegan([f.point(0), f.point(10, 'second')]);
  f.frame(0.01);
  for (let x = 1; x <= 1000; x++) r.renderMoved([f.point(x), f.point(x + 10, 'second')]);
  assert.equal(f.frames.size, 1);
  f.frame(0.02);
  const segments = f.draw()[0];
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].props.segment.from, { x: 0, y: 20 });
  assert.deepEqual(segments[0].props.segment.to, { x: 1000, y: 20 });
  assert.equal(segments[0].props.segment.colors.glow, '#FF2EB8');
  assert.equal(segments[1].props.segment.colors.glow, '#24BDFF');
  r.renderMoved([f.point(1010)]);
  r.renderEnded(['finger']);
  f.frame(0.03);
  const next = f.draw();
  assert.equal(next[0].length, 3);
  assert.equal(next[0][0].props.segment, segments[0].props.segment, 'Memoized trail must keep its prop identity');
  assert.deepEqual(next[0][2].props.segment.from, { x: 1000, y: 20 });
  assert.deepEqual(next[0][2].props.segment.to, { x: 1010, y: 20 });
  assert.equal(next[1].length, 1, 'Ending one finger does not remove another head');
});

test('native view count stays bounded and pending moves cannot reappear after cancellation', t => {
  const f = fixture(t), r = f.renderer;
  r.renderBegan([f.point(0)]);
  for (let i = 1; i < 400; i++) { r.renderMoved([f.point(i)]); f.frame(i / 1000); }
  assert.equal(f.draw()[0].length, 256);
  r.renderMoved([f.point(500)]);
  r.reset();
  f.frame(1);
  f.advance(5);
  assert.deepEqual(f.draw(), [[], []]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
});

test('mounted heads follow every input immediately and retain animation identity across trail frames', t => {
  const f = fixture(t), r = f.renderer;
  r.renderBegan([f.point(10), f.point(30, 'second')]);
  f.frame(0.01);
  const heads = f.draw()[1];
  // Movement before mount must not allocate a detached native animation node.
  r.renderMoved([f.point(15)]);
  assert.equal(heads[0].props.head.position, undefined);
  for (const element of heads) (element.type.type ?? element.type)(element.props);
  const first = heads[0].props.head.position;
  const second = heads[1].props.head.position;
  assert.equal(first.config.useNativeDriver, true);
  assert.equal(first.value.x, 15, 'Mount catches up with input received since render');
  const updates = f.updates(), animationCount = animations.length;
  for (let x = 16; x <= 1000; x++) r.renderMoved([f.point(x)]);
  assert.equal(first.value.x, 1000, 'Head must not wait for the next RAF or React commit');
  assert.equal(second.value.x, 30, 'Other fingers keep their own position');
  assert.equal(f.updates(), updates, 'Moving a head does not publish a React update');
  f.frame(0.02);
  assert.equal(f.draw()[1][0].props.head, heads[0].props.head, 'React.memo skips the head and its animated children');
  assert.equal(animations.length, animationCount, 'Movement does not restart pulse/orbit animations');
  assert.equal(f.draw()[0][0].props.segment.from.x, 10, 'Immediate head updates must not erase the trail origin');
  assert.equal(f.draw()[0][0].props.segment.to.x, 1000);
  effects.splice(0).forEach(cleanup => cleanup?.());
  const writes = first.updates;
  r.renderMoved([f.point(1100)]);
  assert.equal(first.updates, writes, 'Unmount disconnects native position updates');
  r.reset();
  f.frame(1);
  assert.deepEqual(f.draw(), [[], []]);
});

test('trail fade and head loops use native non-interaction animations and stop when views unmount', t => {
  const f = fixture(t), r = f.renderer;
  r.renderBegan([f.point(10)]);
  f.frame(0.01);
  r.renderMoved([f.point(20)]);
  f.frame(0.02);
  const [segments, heads] = f.draw();
  const mount = element => (element.type.type ?? element.type)(element.props);
  const trail = mount(segments[0]);
  mount(heads[0]);
  const timings = animations.filter(value => 'duration' in value.config);
  assert.equal(timings.length, 3);
  assert(timings.every(value => value.config.useNativeDriver === true && value.config.isInteraction === false));
  const fade = timings[0].config;
  assert(Math.abs(fade.value.value * (1 - fade.easing(0.5)) + fade.toValue * fade.easing(0.5)
    - Math.pow(0.95, (0.01 + fade.duration / 2000) * 60)) < 1e-8);
  const loops = animations.filter(value => value.config.child);
  assert.equal(loops.length, 2);
  assert(loops.every(value => value.starts === 1));
  assert.equal(timings[1].config.easing(0), timings[1].config.easing(1), 'Pulse loops without a discontinuity');
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    for (const style of [node.props?.style].flat().filter(Boolean)) assert.equal(style.boxShadow, undefined);
    for (const child of [node.props?.children].flat()) walk(child);
  };
  walk(trail);
  effects.splice(0).forEach(cleanup => cleanup?.());
  assert.equal(animations[0].stops, 1);
  assert(loops.every(value => value.stops === 1));
});
