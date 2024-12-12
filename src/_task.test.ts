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

import { strict as assert } from "node:assert";
import test from "node:test";
import { Task } from "./_task";

test("Task Class", async (t) => {
    await t.test("constructor initializes task correctly", () => {
        const task = new Task({
            id: "test-task",
            execute: async () => "result",
        });

        assert.equal(task.id, "test-task");
        assert.equal(task.status, "pending");
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

    await t.test("run skips disabled task", async () => {
        const task = new Task({
            id: "test-task",
            execute: async ({ deps, ctx }) => `${deps.value}-${ctx.initial}`,
            enabled: false,
        });

        const result = await task.run({ value: "dep" }, { initial: "ctx" });

        assert.equal(result, null);
        assert.equal(task.status, "skipped");
    });

    await t.test("run retries on failure according to retry policy", async () => {
        let attempts = 0;
        const task = new Task({
            id: "retry-task",
            execute: async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error("Failing");
                }
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

    await t.test("enabled flag behavior", async (t) => {
        await t.test("task is enabled by default", () => {
            const task = new Task({
                id: "test-task",
                execute: async () => "result",
            });

            assert.equal(task.isEnabled, true);
        });

        await t.test("task respects explicit enabled flag", () => {
            const enabledTask = new Task({
                id: "enabled-task",
                execute: async () => "result",
                enabled: true,
            });

            const disabledTask = new Task({
                id: "disabled-task",
                execute: async () => "result",
                enabled: false,
            });

            assert.equal(enabledTask.isEnabled, true);
            assert.equal(disabledTask.isEnabled, false);
        });

        await t.test("disabled task skips execution and returns null", async () => {
            let executionCount = 0;
            const task = new Task({
                id: "disabled-task",
                execute: async () => {
                    executionCount++;
                    return "result";
                },
                enabled: false,
            });

            const result = await task.run({}, { initial: null });

            assert.equal(result, null);
            assert.equal(executionCount, 0, "Execute function should not be called");
            assert.equal(task.status, "skipped");
        });

        await t.test("disabled task skips retries", async () => {
            let executionCount = 0;
            const task = new Task({
                id: "disabled-retry-task",
                execute: async () => {
                    executionCount++;
                    throw new Error("Should not be called");
                },
                enabled: false,
                retryPolicy: { maxRetries: 3, retryDelayMs: 10 },
            });

            const result = await task.run({}, { initial: null });

            assert.equal(result, null);
            assert.equal(executionCount, 0, "Execute function should not be called");
            assert.equal(task.status, "skipped");
        });

        await t.test("disabled task skips error handler", async () => {
            let errorHandlerCalled = false;
            const task = new Task({
                id: "disabled-error-handler-task",
                execute: async () => {
                    throw new Error("Should not be called");
                },
                errorHandler: () => {
                    errorHandlerCalled = true;
                },
                enabled: false,
            });

            const result = await task.run({}, { initial: null });

            assert.equal(result, null);
            assert.equal(errorHandlerCalled, false, "Error handler should not be called");
            assert.equal(task.status, "skipped");
        });

        await t.test("task status transitions correctly when disabled", async () => {
            const task = new Task({
                id: "status-test-task",
                execute: async () => "result",
                enabled: false,
            });

            assert.equal(task.status, "pending", "Initial status should be pending");

            await task.run({}, { initial: null });

            assert.equal(task.status, "skipped", "Final status should be skipped");
        });

        await t.test("enabled task with dependencies receives correct context", async () => {
            const task = new Task({
                id: "context-test-task",
                execute: async ({ ctx }) => {
                    assert.deepEqual(ctx, {
                        initial: "initial",
                        dep1: "value1",
                        dep2: "value2",
                    });
                    return "result";
                },
                dependencies: ["dep1", "dep2"],
                enabled: true,
            });

            const result = await task.run(
                {},
                {
                    initial: "initial",
                    dep1: "value1",
                    dep2: "value2",
                },
            );

            assert.equal(result, "result");
            assert.equal(task.status, "completed");
        });

        await t.test("disabled task in retry scenario", async () => {
            let attemptCount = 0;
            const task = new Task({
                id: "disabled-retry-scenario",
                execute: async () => {
                    attemptCount++;
                    if (attemptCount < 3) {
                        throw new Error("Failing");
                    }
                    return "success";
                },
                retryPolicy: { maxRetries: 2, retryDelayMs: 10 },
                enabled: false,
            });

            const result = await task.run({}, { initial: null });

            assert.equal(result, null);
            assert.equal(attemptCount, 0, "No attempts should be made");
            assert.equal(task.status, "skipped");
        });

        await t.test("disabled task with non-null initial context", async () => {
            const task = new Task({
                id: "disabled-context-task",
                execute: async () => "result",
                enabled: false,
            });

            const result = await task.run(
                {},
                {
                    initial: { value: "test" },
                },
            );

            assert.equal(result, null);
            assert.equal(task.status, "skipped");
        });
    });
});
