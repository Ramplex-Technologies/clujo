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
import { Task } from "./_task";

describe("Task Class", () => {
    test("constructor initializes task correctly", () => {
        const task = new Task({
            id: "test-task",
            execute: async () => "result",
        });

        expect(task.id).toBe("test-task");
        expect(task.status).toBe("pending");
    });

    test("run executes task successfully", async () => {
        const task = new Task({
            id: "test-task",
            execute: async (ctx) => `${ctx.initial}`,
        });

        const result = await task.run({ initial: "ctx" });

        expect(result).toBe("ctx");
        expect(task.status).toBe("completed");
    });

    test("run skips disabled task", async () => {
        const task = new Task({
            id: "test-task",
            execute: async (ctx) => `${ctx.initial}`,
            enabled: false,
        });

        const result = await task.run({ initial: "ctx" });

        expect(result).toBeNull();
        expect(task.status).toBe("skipped");
    });

    test("run retries on failure according to retry policy", async () => {
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

        const result = await task.run({ initial: null });

        expect(result).toBe("success");
        expect(attempts).toBe(3);
        expect(task.status).toBe("completed");
    });

    test("run fails after exhausting retries", async () => {
        const task = new Task({
            id: "failing-task",
            execute: async () => {
                throw new Error("Always failing");
            },
            retryPolicy: { maxRetries: 2, retryDelayMs: 10 },
        });

        await expect(task.run({ initial: null })).rejects.toThrow("Always failing");

        expect(task.status).toBe("failed");
    });

    test("errorHandler is called on failure", async () => {
        let errorHandlerCalled = false;
        const task = new Task({
            id: "error-handler-task",
            execute: async () => {
                throw new Error("Task error");
            },
            errorHandler: async (err) => {
                expect(err.message).toBe("Task error");
                errorHandlerCalled = true;
            },
        });

        await expect(task.run({ initial: null })).rejects.toThrow("Task error");

        expect(errorHandlerCalled).toBe(true);
        expect(task.status).toBe("failed");
    });

    test("constructor validates retry policy", () => {
        expect(
            () =>
                new Task({
                    id: "invalid-retry-policy",
                    execute: async () => {},
                    retryPolicy: { maxRetries: -1, retryDelayMs: 100 },
                }),
        ).toThrow("maxRetries must be a non-negative integer");

        expect(
            () =>
                new Task({
                    id: "invalid-retry-policy",
                    execute: async () => {},
                    retryPolicy: { maxRetries: 2, retryDelayMs: -100 },
                }),
        ).toThrow("retryDelayMs must be a non-negative number");
    });

    describe("enabled flag behavior", () => {
        test("task is enabled by default", () => {
            const task = new Task({
                id: "test-task",
                execute: async () => "result",
            });

            expect(task.isEnabled).toBe(true);
        });

        test("task respects explicit enabled flag", () => {
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

            expect(enabledTask.isEnabled).toBe(true);
            expect(disabledTask.isEnabled).toBe(false);
        });

        test("disabled task skips execution and returns null", async () => {
            let executionCount = 0;
            const task = new Task({
                id: "disabled-task",
                execute: async () => {
                    executionCount++;
                    return "result";
                },
                enabled: false,
            });

            const result = await task.run({ initial: null });

            expect(result).toBeNull();
            expect(executionCount).toBe(0);
            expect(task.status).toBe("skipped");
        });

        test("disabled task skips retries", async () => {
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

            const result = await task.run({ initial: null });

            expect(result).toBeNull();
            expect(executionCount).toBe(0);
            expect(task.status).toBe("skipped");
        });

        test("disabled task skips error handler", async () => {
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

            const result = await task.run({ initial: null });

            expect(result).toBeNull();
            expect(errorHandlerCalled).toBe(false);
            expect(task.status).toBe("skipped");
        });

        test("task status transitions correctly when disabled", async () => {
            const task = new Task({
                id: "status-test-task",
                execute: async () => "result",
                enabled: false,
            });

            expect(task.status).toBe("pending");

            await task.run({ initial: null });

            expect(task.status).toBe("skipped");
        });

        test("enabled task with dependencies receives correct context", async () => {
            const task = new Task({
                id: "context-test-task",
                execute: async (ctx) => {
                    expect(ctx).toEqual({
                        initial: "initial",
                        dep1: "value1",
                        dep2: "value2",
                    });
                    return "result";
                },
                dependencies: ["dep1", "dep2"],
                enabled: true,
            });

            const result = await task.run({
                initial: "initial",
                dep1: "value1",
                dep2: "value2",
            });

            expect(result).toBe("result");
            expect(task.status).toBe("completed");
        });

        test("disabled task in retry scenario", async () => {
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

            const result = await task.run({ initial: null });

            expect(result).toBeNull();
            expect(attemptCount).toBe(0);
            expect(task.status).toBe("skipped");
        });

        test("disabled task with non-null initial context", async () => {
            const task = new Task({
                id: "disabled-context-task",
                execute: async () => "result",
                enabled: false,
            });

            const result = await task.run({
                initial: { value: "test" },
            });

            expect(result).toBeNull();
            expect(task.status).toBe("skipped");
        });
    });
});
