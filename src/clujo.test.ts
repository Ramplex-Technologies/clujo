import assert from "node:assert/strict";
import test from "node:test";
import { Clujo } from "./clujo";
import { TaskGraph } from "./task-graph";

test("Clujo", async (t) => {
    await t.test("constructor validation", async (t) => {
        await t.test("throws when id is not provided", () => {
            assert.throws(
                () =>
                    new Clujo({
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        id: "" as any,
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        taskGraphRunner: {} as any,
                        cron: { pattern: "* * * * *" },
                    }),
                /Clujo ID is required/,
            );
        });

        await t.test("throws when taskGraphRunner is not provided", () => {
            assert.throws(
                () =>
                    new Clujo({
                        id: "test",
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        taskGraphRunner: null as any,
                        cron: { pattern: "* * * * *" },
                    }),
                /taskGraphRunner is required/,
            );
        });

        await t.test("throws when cron pattern is not provided", () => {
            assert.throws(
                () =>
                    new Clujo({
                        id: "test",
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        taskGraphRunner: {} as any,
                        cron: { pattern: "" },
                    }),
                /cron.pattern is required/,
            );
        });
    });

    await t.test("start method", async (t) => {
        await t.test("throws when already started", async () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            clujo.start();
            assert.throws(() => clujo.start(), /Cannot start a Clujo that has already started/);
            clujo.stop();
        });

        await t.test("throws with invalid redis configuration", () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            assert.throws(
                () =>
                    clujo.start({
                        redis: {
                            // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                            client: null as any,
                        },
                    }),
                /Redis client is required/,
            );
        });

        await t.test("throws with invalid onTaskCompletion", () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            assert.throws(
                () =>
                    clujo.start({
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        onTaskCompletion: "not a function" as any,
                    }),
                /onTaskCompletion must be a function/,
            );
        });

        await t.test("throws with invalid runImmediately", () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            assert.throws(
                () =>
                    clujo.start({
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        runImmediately: "not a boolean" as any,
                    }),
                /runImmediately must be a boolean/,
            );
        });
    });

    await t.test("stop method", async (t) => {
        await t.test("throws when not started", async () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            await assert.rejects(clujo.stop(), /Cannot stop a Clujo that has not started/);
        });

        await t.test("stops successfully", async () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            clujo.start();
            await assert.doesNotReject(clujo.stop());
        });
    });

    await t.test("trigger method", async (t) => {
        await t.test("executes task graph and returns context", async () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result1"),
                })
                .addTask({
                    id: "task2",
                    dependencies: ["task1"],
                    execute: ({ ctx }) => Promise.resolve(`${ctx.task1}-result2`),
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
            });

            const result = await clujo.trigger();
            assert.deepEqual(result, {
                initial: undefined,
                task1: "result1",
                task2: "result1-result2",
            });
        });
    });
});
