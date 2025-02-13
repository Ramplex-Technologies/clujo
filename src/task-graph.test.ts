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
import type { TaskOptions } from "./_task";
import type { TaskError } from "./error";
import { TaskGraph, TaskGraphRunner } from "./task-graph";

describe("TaskGraph", () => {
    describe("constructor validates dependencies input", () => {
        test("throws when dependencies is null", () => {
            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            expect(() => new TaskGraph({ dependencies: null as any })).toThrow(
                /Dependencies must be a non-null object/,
            );
        });

        test("throws when dependencies is not an object", () => {
            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            expect(() => new TaskGraph({ dependencies: 42 as any })).toThrow(/Dependencies must be a non-null object/);

            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            expect(() => new TaskGraph({ dependencies: "string" as any })).toThrow(
                /Dependencies must be a non-null object/,
            );

            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            expect(() => new TaskGraph({ dependencies: true as any })).toThrow(
                /Dependencies must be a non-null object/,
            );
        });

        test("accepts valid dependencies object", () => {
            expect(
                () =>
                    new TaskGraph({
                        dependencies: { key: "value" },
                    }),
            ).not.toThrow();

            expect(
                () =>
                    new TaskGraph({
                        dependencies: Object.create(null),
                    }),
            ).not.toThrow();
        });
    });

    test("addTask with no context or dependencies", () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
        };
        const returnedBuilder = taskGraph.addTask(task);

        expect(returnedBuilder).toBe(taskGraph);
    });

    test("addTask with self dependency throws", () => {
        const taskGraph = new TaskGraph();
        const task: TaskOptions<"task1", Record<string, unknown>, { initial: unknown }, Promise<string>, "task1"> = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            dependencies: ["task1"],
        };

        // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
        expect(() => taskGraph.addTask(task as any)).toThrow(/Task task1 cannot depend on itself/);
    });

    test("validate retry policy throws when maxRetries is invalid", () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            retryPolicy: { maxRetries: -1, retryDelayMs: 100 },
        };

        expect(() => taskGraph.addTask(task)).toThrow(/maxRetries must be a non-negative integer/);
    });

    test("validate retry policy throws when retryDelayMs is invalid", () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            retryPolicy: { maxRetries: 1, retryDelayMs: -1 },
        };

        expect(() => taskGraph.addTask(task)).toThrow(/retryDelayMs must be a non-negative number/);
    });

    test("Adding dependency id that is not a string throws", () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            dependencies: [1],
        };

        // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
        expect(() => taskGraph.addTask(task as any)).toThrow(/Dependency ID must be a string/);
    });

    test("addTask with existing task id throws", () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
        };

        taskGraph.addTask(task);
        expect(() => taskGraph.addTask(task)).toThrow(/Task with id task1 already exists/);
    });

    test("addTask with dependency that does not exist throws", () => {
        const taskGraph = new TaskGraph();
        const task = {
            id: "task1",
            execute: () => Promise.resolve("result1"),
            dependencies: ["task2"],
        };

        // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
        expect(() => taskGraph.addTask(task as any)).toThrow(/Dependency task2 not found for task task1/);
    });

    test("addTask with dependencies", () => {
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

        expect(returnedBuilder).toBe(taskGraph);
    });

    test("build returns TaskGraphRunner", () => {
        const taskGraph = new TaskGraph();

        taskGraph.addTask({
            id: "task1",
            execute: () => Promise.resolve("result1"),
        });
        const runner = taskGraph.build();

        expect(typeof runner.trigger).toBe("function");
    });

    test("build throws error when no tasks added", () => {
        const taskGraph = new TaskGraph();
        expect(() => taskGraph.build()).toThrow(/No tasks added to the graph/);
    });
});

describe("TaskGraphRunner", () => {
    test("trigger executes tasks in correct order", async () => {
        // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
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

        expect(executionOrder).toEqual(["task1", "task2"]);
        expect(result).toEqual({
            initial: undefined,
            task1: "result1",
            task2: "result2",
        });
    });

    test("trigger skips tree of disabled tasks", async () => {
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

        expect(executionOrder).toEqual(["task1", "task2"]);
        expect(result).toEqual({
            initial: undefined,
            task1: "result1",
            task2: "result2",
        });
    });

    test("run handles task failures", async () => {
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

        expect(result).toEqual({
            initial: undefined,
            task2: "result2",
        });
    });
});

describe("TaskGraphRunner - Complex Scenarios", () => {
    test("no tasks throws", () => {
        const taskGraph = new TaskGraph();

        expect(() => taskGraph.build()).toThrow(/Unable to build TaskGraphRunner. No tasks added to the graph/);
    });

    test("triggering with empty topological order throws", async () => {
        const runner = new TaskGraphRunner({}, undefined, [], new Map(), new DependencyMap());

        await expect(runner.trigger()).rejects.toThrow(/No tasks to run. Did you forget to call topologicalSort?/);
    });

    test("triggering with no context value throws", async () => {
        const runner = new TaskGraphRunner(
            {},
            undefined,
            ["task1"],
            // biome-ignore lint/suspicious/noExplicitAny: invalid type must be cast
            new Map<any, any>([["task2", { id: "task1" }]]),
            new DependencyMap(),
        );

        await expect(runner.trigger()).rejects.toThrow(/Task task1 not found/);
    });

    test("mix of sync and async tasks with dependencies", async () => {
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
                    expect(ctx).toEqual({
                        initial: { initialValue: 10 },
                        syncTask1: 20,
                        asyncTask1: 25,
                        syncTask2: 60,
                        asyncTask2: 85,
                    });
                    expect(deps).toEqual({ multiplier: 2 });
                    expect(errors).toBeNull();
                },
            });

        const result = await runner.trigger();

        expect(executionOrder).toEqual(["syncTask1", "asyncTask1", "syncTask2", "asyncTask2"]);
        expect(result).toEqual({
            initial: { initialValue: 10 },
            syncTask1: 20,
            asyncTask1: 25,
            syncTask2: 60,
            asyncTask2: 85,
        });
    });

    test("handling errors in mixed sync/async graph", async () => {
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
                    expect(ctx).toEqual({
                        initial: undefined,
                        task1: "result1",
                        task3: "result3",
                    });
                    expect(deps).toEqual(Object.create(null));
                    expect(errors?.length).toBe(1);
                    expect(errors?.at(0)?.id).toBe("task2");
                },
            });
        const result = await runner.trigger();

        expect(result).toEqual({
            initial: undefined,
            task1: "result1",
            task3: "result3",
        });
        expect(result).not.toHaveProperty("task2");
        expect(result).not.toHaveProperty("task4");
    });

    test("concurrent execution of independent tasks", async () => {
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

        expect(result).toEqual({
            initial: 10,
            asyncTask1: "result1",
            asyncTask2: "result2",
        });

        expect(duration).toBeLessThan(130);
    });

    test("complex dependency chain with mixed sync/async tasks", async () => {
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

        expect(result).toEqual({
            initial: { initialValue: 10 },
            start: "start",
            async1: "async1",
            sync1: "sync1",
            async2: "async2",
            sync2: "sync2",
            finalTask: "final",
        });

        // Check execution order
        expect(executionOrder[0]).toBe("start");
        expect(executionOrder.indexOf("async1")).toBeGreaterThan(executionOrder.indexOf("start"));
        expect(executionOrder.indexOf("sync1")).toBeGreaterThan(executionOrder.indexOf("start"));
        expect(executionOrder.indexOf("async2")).toBeGreaterThan(executionOrder.indexOf("async1"));
        expect(executionOrder.indexOf("async2")).toBeGreaterThan(executionOrder.indexOf("sync1"));
        expect(executionOrder.indexOf("sync2")).toBeGreaterThan(executionOrder.indexOf("sync1"));
        expect(executionOrder[executionOrder.length - 1]).toBe("finalTask");
    });

    describe("enabled flag behavior", () => {
        test("tasks are enabled by default", async () => {
            const executionOrder: string[] = [];
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => {
                        executionOrder.push("task1");
                        return "result1";
                    },
                })
                .build();

            await taskGraph.trigger();
            expect(executionOrder).toEqual(["task1"]);
        });

        test("disabled task is skipped", async () => {
            const executionOrder: string[] = [];
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    enabled: false,
                    execute: () => {
                        executionOrder.push("task1");
                        return "result1";
                    },
                })
                .build();

            const result = await taskGraph.trigger();
            expect(executionOrder).toEqual([]);
            expect(result).toEqual({ initial: undefined });
        });

        test("disabled task prevents dependent tasks from running", async () => {
            const executionOrder: string[] = [];
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    enabled: false,
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
                .build();

            const result = await taskGraph.trigger();
            expect(executionOrder).toEqual([]);
            expect(result).toEqual({ initial: undefined });
        });

        test("disabled task in middle of chain prevents downstream tasks", async () => {
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
                    enabled: false,
                    execute: () => {
                        executionOrder.push("task2");
                        return "result2";
                    },
                })
                .addTask({
                    id: "task3",
                    dependencies: ["task2"],
                    execute: () => {
                        executionOrder.push("task3");
                        return "result3";
                    },
                })
                .build();

            const result = await taskGraph.trigger();
            expect(executionOrder).toEqual(["task1"]);
            expect(result).toEqual({
                initial: undefined,
                task1: "result1",
            });
        });

        test("disabled task only affects its dependency chain", async () => {
            const executionOrder: string[] = [];
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "start",
                    execute: () => {
                        executionOrder.push("start");
                        return "start";
                    },
                })
                .addTask({
                    id: "branch1Task",
                    dependencies: ["start"],
                    enabled: false,
                    execute: () => {
                        executionOrder.push("branch1Task");
                        return "branch1";
                    },
                })
                .addTask({
                    id: "branch1Dependent",
                    dependencies: ["branch1Task"],
                    execute: () => {
                        executionOrder.push("branch1Dependent");
                        return "branch1Dependent";
                    },
                })
                .addTask({
                    id: "branch2Task",
                    dependencies: ["start"],
                    execute: () => {
                        executionOrder.push("branch2Task");
                        return "branch2";
                    },
                })
                .addTask({
                    id: "branch2Dependent",
                    dependencies: ["branch2Task"],
                    execute: () => {
                        executionOrder.push("branch2Dependent");
                        return "branch2Dependent";
                    },
                })
                .build();

            const result = await taskGraph.trigger();
            expect(executionOrder).toEqual(["start", "branch2Task", "branch2Dependent"]);
            expect(result).toEqual({
                initial: undefined,
                start: "start",
                branch2Task: "branch2",
                branch2Dependent: "branch2Dependent",
            });
        });

        test("multiple disabled tasks in different chains", async () => {
            const executionOrder: string[] = [];
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "root",
                    execute: () => {
                        executionOrder.push("root");
                        return "root";
                    },
                })
                .addTask({
                    id: "chain1-1",
                    dependencies: ["root"],
                    enabled: false,
                    execute: () => {
                        executionOrder.push("chain1-1");
                        return "chain1-1";
                    },
                })
                .addTask({
                    id: "chain1-2",
                    dependencies: ["chain1-1"],
                    execute: () => {
                        executionOrder.push("chain1-2");
                        return "chain1-2";
                    },
                })
                .addTask({
                    id: "chain2-1",
                    dependencies: ["root"],
                    execute: () => {
                        executionOrder.push("chain2-1");
                        return "chain2-1";
                    },
                })
                .addTask({
                    id: "chain2-2",
                    dependencies: ["chain2-1"],
                    enabled: false,
                    execute: () => {
                        executionOrder.push("chain2-2");
                        return "chain2-2";
                    },
                })
                .addTask({
                    id: "chain2-3",
                    dependencies: ["chain2-2"],
                    execute: () => {
                        executionOrder.push("chain2-3");
                        return "chain2-3";
                    },
                })
                .build();

            const result = await taskGraph.trigger();
            expect(executionOrder).toEqual(["root", "chain2-1"]);
            expect(result).toEqual({
                initial: undefined,
                root: "root",
                "chain2-1": "chain2-1",
            });
        });

        test("disabled task with error handling", async () => {
            const executionOrder: string[] = [];
            let errors: unknown[] = [];

            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => {
                        executionOrder.push("task1");
                        throw new Error("Task 1 failed");
                    },
                })
                .addTask({
                    id: "task2",
                    enabled: false,
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
                })
                .build({
                    onTasksCompleted: (_, __, taskErrors) => {
                        if (taskErrors) {
                            errors = [...taskErrors];
                        }
                    },
                });

            const result = await taskGraph.trigger();
            expect(executionOrder).toEqual(["task1", "task3"]);
            expect(result).toEqual({
                initial: undefined,
                task3: "result3",
            });
            expect(errors).toHaveLength(1);
            expect((errors[0] as TaskError).id).toBe("task1");
        });
    });
});
