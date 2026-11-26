import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { build } = require('esbuild');
const result = await build({
  entryPoints: [new URL('../frontend/src/utils.ts', import.meta.url).pathname.replace(/^\/(.:)/, '$1')],
  bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'map-stub', setup(builder) {
    builder.onResolve({ filter: /^maplibre-gl$/ }, () => ({ path: 'maplibre-gl', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {}; export class LngLatBounds {}' }));
  } }],
});
const { buildEmptyLocationForm, formFromFeature, formToPayload, calculateRideCount } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`,
);

test('new entries and legacy entries default to one ride', () => {
  const fresh = buildEmptyLocationForm(8, 47, null);
  assert.equal(fresh.number_of_rides, '1');
  assert.equal(formToPayload(fresh).number_of_rides, 1);
  const legacy = formFromFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [8, 47] }, properties: {} });
  assert.equal(legacy.number_of_rides, '1');
  assert.equal(formToPayload(legacy).number_of_rides, 1);
});

test('editing preserves saved ride counts and serializes changes as integers', () => {
  const form = formFromFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [8, 47] }, properties: { number_of_rides: 4 } });
  assert.equal(form.number_of_rides, '4');
  assert.equal(formToPayload(form).number_of_rides, 4);
  form.number_of_rides = '7';
  assert.equal(formToPayload(form).number_of_rides, 7);
});

const rides = (properties) => ({ type: 'FeatureCollection', features: properties.map(properties => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [8, 47] }, properties,
})) });

test('ride totals sum ride counts rather than entries', () => {
  assert.equal(calculateRideCount(rides([
    { transport: 'car', number_of_rides: 3 },
    { transport: 'truck', number_of_rides: 2 },
    { transport: 'boat', number_of_rides: 4 },
    { transport: 'bike', number_of_rides: 1 },
  ])), 10);
});

test('one ride per entry and legacy defaults preserve the existing ride total', () => {
  const properties = ['car', 'truck', 'boat', 'bike'].map(transport => ({ transport, number_of_rides: 1 }));
  assert.equal(calculateRideCount(rides(properties)), 4);
  assert.equal(calculateRideCount(rides(properties.map(({ transport }) => ({ transport })))), 4);
  assert.equal(calculateRideCount(rides([{ transport: 'foot', number_of_rides: 8 }])), 0);
  assert.equal(calculateRideCount(rides([])), 0);
  assert.equal(calculateRideCount(null), 0);
});

const datedEntry = (date, properties = {}) => rides([{ travel_date: date, ...properties }]);

test('new entries advance the latest saved time by one minute', () => {
  assert.equal(buildEmptyLocationForm(8, 47, datedEntry('2026-11-22T10:03:00')).travelDateTime, '2026-11-22T10:04:00');
  assert.equal(buildEmptyLocationForm(8, 47, datedEntry('2026-11-22T23:59:00')).travelDateTime, '2026-11-23T00:00:00');
});

test('sleep entries advance by the full number of nights and reset to midnight', () => {
  for (const nights of [1, 3, 10]) {
    const form = buildEmptyLocationForm(8, 47, datedEntry('2026-11-22T10:03:00', { pointtype: 'sleep', nonights: nights }));
    const expected = new Date(2026, 10, 22 + nights, 0, 0);
    const actual = new Date(form.travelDateTime);
    assert.equal(actual.getTime(), expected.getTime());
  }
});

test('zero nights keeps the date, and a manually saved time becomes the next starting time', () => {
  assert.equal(buildEmptyLocationForm(8, 47, datedEntry('2026-11-22T10:03:00', { pointtype: 'sleep', nonights: 0 })).travelDateTime, '2026-11-22T10:04:00');
  const entries = rides([
    { travel_date: '2026-11-22T10:03:00', pointtype: 'sleep', nonights: 3 },
    { travel_date: '2026-11-25T15:30:00', pointtype: 'waypoint' },
  ]);
  assert.equal(buildEmptyLocationForm(8, 47, entries).travelDateTime, '2026-11-25T15:31:00');
});


test('the entry after a midnight reset resumes minute increments on the new day', () => {
  const entries = rides([
    { travel_date: '2026-11-22T10:03:00', pointtype: 'sleep', nonights: 3 },
    { travel_date: '2026-11-25T00:00:00', pointtype: 'waypoint' },
  ]);
  assert.equal(buildEmptyLocationForm(8, 47, entries).travelDateTime, '2026-11-25T00:01:00');
});
