import { expect, test } from "vitest";
import { newer } from "./desktopVersion";
test.each([
  ['v1.0.0', '0.4.0-beta.1', true],
  ['v0.4.0', '0.4.0-beta.9', true],
  ['v0.4.0-beta.10', '0.4.0-beta.9', true],
  ['v0.4.0-beta.1', '0.4.0', false],
  ['v0.3.9', '0.4.0-beta.1', false],
  ['v0.4.0', '0.4.0', false],
])('release ordering %s versus %s', (a,b,result) => expect(newer(a,b)).toBe(result));
