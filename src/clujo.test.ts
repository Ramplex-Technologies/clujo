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

    await t.test("enabled flag", async (t) => {
        await t.test("is enabled by default", async () => {
            let executionCount = 0;
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: async () => {
                        executionCount++;
                        return "result";
                    },
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
                runOnStartup: true,
            });

            clujo.start();
            // Give time for runOnStartup to execute
            await new Promise((resolve) => setTimeout(resolve, 100));
            await clujo.stop();

            assert.equal(executionCount, 1, "Task should execute when enabled by default");
        });

        await t.test("respects disabled flag and logs message", async () => {
            let executionCount = 0;
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: async () => {
                        executionCount++;
                        return "result";
                    },
                })
                .build();

            const logs: string[] = [];
            const logger = {
                log: (message: string) => logs.push(message),
                error: (message: string) => logs.push(message),
            };

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
                enabled: false,
                runOnStartup: true,
                logger,
            });

            clujo.start();
            // Give time for runOnStartup to execute
            await new Promise((resolve) => setTimeout(resolve, 100));
            await clujo.stop();

            assert.equal(executionCount, 0, "Task should not execute when disabled");
            assert.equal(logs.length, 1, "Should log disabled message");
            assert.equal(
                logs[0],
                "Clujo test is disabled. Skipping execution of the tasks",
                "Should log correct disabled message",
            );
        });

        await t.test("validates enabled flag type", () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            assert.throws(
                () =>
                    new Clujo({
                        id: "test",
                        taskGraphRunner: taskGraph,
                        cron: { pattern: "* * * * *" },
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        enabled: "true" as any,
                    }),
                /enabled must be a boolean/,
            );
        });

        await t.test("trigger executes regardless of enabled flag", async () => {
            let executionCount = 0;
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: async () => {
                        executionCount++;
                        return "result";
                    },
                })
                .build();

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
                enabled: false,
            });

            await clujo.trigger();
            assert.equal(executionCount, 1, "Manual trigger should execute even when disabled");
        });

        await t.test("logs warning when attempting scheduled run while disabled", async () => {
            const taskGraph = new TaskGraph()
                .addTask({
                    id: "task1",
                    execute: () => Promise.resolve("result"),
                })
                .build();

            const logs: string[] = [];
            const logger = {
                log: (message: string) => logs.push(message),
                error: (message: string) => logs.push(message),
            };

            const clujo = new Clujo({
                id: "test",
                taskGraphRunner: taskGraph,
                cron: { pattern: "* * * * *" },
                enabled: false,
                runOnStartup: true,
                logger,
            });

            clujo.start();
            // Give time for runOnStartup to execute
            await new Promise((resolve) => setTimeout(resolve, 100));
            await clujo.stop();

            assert.equal(logs.length, 1, "Should log warning when attempting to run while disabled");
            assert.equal(
                logs[0],
                "Clujo test is disabled. Skipping execution of the tasks",
                "Should log correct disabled message",
            );
        });
    });
});
