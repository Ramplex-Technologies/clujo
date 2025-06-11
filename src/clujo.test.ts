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
import { Clujo } from "./clujo";

describe("Clujo", () => {
    describe("constructor validation", () => {
        test("throws when id is not provided", () => {
            expect(
                () =>
                    new Clujo({
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        id: "" as any,
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        runner: {} as any,
                        cron: { pattern: "* * * * *" },
                    }),
            ).toThrow(/Clujo ID is required/);
        });

        test("throws when runner is not provided", () => {
            expect(
                () =>
                    new Clujo({
                        id: "test",
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        runner: null as any,
                        cron: { pattern: "* * * * *" },
                    }),
            ).toThrow(/runner is required/);
        });

        test("throws when cron pattern is not provided", () => {
            expect(
                () =>
                    new Clujo({
                        id: "test",
                        runner: { trigger: () => {} },
                        cron: { pattern: "" },
                    }),
            ).toThrow(/cron.pattern is required/);
        });
    });

    describe("start method", () => {
        test("throws when already started", () => {
            const runner = {
                trigger: () => Promise.resolve("result")
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
            });

            clujo.start();
            expect(() => clujo.start()).toThrow(/Cannot start a Clujo that has already started/);
            clujo.stop();
        });
    });

    describe("stop method", () => {
        test("throws when not started", async () => {
            const runner = {
                trigger: () => Promise.resolve("result")
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
            });

            await expect(clujo.stop()).rejects.toThrow(/Cannot stop a Clujo that has not started/);
        });

        test("stops successfully", async () => {
            const runner = {
                trigger: () => Promise.resolve({ node1: "result" })
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
            });

            clujo.start();
            await expect(clujo.stop()).resolves.not.toThrow();
        });
    });

    describe("trigger method", () => {
        test("executes runner and returns result", async () => {
            const runner = {
                trigger: () => Promise.resolve({
                    initial: undefined,
                    node1: "result1",
                    node2: "result1-result2"
                })
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
            });

            const result = await clujo.trigger();
            expect(result).toEqual({
                initial: undefined,
                node1: "result1",
                node2: "result1-result2",
            });
        });
    });

    describe("enabled flag", () => {
        test("is enabled by default", async () => {
            let executionCount = 0;
            const runner = {
                trigger: async () => {
                    executionCount++;
                    return { node1: "result" };
                }
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
                runOnStartup: true,
            });

            clujo.start();
            // Give time for runOnStartup to execute
            await new Promise((resolve) => setTimeout(resolve, 100));
            await clujo.stop();

            expect(executionCount).toBe(1);
        });

        test("respects disabled flag and logs message", async () => {
            let executionCount = 0;
            const runner = {
                trigger: async () => {
                    executionCount++;
                    return { node1: "result" };
                }
            };

            const logs: string[] = [];
            const logger = {
                debug: (message: string) => logs.push(message),
                log: (message: string) => logs.push(message),
                error: (message: string) => logs.push(message),
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
                enabled: false,
                runOnStartup: true,
                logger,
            });

            clujo.start();
            // Give time for runOnStartup to execute
            await new Promise((resolve) => setTimeout(resolve, 100));
            await clujo.stop();

            expect(executionCount).toBe(0);
            expect(logs).toContain("Skipping execution - Clujo test is disabled");
        });

        test("validates enabled flag type", () => {
            const runner = {
                trigger: () => Promise.resolve({ node1: "result" })
            };

            expect(
                () =>
                    new Clujo({
                        id: "test",
                        runner: runner,
                        cron: { pattern: "* * * * *" },
                        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
                        enabled: "true" as any,
                    }),
            ).toThrow(/enabled must be a boolean/);
        });

        test("trigger executes regardless of enabled flag", async () => {
            let executionCount = 0;
            const runner = {
                trigger: async () => {
                    executionCount++;
                    return { node1: "result" };
                }
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
                enabled: false,
            });

            await clujo.trigger();
            expect(executionCount).toBe(1);
        });

        test("logs warning when attempting scheduled run while disabled", async () => {
            const runner = {
                trigger: () => Promise.resolve({ node1: "result" })
            };

            const logs: string[] = [];
            const logger = {
                debug: (message: string) => logs.push(message),
                log: (message: string) => logs.push(message),
                error: (message: string) => logs.push(message),
            };

            const clujo = new Clujo({
                id: "test",
                runner: runner,
                cron: { pattern: "* * * * *" },
                enabled: false,
                runOnStartup: true,
                logger,
            });

            clujo.start();
            await new Promise((resolve) => setTimeout(resolve, 100));
            await clujo.stop();

            expect(logs).toContain("Skipping execution - Clujo test is disabled");
        });
    });
});
