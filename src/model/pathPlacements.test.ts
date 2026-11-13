import { expect, test } from 'vitest';
import { pathPlacements } from './pathPlacements';
import type { Shape } from './project';
const path = { kind: 'polyline', points: [{x:0,y:0},{x:20,y:0},{x:20,y:20}], closed:false, rotation:0 } as Shape;
test('count creates new placements including the open endpoint', () => {
  const copies = pathPlacements(path, 'count', 2, false);
  expect(copies).toHaveLength(2);
  expect(copies[1].e).toBeCloseTo(20);
  expect(copies[1].f).toBeCloseTo(20);
});
test('rotation follows the outgoing tangent', () => {
  const [copy] = pathPlacements(path, 'count', 1, true);
  expect(copy.a).toBeCloseTo(0);
  expect(copy.b).toBeCloseTo(1);
});
test('invalid and excessive distributions fail', () => {
  expect(() => pathPlacements(path, 'spacing', 0, true)).toThrow();
  expect(() => pathPlacements(path, 'count', 1001, true)).toThrow();
});
test('closed loops exclude the seam and reserve the original slot', () => {
  const loop = { ...path, closed: true, points: [{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}] };
  const copies = pathPlacements(loop, 'count', 3, false);
  expect(copies.map(m => [Math.round(m.e),Math.round(m.f)])).toEqual([[20,0],[20,20],[0,20]]);
  expect(pathPlacements(loop, 'spacing', 20, false)).toHaveLength(3);
});
test('fixed orientation transports the original world offset', () => {
  const [copy] = pathPlacements({...path, points:[{x:10,y:10},{x:10,y:30}]}, 'count', 1, false);
  expect(copy).toEqual({a:1,b:0,c:-0,d:1,e:0,f:20});
});

test('rectangle copies retain their centers when rotation is enabled', () => {
  const rectangle = { ...path, kind: 'rectangle', radius: 0, points: [{x:40,y:60},{x:140,y:140}] } as Shape;
  const pivot = {x:85,y:32};
  const fixed = pathPlacements(rectangle, 'count', 15, false, pivot);
  const rotated = pathPlacements(rectangle, 'count', 15, true, pivot);
  const at = (m: typeof fixed[number]) => ({x:m.a*pivot.x+m.c*pivot.y+m.e,y:m.b*pivot.x+m.d*pivot.y+m.f});
  rotated.forEach((m,i) => {
    expect(at(m).x).toBeCloseTo(at(fixed[i]).x, 10);
    expect(at(m).y).toBeCloseTo(at(fixed[i]).y, 10);
  });
  expect(rotated.some(m => m.b > 0.99)).toBe(true);
  expect(rotated.some(m => m.a < -0.99)).toBe(true);
  expect(rotated.some(m => m.b < -0.99)).toBe(true);
});
