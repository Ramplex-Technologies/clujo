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
});
