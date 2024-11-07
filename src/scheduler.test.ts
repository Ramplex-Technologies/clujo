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
import { describe, mock, test } from "node:test";
import type { Clujo } from "../src/clujo";
import { Scheduler } from "../src/scheduler";

describe("Scheduler Class", async () => {
    test("addJob adds a job successfully", () => {
        const scheduler = new Scheduler();
        const mockJob = {
            id: "job1",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
        } as unknown as Clujo<Record<string, unknown>, { initial: unknown }>;

        scheduler.addJob(mockJob);

        assert.equal(scheduler.jobs.length, 1);
        assert.equal(scheduler.jobs[0], mockJob);
    });

    test("addJob throws error when adding duplicate job", () => {
        const scheduler = new Scheduler();
        const mockJob = {
            id: "job1",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
        } as unknown as Clujo<Record<string, unknown>, { initial: unknown }>;

        scheduler.addJob(mockJob);

        assert.throws(
            () => {
                scheduler.addJob(mockJob);
            },
            {
                message: "Job with id job1 is already added to the scheduler.",
            },
        );
    });

    test("start starts all jobs without Redis", () => {
        const scheduler = new Scheduler();
        const mockJob1 = {
            id: "job1",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
        } as any;
        const mockJob2 = {
            id: "job2",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
        } as any;

        scheduler.addJob(mockJob1);
        scheduler.addJob(mockJob2);

        scheduler.start();

        assert.equal(mockJob1.start.mock.calls.length, 1);
        assert.equal(mockJob2.start.mock.calls.length, 1);
    });

    test("stop stops all jobs", async () => {
        const scheduler = new Scheduler();
        const mockJob1 = {
            id: "job1",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
        } as any;
        const mockJob2 = {
            id: "job2",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
        } as any;

        scheduler.addJob(mockJob1);
        scheduler.addJob(mockJob2);

        await scheduler.stop();

        assert.equal(mockJob1.stop.mock.calls.length, 1);
        assert.equal(mockJob2.stop.mock.calls.length, 1);
        assert.equal(mockJob1.stop.mock.calls[0].arguments[0], 5000);
        assert.equal(mockJob2.stop.mock.calls[0].arguments[0], 5000);
    });

    test("stop uses custom timeout", async () => {
        const scheduler = new Scheduler();
        const mockJob = {
            id: "job1",
            start: mock.fn(),
            stop: mock.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
        } as any;

        scheduler.addJob(mockJob);

        await scheduler.stop(10000);

        assert.equal(mockJob.stop.mock.calls.length, 1);
        assert.equal(mockJob.stop.mock.calls[0].arguments[0], 10000);
    });
});
