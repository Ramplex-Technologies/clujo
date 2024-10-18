import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../src/context";

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
