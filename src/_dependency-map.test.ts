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

import assert from "node:assert/strict";
import test from "node:test";
import { DependencyMap } from "./_dependency-map";

test("DependencyMap", async (t) => {
    await t.test("add method", async (t) => {
        await t.test("creates new array for first dependency", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");

            assert.deepEqual(dependencyMap.get("task1"), ["dependency1"]);
        });

        await t.test("appends to existing dependencies", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");
            dependencyMap.add("task1", "dependency2");

            assert.deepEqual(dependencyMap.get("task1"), ["dependency1", "dependency2"]);
        });

        await t.test("handles multiple tasks independently", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");
            dependencyMap.add("task2", "dependency2");

            assert.deepEqual(dependencyMap.get("task1"), ["dependency1"]);
            assert.deepEqual(dependencyMap.get("task2"), ["dependency2"]);
        });
    });

    await t.test("get method", async (t) => {
        await t.test("returns empty array for non-existent key", () => {
            const dependencyMap = new DependencyMap();
            assert.deepEqual(dependencyMap.get("nonexistent"), []);
        });

        await t.test("returns correct dependencies for existing key", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");
            dependencyMap.add("task1", "dependency2");

            assert.deepEqual(dependencyMap.get("task1"), ["dependency1", "dependency2"]);
        });

        await t.test("returns independent arrays for different calls", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");

            const result1 = dependencyMap.get("task1");
            const result2 = dependencyMap.get("task1");

            assert.notEqual(result1, result2, "Should return different array instances");
            assert.deepEqual(result1, result2, "Arrays should have same content");
        });
    });

    await t.test("immutability", async (t) => {
        await t.test("modifying returned array doesn't affect internal state", () => {
            const dependencyMap = new DependencyMap();
            dependencyMap.add("task1", "dependency1");

            const dependencies = dependencyMap.get("task1");

            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            assert.throws(() => (dependencyMap.get("task1") as any).push("newDependency"));
        });
    });
});
