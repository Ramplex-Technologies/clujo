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
import type { TaskOptions } from "./task";
import { TaskGraph, TaskGraphRunner } from "./task-graph";
import { DependencyMap } from "./_dependency-map";

test("TaskGraph", async (t) => {
    await t.test("constructor validates dependencies input", async (t) => {
        await t.test("throws when dependencies is null", () => {
            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            assert.throws(() => new TaskGraph({ dependencies: null as any }), /Dependencies must be a non-null object/);
        });

        await t.test("throws when dependencies is not an object", () => {
            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            assert.throws(() => new TaskGraph({ dependencies: 42 as any }), /Dependencies must be a non-null object/);

            assert.throws(
                // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
                () => new TaskGraph({ dependencies: "string" as any }),
                /Dependencies must be a non-null object/,
            );

            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            assert.throws(() => new TaskGraph({ dependencies: true as any }), /Dependencies must be a non-null object/);
        });

        await t.test("accepts valid dependencies object", () => {
            assert.doesNotThrow(
                () =>
                    new TaskGraph({
                        dependencies: { key: "value" },
                    }),
            );

            assert.doesNotThrow(
                () =>
                    new TaskGraph({
                        dependencies: Object.create(null),
                    }),
            );
        });
    });

    await t.test("addTask with no context or dependencies", async () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
        };
        const returnedBuilder = taskGraph.addTask(task);

        assert.equal(returnedBuilder, taskGraph);
    });

    await t.test("addTask with self dependency throws", async () => {
        const taskGraph = new TaskGraph();
        const task: TaskOptions<"task1", Record<string, unknown>, { initial: unknown }, Promise<string>, "task1"> = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            dependencies: ["task1"],
        };

        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        assert.throws(() => taskGraph.addTask(task as any), /Task task1 cannot depend on itself/);
    });

    await t.test("validate retry policy throws when maxRetries is invalid", async () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            retryPolicy: { maxRetries: -1, retryDelayMs: 100 },
        };

        assert.throws(() => taskGraph.addTask(task), /maxRetries must be a non-negative integer/);
    });

    await t.test("validate retry policy throws when retryDelayMs is invalid", async () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            retryPolicy: { maxRetries: 1, retryDelayMs: -1 },
        };

        assert.throws(() => taskGraph.addTask(task), /retryDelayMs must be a non-negative number/);
    });

    await t.test("Adding dependency id that is not a string throws", async () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            dependencies: [1],
        };

        // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
        assert.throws(() => taskGraph.addTask(task as any), /Dependency ID must be a string/);
    });

    await t.test("addTask with existing task id throws", async () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
        };

        taskGraph.addTask(task);

        assert.throws(() => taskGraph.addTask(task), /Task with id task1 already exists/);
    });

    await t.test("addTask with dependency that does not exist throws", async () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            dependencies: ["task2"],
        };

        // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
        assert.throws(() => taskGraph.addTask(task as any), /Dependency task2 not found for task task1/);
    });

    await t.test("addTask with dependencies", (t) => {
        const taskGraph = new TaskGraph();

        const returnedBuilder = taskGraph
            .addTask({
                id: "task1",
                execute: () => Promise.resolve("result1"),
            })
            .addTask({
                id: "task2",
                dependencies: ["task1"],
                execute: () => Promise.resolve("result2"),
            });

        assert.equal(returnedBuilder, taskGraph);
    });

    await t.test("build returns TaskGraphRunner", () => {
        const taskGraph = new TaskGraph();

        taskGraph.addTask({
            id: "task1",
            execute: () => Promise.resolve("result1"),
        });
        const runner = taskGraph.build();

        assert.ok(typeof runner.trigger === "function");
    });

    await t.test("build throws error when no tasks added", () => {
        const taskGraph = new TaskGraph();

        assert.throws(() => taskGraph.build(), /No tasks added to the graph/);
    });
});

test("TaskGraphRunner", async (t) => {
    await t.test("trigger executes tasks in correct order", async () => {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        let taskGraph: any = new TaskGraph();
        const executionOrder: string[] = [];

        taskGraph = taskGraph.addTask({
            id: "task1",
            execute: () => {
                executionOrder.push("task1");
                return "result1";
            },
        });
        taskGraph = taskGraph.addTask({
            id: "task2",
            dependencies: ["task1"],
            execute: () => {
                executionOrder.push("task2");
                return "result2";
            },
        });

        const runner = taskGraph.build();
        const result = await runner.trigger();

        assert.deepEqual(executionOrder, ["task1", "task2"]);
        assert.deepEqual(result, {
            initial: undefined,
            task1: "result1",
            task2: "result2",
        });
    });

    await t.test("trigger skips tree of disabled tasks", async () => {
        const executionOrder: string[] = [];
        const taskGraph = new TaskGraph()
            .addTask({
                id: "task1",
                execute: () => {
                    executionOrder.push("task1");
                    return "result1";
                },
            })
            .addTask({
                id: "task2",
                dependencies: ["task1"],
                execute: () => {
                    executionOrder.push("task2");
                    return "result2";
                },
            })
            .addTask({
                id: "task3",
                execute: () => {
                    executionOrder.push("task3");
                    return "result3";
                },
                enabled: false,
            })
            .addTask({
                id: "task4",
                dependencies: ["task1", "task3"],
                execute: () => {
                    executionOrder.push("task4");
                    return "result4";
                },
            });

        const runner = taskGraph.build();
        const result = await runner.trigger();

        assert.deepEqual(executionOrder, ["task1", "task2"]);
        assert.deepEqual(result, {
            initial: undefined,
            task1: "result1",
            task2: "result2",
        });
    });

    await t.test("run handles task failures", async () => {
        const taskGraph = new TaskGraph();

        taskGraph.addTask({
            id: "task1",
            execute: () => Promise.reject(new Error("Task 1 failed")),
        });
        taskGraph.addTask({
            id: "task2",
            execute: () => Promise.resolve("result2"),
        });

        const runner = taskGraph.build();
        const result = await runner.trigger();

        assert.deepEqual(result, {
            initial: undefined,
            task2: "result2",
        });
    });
});

test("TaskGraphRunner - Complex Scenarios", async (t) => {
    await t.test("no tasks throws", async () => {
        const taskGraph = new TaskGraph();

        assert.throws(() => taskGraph.build(), /Unable to build TaskGraphRunner. No tasks added to the graph/);
    });

    await t.test("triggering with empty topological order throws", async () => {
        const runner = new TaskGraphRunner({}, undefined, [], new Map(), new DependencyMap());

        await assert.rejects(runner.trigger(), /No tasks to run. Did you forget to call topologicalSort?/);
    });

    await t.test("triggering with no context value throws", async () => {
        const runner = new TaskGraphRunner(
            {},
            undefined,
            ["task1"],
            // biome-ignore lint/suspicious/noExplicitAny: faking input
            new Map<any, any>([["task2", { id: "task1" }]]),
            new DependencyMap(),
        );

        await assert.rejects(runner.trigger(), /Task task1 not found/);
    });

    await t.test("mix of sync and async tasks with dependencies", async (t) => {
        const executionOrder: string[] = [];
        const runner = new TaskGraph({
            contextValue: { initialValue: 10 },
            dependencies: { multiplier: 2 },
        })
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
                    if (!ctx.syncTask1) {
                        throw new Error("syncTask1 not found in context");
                    }
                    executionOrder.push("asyncTask1");
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    return ctx.syncTask1 + 5;
                },
            })
            .addTask({
                id: "syncTask2",
                dependencies: ["syncTask1"],
                execute: ({ ctx }) => {
                    if (!ctx.syncTask1) {
                        throw new Error("syncTask1 not found in context");
                    }
                    executionOrder.push("syncTask2");
                    return ctx.syncTask1 * 3;
                },
            })
            .addTask({
                id: "asyncTask2",
                dependencies: ["asyncTask1", "syncTask2"],
                execute: async ({ ctx }) => {
                    if (!ctx.asyncTask1 || !ctx.syncTask2) {
                        throw new Error("asyncTask1 or syncTask2 not found in context");
                    }
                    executionOrder.push("asyncTask2");
                    await new Promise((resolve) => setTimeout(resolve, 30));
                    return ctx.asyncTask1 + ctx.syncTask2;
                },
            })
            .build({
                onTasksCompleted: (ctx, deps, errors) => {
                    assert.deepEqual(ctx, {
                        initial: { initialValue: 10 },
                        syncTask1: 20,
                        asyncTask1: 25,
                        syncTask2: 60,
                        asyncTask2: 85,
                    });
                    assert.deepEqual(deps, { multiplier: 2 });
                    assert.deepEqual(errors, null);
                },
            });

        const result = await runner.trigger();

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
            .build({
                onTasksCompleted: (ctx, deps, errors) => {
                    assert.deepEqual(ctx, {
                        initial: undefined,
                        task1: "result1",
                        task3: "result3",
                    });
                    assert.deepEqual(deps, Object.create(null));
                    assert.equal(errors?.length, 1);
                    assert.equal(errors?.at(0)?.id, "task2");
                },
            });
        const result = await runner.trigger();

        assert.deepEqual(result, {
            initial: undefined,
            task1: "result1",
            task3: "result3",
        });
        assert.ok(!("task2" in result));
        assert.ok(!("task4" in result));
    });

    await t.test("concurrent execution of independent tasks", async () => {
        const taskGraph = new TaskGraph({
            contextValue: 10,
        });
        const startTime = Date.now();

        taskGraph.addTask({
            id: "asyncTask1",
            execute: async () => {
                await new Promise((resolve) => setTimeout(resolve, 100));
                return "result1";
            },
        });

        taskGraph.addTask({
            id: "asyncTask2",
            execute: async () => {
                await new Promise((resolve) => setTimeout(resolve, 100));
                return "result2";
            },
        });

        const runner = taskGraph.build();
        const result = await runner.trigger();

        const duration = Date.now() - startTime;

        assert.deepEqual(result, {
            initial: 10,
            asyncTask1: "result1",
            asyncTask2: "result2",
        });

        // Ensure tasks ran concurrently (with some tolerance for test environment variations)
        assert.ok(duration < 130, `Expected duration < 130ms, but was ${duration}ms`);
    });

    await t.test("complex dependency chain with mixed sync/async tasks", async () => {
        const executionOrder: string[] = [];
        const runner = new TaskGraph({
            contextValue: {
                initialValue: 10,
            },
        })
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

        const result = await runner.trigger();

        assert.deepEqual(result, {
            initial: { initialValue: 10 },
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
