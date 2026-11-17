import {test,expect} from "vitest";
import {objectSelection} from "./objectSelection";
test("plain clicks replace selection and Shift clicks add or remove only the clicked object",()=>{
  expect(objectSelection(["a","b"],"a")).toEqual(["a"]);
  expect(objectSelection(["a"],"b",true)).toEqual(["a","b"]);
  expect(objectSelection(["a","b"],"a",true)).toEqual(["b"]);
  expect(objectSelection(["a"],undefined)).toEqual([]);
  expect(objectSelection(["a"],undefined,true)).toEqual(["a"]);
});
