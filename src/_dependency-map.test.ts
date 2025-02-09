/* --------------------------------------------------------------------------
  MIT License

  Copyright (c) 2024 Rami Pellumbi

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
-----------------------------------------------------------------------------*/

import { describe, expect, test } from "vitest";
import { DependencyMap } from "./_dependency-map";

describe("DependencyMap", () => {
    describe("add method", () => {
        test("creates new array for first dependency", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");

            expect(dependencyMap.get("task1")).toEqual(["dependency1"]);
        });

        test("appends to existing dependencies", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");
            dependencyMap.add("task1", "dependency2");

            expect(dependencyMap.get("task1")).toEqual(["dependency1", "dependency2"]);
        });

        test("handles multiple tasks independently", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");
            dependencyMap.add("task2", "dependency2");

            expect(dependencyMap.get("task1")).toEqual(["dependency1"]);
            expect(dependencyMap.get("task2")).toEqual(["dependency2"]);
        });
    });

    describe("get method", () => {
        test("returns empty array for non-existent key", () => {
            const dependencyMap = new DependencyMap();
            expect(dependencyMap.get("nonexistent")).toEqual([]);
        });

        test("returns correct dependencies for existing key", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");
            dependencyMap.add("task1", "dependency2");

            expect(dependencyMap.get("task1")).toEqual(["dependency1", "dependency2"]);
        });

        test("returns independent arrays for different calls", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");

            const result1 = dependencyMap.get("task1");
            const result2 = dependencyMap.get("task1");

            expect(result1).not.toBe(result2); // Should return different array instances
            expect(result1).toEqual(result2); // Arrays should have same content
        });
    });

    describe("immutability", () => {
        test("modifying returned array doesn't affect internal state", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");

            const dependencies = dependencyMap.get("task1");

            expect(() => {
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                (dependencyMap.get("task1") as any).push("newDependency");
            }).toThrow();
        });
    });
});
