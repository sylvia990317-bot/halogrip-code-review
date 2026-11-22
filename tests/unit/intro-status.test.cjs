const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const { transitionIntro: next } = loadTypeScript('app/work/halogrip/intro-status.ts');

test('desktop loading requires GPU readiness and re-enabling static starts a fresh load', () => {
  let status = next('checking', 'enable');
  assert.equal(status, 'loading');
  status = next(status, 'ready');
  assert.equal(status, 'ready');
  assert.equal(next(status, 'enable'), 'ready');
  status = next(status, 'disable');
  assert.equal(status, 'static');
  assert.equal(next(status, 'enable'), 'loading');
});

test('late GPU completion or failure cannot revive the static intro', () => {
  for (const initial of ['checking', 'static']) {
    assert.equal(next(initial, 'ready'), initial);
    assert.equal(next(initial, 'fail'), initial);
  }
});

test('load/context failure is terminal even when viewport or GPU readiness changes', () => {
  for (const initial of ['loading', 'ready']) {
    const failed = next(initial, 'fail');
    assert.equal(failed, 'failed');
    for (const event of ['enable', 'disable', 'ready', 'fail']) {
      assert.equal(next(failed, event), 'failed');
    }
  }
});
