import { strict as assert } from "node:assert";
import test from "node:test";
import { Task } from "../src/task";

test("Task Class", async (t) => {
  await t.test("constructor initializes task correctly", () => {
    const task = new Task({
      id: "test-task",
      execute: async () => "result",
    });

    assert.equal(task.id, "test-task");
    assert.equal(task.status, "pending");
    assert.deepEqual(task.dependencies, []);
  });

  await t.test("addDependency adds dependency correctly", () => {
    const task = new Task({
      id: "test-task",
      execute: async () => "result",
    });

    task.addDependency("dependency-1");
    task.addDependency("dependency-2");

    assert.deepEqual(task.dependencies, ["dependency-1", "dependency-2"]);
  });

  await t.test("addDependency throws error when adding self as dependency", () => {
    const task = new Task({
      id: "test-task",
      execute: async () => "result",
    });

    assert.throws(() => task.addDependency("test-task"), {
      message: "A task cannot depend on itself",
    });
  });

  await t.test("run executes task successfully", async () => {
    const task = new Task({
      id: "test-task",
      execute: async ({ deps, ctx }) => `${deps.value}-${ctx.initial}`,
    });

    const result = await task.run({ value: "dep" }, { initial: "ctx" });

    assert.equal(result, "dep-ctx");
    assert.equal(task.status, "completed");
  });

  await t.test("run retries on failure according to retry policy", async () => {
    let attempts = 0;
    const task = new Task({
      id: "retry-task",
      execute: async () => {
        attempts++;
        if (attempts < 3) throw new Error("Failing");
        return "success";
      },
      retryPolicy: { maxRetries: 2, retryDelayMs: 10 },
    });

    const result = await task.run({}, { initial: null });

    assert.equal(result, "success");
    assert.equal(attempts, 3);
    assert.equal(task.status, "completed");
  });

  await t.test("run fails after exhausting retries", async () => {
    const task = new Task({
      id: "failing-task",
      execute: async () => {
        throw new Error("Always failing");
      },
      retryPolicy: { maxRetries: 2, retryDelayMs: 10 },
    });

    await assert.rejects(async () => await task.run({}, { initial: null }), { message: "Always failing" });

    assert.equal(task.status, "failed");
  });

  await t.test("errorHandler is called on failure", async () => {
    let errorHandlerCalled = false;
    const task = new Task({
      id: "error-handler-task",
      execute: async () => {
        throw new Error("Task error");
      },
      errorHandler: async (err) => {
        assert.equal(err.message, "Task error");
        errorHandlerCalled = true;
      },
    });

    await assert.rejects(async () => await task.run({}, { initial: null }), { message: "Task error" });

    assert.equal(errorHandlerCalled, true);
    assert.equal(task.status, "failed");
  });

  await t.test("constructor validates retry policy", () => {
    assert.throws(
      () =>
        new Task({
          id: "invalid-retry-policy",
          execute: async () => {},
          retryPolicy: { maxRetries: -1, retryDelayMs: 100 },
        }),
      { message: "maxRetries must be a non-negative integer" },
    );

    assert.throws(
      () =>
        new Task({
          id: "invalid-retry-policy",
          execute: async () => {},
          retryPolicy: { maxRetries: 2, retryDelayMs: -100 },
        }),
      { message: "retryDelayMs must be a non-negative number" },
    );
  });
});
