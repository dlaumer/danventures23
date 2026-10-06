import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { transformSync } = require('esbuild');
const { validateStyleMin, featureFilter } = require('@maplibre/maplibre-gl-style-spec');
const source = readFileSync(new URL('../frontend/src/journeyMapStyle.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const { createJourneyMapStyle, tripLabelArea, tripPlaceFilter, journeyPlaceLevels, importantTripStops } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const locations = (points) => ({ type: 'FeatureCollection', features: points.map(coordinates => ({
  type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { name: 'Private host name' },
})) });

test('Journey style is valid before data arrives and after trip filters load', () => {
  const style = createJourneyMapStyle();
  assert.deepEqual(validateStyleMin(style), []);
  const area = tripLabelArea(locations([[-4.488,48.377],[2.148,41.410],[-68.298,-54.799]]));
  for (const { name } of journeyPlaceLevels) {
    style.layers.find(layer => layer.id === `journey-place-${name}`).filter = tripPlaceFilter(name,area);
    assert.equal(featureFilter(tripPlaceFilter(name,area)).needGeometry,true);
  }
  assert.deepEqual(validateStyleMin(style), []);
});

test('Trip label area follows the selected locations and handles empty data', () => {
  assert.deepEqual(tripLabelArea(null).coordinates, []);
  const before = tripLabelArea(locations([[2.148,41.410]]));
  const after = tripLabelArea(locations([[-68.298,-54.799]]));
  assert.notDeepEqual(before, after);
  const compiled = featureFilter(tripPlaceFilter('city',tripLabelArea(null)));
  assert.equal(compiled.filter({zoom:5},{type:1,properties:{class:'city',name:'Barcelona'}}),false);
  for (const ring of before.coordinates.flat()) {
    assert.deepEqual(ring[0],ring.at(-1));
    assert.equal(ring.length,5);
  }
});

test('Only geographically visited featured stops get public labels', () => {
  assert.equal(importantTripStops(null).features.length,0);
  const barcelona = importantTripStops(locations([[2.148,41.410],[8.916,47.294]]));
  assert.deepEqual(barcelona.features.map(f=>f.properties.name),['Barcelona']);
  const ushuaia = importantTripStops(locations([[-68.298,-54.799]]));
  assert.deepEqual(ushuaia.features.map(f=>f.properties.name),['Ushuaia']);
  assert(!JSON.stringify(barcelona).includes('Private host name'));
});
