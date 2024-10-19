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
import { TaskGraph } from "../src/task-graph";

test("TaskGraph", async (t) => {
  await t.test("setContext with value", () => {
    const taskGraph = new TaskGraph();

    const initialContext = { foo: "bar" };
    const result = taskGraph.setContext(initialContext);

    assert.equal(result, taskGraph);
  });

  await t.test("setContext with factory function", () => {
    const taskGraph = new TaskGraph();

    const contextFactory = () => ({ foo: "bar" });
    const result = taskGraph.setContext(contextFactory);

    assert.equal(result, taskGraph);
  });

  await t.test("setDependencies", () => {
    const taskGraph = new TaskGraph();

    const dependencies = { dep1: "value1", dep2: "value2" };
    const result = taskGraph.setDependencies(dependencies);

    assert.equal(result, taskGraph);
  });

  await t.test("finalize returns TaskGraphBuilder", () => {
    const taskGraph = new TaskGraph();

    const builder = taskGraph.finalize();

    assert.ok(typeof builder.addTask === "function");
    assert.ok(typeof builder.build === "function");
  });
});

test("TaskGraphBuilder", async (t) => {
  await t.test("addTask with no context or dependencies", async () => {
    const builder = new TaskGraph().finalize();
    const task = {
      id: "task1",
      execute: () => Promise.resolve("result1"),
    };
    const returnedBuilder = builder.addTask(task);

    assert.equal(returnedBuilder, builder);
  });

  await t.test("addTask with dependencies", (t) => {
    const builder = new TaskGraph().finalize();

    const returnedBuilder = builder
      .addTask({
        id: "task1",
        execute: () => Promise.resolve("result1"),
      })
      .addTask({
        id: "task2",
        dependencies: ["task1"],
        execute: () => Promise.resolve("result2"),
      });

    assert.equal(returnedBuilder, builder);
  });

  await t.test("build returns TaskGraphRunner", () => {
    const builder = new TaskGraph().finalize();

    builder.addTask({
      id: "task1",
      execute: () => Promise.resolve("result1"),
    });
    const runner = builder.build();

    assert.ok(typeof runner.run === "function");
  });

  await t.test("build throws error when no tasks added", () => {
    const builder = new TaskGraph().finalize();

    assert.throws(() => builder.build(), /No tasks added to the graph/);
  });
});

test("TaskGraphRunner", async (t) => {
  await t.test("run executes tasks in correct order", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let builder: any = new TaskGraph().finalize();
    const executionOrder: string[] = [];

    builder = builder.addTask({
      id: "task1",
      execute: () => {
        executionOrder.push("task1");
        return "result1";
      },
    });
    builder = builder.addTask({
      id: "task2",
      dependencies: ["task1"],
      execute: () => {
        executionOrder.push("task2");
        return "result2";
      },
    });

    const runner = builder.build();
    const result = await runner.run();

    assert.deepEqual(executionOrder, ["task1", "task2"]);
    assert.deepEqual(result, {
      initial: undefined,
      task1: "result1",
      task2: "result2",
    });
  });

  await t.test("run handles task failures", async () => {
    const builder = new TaskGraph().finalize();

    builder.addTask({
      id: "task1",
      execute: () => Promise.reject(new Error("Task 1 failed")),
    });
    builder.addTask({
      id: "task2",
      execute: () => Promise.resolve("result2"),
    });

    const runner = builder.build();
    const result = await runner.run();

    assert.deepEqual(result, {
      initial: undefined,
      task2: "result2",
    });
  });
});

test("TaskGraphRunner - Complex Scenarios", async (t) => {
  await t.test("mix of sync and async tasks with dependencies", async (t) => {
    const executionOrder: string[] = [];
    const runner = new TaskGraph()
      .setContext({ initialValue: 10 })
      .setDependencies({ multiplier: 2 })
      .finalize()
      .addTask({
        id: "syncTask1",
        execute: ({ ctx, deps }) => {
          executionOrder.push("syncTask1");
          return ctx.initial.initialValue * deps.multiplier;
        },
      })
      .addTask({
        id: "asyncTask1",
        dependencies: ["syncTask1"],
        execute: async ({ ctx }) => {
          if (!ctx.syncTask1) throw new Error("syncTask1 not found in context");
          executionOrder.push("asyncTask1");
          await new Promise((resolve) => setTimeout(resolve, 50));
          return ctx.syncTask1 + 5;
        },
      })
      .addTask({
        id: "syncTask2",
        dependencies: ["syncTask1"],
        execute: ({ ctx }) => {
          if (!ctx.syncTask1) throw new Error("syncTask1 not found in context");
          executionOrder.push("syncTask2");
          return ctx.syncTask1 * 3;
        },
      })
      .addTask({
        id: "asyncTask2",
        dependencies: ["asyncTask1", "syncTask2"],
        execute: async ({ ctx }) => {
          if (!ctx.asyncTask1 || !ctx.syncTask2) throw new Error("asyncTask1 or syncTask2 not found in context");
          executionOrder.push("asyncTask2");
          await new Promise((resolve) => setTimeout(resolve, 30));
          return ctx.asyncTask1 + ctx.syncTask2;
        },
      })
      .build();

    const result = await runner.run();

    assert.deepEqual(executionOrder, ["syncTask1", "asyncTask1", "syncTask2", "asyncTask2"]);
    assert.deepEqual(result, {
      initial: { initialValue: 10 },
      syncTask1: 20,
      asyncTask1: 25,
      syncTask2: 60,
      asyncTask2: 85,
    });
  });

  await t.test("handling errors in mixed sync/async graph", async () => {
    const runner = new TaskGraph()
      .finalize()
      .addTask({
        id: "task1",
        execute: () => "result1",
      })
      .addTask({
        id: "task2",
        dependencies: ["task1"],
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error("Task 2 failed");
        },
      })
      .addTask({
        id: "task3",
        dependencies: ["task1"],
        execute: () => "result3",
      })
      .addTask({
        id: "task4",
        dependencies: ["task2", "task3"],
        execute: ({ ctx }) => `${ctx.task2} - ${ctx.task3}`,
      })
      .build();
    const result = await runner.run();

    assert.deepEqual(result, {
      initial: undefined,
      task1: "result1",
      task3: "result3",
    });
    assert.ok(!("task2" in result));
    assert.ok(!("task4" in result));
  });

  await t.test("concurrent execution of independent tasks", async () => {
    const builder = new TaskGraph().finalize();
    const startTime = Date.now();

    builder.addTask({
      id: "asyncTask1",
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "result1";
      },
    });

    builder.addTask({
      id: "asyncTask2",
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "result2";
      },
    });

    const runner = builder.build();
    const result = await runner.run();

    const duration = Date.now() - startTime;

    assert.deepEqual(result, {
      initial: undefined,
      asyncTask1: "result1",
      asyncTask2: "result2",
    });

    // Ensure tasks ran concurrently (with some tolerance for test environment variations)
    assert.ok(duration < 130, `Expected duration < 130ms, but was ${duration}ms`);
  });

  await t.test("complex dependency chain with mixed sync/async tasks", async () => {
    const executionOrder: string[] = [];
    const runner = new TaskGraph()
      .finalize()
      .addTask({
        id: "start",
        execute: () => {
          executionOrder.push("start");
          return "start";
        },
      })
      .addTask({
        id: "async1",
        dependencies: ["start"],
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          executionOrder.push("async1");
          return "async1";
        },
      })
      .addTask({
        id: "sync1",
        dependencies: ["start"],
        execute: () => {
          executionOrder.push("sync1");
          return "sync1";
        },
      })
      .addTask({
        id: "async2",
        dependencies: ["async1", "sync1"],
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          executionOrder.push("async2");
          return "async2";
        },
      })
      .addTask({
        id: "sync2",
        dependencies: ["sync1"],
        execute: () => {
          executionOrder.push("sync2");
          return "sync2";
        },
      })
      .addTask({
        id: "finalTask",
        dependencies: ["async2", "sync2"],
        execute: () => {
          executionOrder.push("finalTask");
          return "final";
        },
      })
      .build();

    const result = await runner.run();

    assert.deepEqual(result, {
      initial: undefined,
      start: "start",
      async1: "async1",
      sync1: "sync1",
      async2: "async2",
      sync2: "sync2",
      finalTask: "final",
    });

    // Check execution order
    assert.equal(executionOrder[0], "start");
    assert.ok(executionOrder.indexOf("async1") > executionOrder.indexOf("start"));
    assert.ok(executionOrder.indexOf("sync1") > executionOrder.indexOf("start"));
    assert.ok(executionOrder.indexOf("async2") > executionOrder.indexOf("async1"));
    assert.ok(executionOrder.indexOf("async2") > executionOrder.indexOf("sync1"));
    assert.ok(executionOrder.indexOf("sync2") > executionOrder.indexOf("sync1"));
    assert.equal(executionOrder[executionOrder.length - 1], "finalTask");
  });
});
