const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');

function warmupHarness() {
  let resolveCompile;
  const compilation = new Promise(resolve => { resolveCompile = resolve; });
  const timers = new Map();
  let ready = 0;
  const hidden = { visible: false };
  const { warmupScene } = loadTypeScript('app/work/halogrip/gpu-warmup.ts', {
    globals: {
      setTimeout: fn => { timers.set(1, fn); return 1; },
      clearTimeout: id => timers.delete(id),
    },
  });
  const cleanup = warmupScene(
    { compileAsync: () => compilation, initTexture() {} },
    { traverse: visit => visit(hidden) }, {}, () => { ready++; },
  );
  return {
    get ready() { return ready; }, hidden, timers, cleanup,
    compile: async () => { resolveCompile(); await compilation; },
    deadline: () => { for (const fn of [...timers.values()]) fn(); },
  };
}

test('pending GPU compilation cannot hold the intro indefinitely', async () => {
  const h = warmupHarness();
  assert.equal(h.ready, 0);
  assert.equal(h.hidden.visible, false);
  h.deadline();
  assert.equal(h.ready, 1);
  await h.compile();
  assert.equal(h.ready, 1);
});

test('completed GPU warm-up cancels its fallback deadline', async () => {
  const h = warmupHarness();
  await h.compile();
  assert.equal(h.ready, 1);
  assert.equal(h.timers.size, 0);
});

test('unmounted GPU warm-up never announces readiness', async () => {
  const h = warmupHarness();
  h.cleanup();
  await h.compile();
  h.deadline();
  assert.equal(h.ready, 0);
  assert.equal(h.timers.size, 0);
});

function harness() {
  const timers = new Map();
  let id = 0;
  const api = loadTypeScript('app/work/halogrip/pin-coordinator.ts', {
    globals: {
      setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
      clearTimeout: key => timers.delete(key),
    },
  });
  return { create: api.createPinCoordinator, timers,
    flush() { for (const [key, task] of [...timers]) { if (timers.delete(key)) task.fn(); } },
  };
}

test('already-ready delivery can be cancelled before the next task', () => {
  const h = harness(); const c = h.create(); let calls = 0;
  c.markPinReady('scroll-intro');
  c.onPinsReady(['scroll-intro'], () => calls++)();
  h.flush(); assert.equal(calls, 0); assert.equal(h.timers.size, 0);
});
test('waiting delivery remains cancellable after readiness', () => {
  const h = harness(); const c = h.create(); let calls = 0;
  const cancel = c.onPinsReady(['scroll-intro'], () => calls++);
  c.markPinReady('scroll-intro'); cancel(); h.flush();
  assert.equal(calls, 0); assert.equal(h.timers.size, 0);
});
test('all dependencies are required and delivery occurs once', () => {
  const h = harness(); const c = h.create(); let calls = 0;
  c.onPinsReady(['scroll-intro', 'design-gap-sequence'], () => calls++);
  c.markPinReady('scroll-intro'); assert.equal(calls, 0);
  c.markPinReady('design-gap-sequence'); c.markPinReady('design-gap-sequence');
  h.flush(); h.flush(); assert.equal(calls, 1); assert.equal(h.timers.size, 0);
});
test('fallback deadline delivers once and removes its waiter', () => {
  const h = harness(); const c = h.create(); let calls = 0;
  c.onPinsReady(['scroll-intro'], () => calls++);
  h.flush(); c.markPinReady('scroll-intro'); h.flush();
  assert.equal(calls, 1); assert.equal(h.timers.size, 0);
});
test('page instances do not inherit readiness from a previous visit', () => {
  const h = harness(); const first = h.create(); const second = h.create();
  first.markPinReady('scroll-intro');
  let calls = 0;
  const cancel = second.onPinsReady(['scroll-intro'], () => calls++);
  assert.equal([...h.timers.values()][0].delay, 20000);
  assert.equal(calls, 0); cancel(); assert.equal(h.timers.size, 0);
  second.markPinReady('scroll-intro');
  second.onPinsReady(['scroll-intro'], () => calls++); h.flush();
  assert.equal(calls, 1);
});
test('unmount before readiness leaves no pending timeout', () => {
  const h = harness(); const c = h.create(); let calls = 0;
  c.onPinsReady(['scroll-intro'], () => calls++)();
  c.markPinReady('scroll-intro'); h.flush();
  assert.equal(calls, 0); assert.equal(h.timers.size, 0);
});
