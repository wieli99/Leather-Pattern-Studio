import { test, expect } from 'vitest';
import { construct } from '../editor/construction';
import { measurementGeometry } from './measurement';
import { intersectsBox, boundary, bounds, hitTest, transformShape } from './geometry';
import { parseProject } from './project';
import { stitchEdges } from './stitchGeometry';
const measurement = () => ({ ...construct('measurement', [{x:0,y:0},{x:40,y:0},{x:10,y:12}]), id:'dimension', name:'Measurement' });
test('offset is perpendicular and independent of third-click position along the baseline', () => {
  const s = measurement(), g = measurementGeometry(s);
  expect(s.measurementOffset).toBe(12);
  expect(g.start).toEqual({x:0,y:12});
  expect(g.label).toBe('40.00 mm');
  expect(measurementGeometry({...s, measurementOffset:-8}).start.y).toBe(-8);
  expect(() => construct('measurement',[{x:0,y:0},{x:0,y:0}])).toThrow();
});
test('bounds and hit testing include extension lines and label', () => {
  const s = measurement();
  expect(bounds([s]).height).toBeGreaterThanOrEqual(14);
  expect(hitTest(s,{x:20,y:12},0.1)).toBe(true);
  expect(hitTest(s,{x:0,y:6},0.1)).toBe(true);
  expect(hitTest(s,{x:20,y:0},0.1)).toBe(false);
  expect(stitchEdges(s)).toEqual([]);
});
test('transforms update world distance, signed offset and readable angle', () => {
  const s = transformShape(measurement(),{a:0,b:2,c:3,d:0,e:10,f:20});
  const g = measurementGeometry(s);
  expect(g.length).toBe(80);
  expect(g.offset).toBe(-36);
  expect(g.start).toEqual({x:46,y:20});
});
test('version 14 roundtrip preserves offsets and validates them', () => {
  const s = measurement();
  const roundtrip = (value: unknown) => parseProject(JSON.stringify({version:14,shapes:[value]}));
  expect(roundtrip(s).shapes[0]).toEqual(s);
  expect(() => roundtrip({...s,measurementOffset:null})).toThrow();
  expect(() => roundtrip({...s,measurementOffset:undefined})).toThrow();
  expect(() => roundtrip({...s,points:[s.points[0],s.points[0]]})).toThrow();
});

test('long dimensions fit closed arrowheads inside the endpoints', () => {
  const g = measurementGeometry(measurement());
  expect(g.outsideArrows).toBe(false);
  expect(g.arrowheads[0][0]).toEqual(g.start);
  expect(g.arrowheads[0][1].x).toBeGreaterThan(g.start.x);
  expect(g.arrowheads[1][0]).toEqual(g.end);
  expect(g.arrowheads[1][1].x).toBeLessThan(g.end.x);
});
test('short dimensions move arrows outside and lift the label clear of the strokes', () => {
  const s = {...measurement(), points:[{x:0,y:0},{x:5,y:0}]};
  const g = measurementGeometry(s);
  expect(g.outsideArrows).toBe(true);
  expect(g.arrowheads[0][1].x).toBeLessThan(g.start.x);
  expect(g.arrowheads[1][1].x).toBeGreaterThan(g.end.x);
  expect(g.middle.y).toBeLessThan(g.start.y - g.fontSize / 2);
  expect(bounds([s]).width).toBeGreaterThan(5);
  expect(hitTest(s,g.middle,0.1)).toBe(true);
  expect(hitTest(s,{x:-2,y:12},0.5)).toBe(true);
});
test('reversing short endpoints keeps the label above the readable dimension', () => {
  const s = {...measurement(), points:[{x:5,y:0},{x:0,y:0}]};
  const g = measurementGeometry(s);
  expect(g.middle.y).toBeLessThan(g.start.y);
  expect(g.angle).toBeCloseTo(2 * Math.PI);
});

test('inch labels and hit testing use the same presentation geometry', () => {
  const s = measurement();
  const g = measurementGeometry(s, 'in-fractional');
  expect(g.label).toBe('≈1 37/64 in');
  expect(hitTest(s, g.middle, 0.1, 'in-fractional')).toBe(true);
  expect(measurementGeometry(s).length).toBe(g.length);
});

test('crossing selection respects inch measurement label gaps', () => {
  const s = measurement();
  const box = {x: 9.99, y: 11.99, width: .02, height: .02};
  expect(intersectsBox(s, box)).toBe(true);
  expect(intersectsBox(s, box, .001, 'in-fractional')).toBe(false);
  for (const units of ['mm', 'in-fractional', 'in-decimal'] as const) {
    expect(boundary(s, units).lines).toEqual(measurementGeometry(s, units).lines);
  }
});
