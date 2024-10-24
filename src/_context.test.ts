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
import { Context } from "../src/_context";

test("Context", async (t) => {
  await t.test("constructor with no initial value", () => {
    const context = new Context();
    assert.deepEqual(context.value, { initial: undefined });
  });

  await t.test("constructor with initial value", () => {
    const initialValue = { foo: "bar" };
    const context = new Context(initialValue);
    assert.deepEqual(context.value, { initial: initialValue });
  });

  await t.test("reset with undefined", () => {
    const context = new Context({ foo: "bar" });
    context.reset(undefined);
    assert.deepEqual(context.value, { initial: undefined });
  });

  await t.test("reset with new value", () => {
    const context = new Context({ foo: "bar" });
    const newValue = { baz: "qux" };
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (context as any).reset(newValue);
    assert.deepEqual(context.value, { initial: newValue });
  });

  await t.test("update with new values", async () => {
    const context = new Context<{ foo: string }, { bar?: string }>({ foo: "initial" });
    await context.update({ bar: "updated" });
    assert.deepEqual(context.value, { initial: { foo: "initial" }, bar: "updated" });
  });

  await t.test("multiple updates in sequence", async () => {
    const context = new Context<{ foo: string }, { bar?: string; baz?: string }>({ foo: "initial" });
    await context.update({ bar: "first" });
    await context.update({ baz: "second" });
    assert.deepEqual(context.value, { initial: { foo: "initial" }, bar: "first", baz: "second" });
  });

  await t.test("concurrent updates", async () => {
    const context = new Context<{ foo: string }, { count: number }>({ foo: "initial" });
    const updates = Array(100)
      .fill(null)
      .map((_, i) => context.update({ count: i }));
    await Promise.all(updates);
    assert.equal(context.value.count, 99);
  });

  await t.test("update does not override initial value", async () => {
    const context = new Context<{ foo: string }, { bar: string }>({ foo: "initial" });
    await context.update({ bar: "updated" });
    assert.deepEqual(context.value, { initial: { foo: "initial" }, bar: "updated" });
  });

  await t.test("update with empty object", async () => {
    const context = new Context<{ foo: string }, unknown>({ foo: "initial" });
    await context.update({});
    assert.deepEqual(context.value, { initial: { foo: "initial" } });
  });

  await t.test("update after reset", async () => {
    const context = new Context<{ foo: string }, { bar: string }>({ foo: "initial" });
    await context.update({ bar: "first" });
    context.reset({ foo: "new initial" });
    await context.update({ bar: "second" });
    assert.deepEqual(context.value, { initial: { foo: "new initial" }, bar: "second" });
  });
});
