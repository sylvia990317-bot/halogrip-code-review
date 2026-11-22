const test = require('node:test');
const assert = require('node:assert/strict');
const { gsap } = require('gsap');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const { buildIntroTimeline, POSE_PARKED, bucketForDirection } = loadTypeScript(
  'app/work/halogrip/intro-timeline.ts', { modules: { gsap: { default: gsap } } },
);

function fixture(t) {
  // Real GSAP interpolation, with plain overlay targets so no browser is needed.
  const elements = Object.fromEntries(['pin', 'track', 'title', 'subtitle', 'facts', 'callout',
    'note', 'stageTitle', 'stageLabel', 'arc', 'canvasInner'].map(key => [key, {
      opacity: ['title', 'subtitle', 'canvasInner'].includes(key) ? 1 : 0,
      left: '', top: '', width: '', height: '', rotation: 0, scaleX: 1, backgroundColor: '#f9f9fa',
    }]));
  const state = {};
  const timeline = buildIntroTimeline(elements, state, { paused: true });
  t.after(() => timeline.kill());
  return { timeline, state, elements };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);

test('authored hold poses, labels and overlay release survive forward and reverse seeking', t => {
  const { timeline, state, elements } = fixture(t);
  near(timeline.duration(), 0.99);
  const cases = [
    [0.17, 26.67, 0, 0, 0, 0, 1],
    [0.31, 26.53, -50.42, 0, 0, 1, 0],
    [0.47, 0, -90, 0, 0, 0, 0],
    [0.61, 0, -90, 15.12, 0, 0, 0],
    [0.76, 0, -90, 0, 1, 0, 0],
    [0.91, 0, -90, -22.79, 2, 0, 0],
  ];
  for (const [time, pitch, yaw, tilt, direction, backdrop, facts] of [...cases, ...cases.toReversed()]) {
    timeline.seek(time);
    near(state.pitch, pitch); near(state.yaw, yaw); near(state.tilt, tilt);
    near(state.backdrop, backdrop);
    assert.equal(bucketForDirection(state.direction), direction);
    near(elements.facts.opacity, facts);
  }
  timeline.seek(0.99);
  near(elements.canvasInner.opacity, 0);
  near(elements.stageTitle.opacity, 0);
  timeline.seek(0);
  for (const [key, value] of Object.entries(POSE_PARKED)) near(state[key], value);
  near(elements.canvasInner.opacity, 1);
  near(elements.subtitle.opacity, 1);
});

test('mid-transition interpolation and repeated interrupted seeks are deterministic', t => {
  const { timeline, state } = fixture(t);
  timeline.seek(0.09);
  near(state.pitch, (3.06 + 26.67) / 2);
  for (const time of [0.64, 0.805]) {
    timeline.seek(time);
    const expected = { pitch: state.pitch, tilt: state.tilt, direction: state.direction };
    timeline.seek(0.98).seek(0.02).seek(time);
    for (const [key, value] of Object.entries(expected)) near(state[key], value);
  }
});
