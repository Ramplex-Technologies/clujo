/* --------------------------------------------------------------------------

  MIT License

  Copyright (c) 2025 Ramplex Technologies LLC

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

import { describe, expect, test, vi } from "vitest";

import type { Clujo } from "../src/clujo";
import { Scheduler } from "../src/scheduler";

describe("Scheduler Class", () => {
    test("addJob adds a job successfully", () => {
        const scheduler = new Scheduler();
        const mockJob = {
            id: "job1",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
        } as unknown as Clujo<unknown>;

        scheduler.addJob(mockJob);

        expect(scheduler.jobs).toHaveLength(1);
        expect(scheduler.jobs[0]).toBe(mockJob);
    });

    test("addJob throws error when adding duplicate job", () => {
        const scheduler = new Scheduler();
        const mockJob = {
            id: "job1",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
        } as unknown as Clujo<unknown>;

        scheduler.addJob(mockJob);

        expect(() => {
            scheduler.addJob(mockJob);
        }).toThrow("Job with id job1 is already added to the scheduler.");
    });

    test("start starts all jobs without Redis", () => {
        const scheduler = new Scheduler();
        const mockJob1 = {
            id: "job1",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: want any here
        } as any;
        const mockJob2 = {
            id: "job2",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: want any here
        } as any;

        scheduler.addJob(mockJob1);
        scheduler.addJob(mockJob2);

        scheduler.start();

        expect(mockJob1.start).toHaveBeenCalledTimes(1);
        expect(mockJob2.start).toHaveBeenCalledTimes(1);
    });

    test("stop stops all jobs", async () => {
        const scheduler = new Scheduler();
        const mockJob1 = {
            id: "job1",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: want any here
        } as any;
        const mockJob2 = {
            id: "job2",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: want any here
        } as any;

        scheduler.addJob(mockJob1);
        scheduler.addJob(mockJob2);

        await scheduler.stop();

        expect(mockJob1.stop).toHaveBeenCalledTimes(1);
        expect(mockJob2.stop).toHaveBeenCalledTimes(1);
        expect(mockJob1.stop).toHaveBeenCalledWith(5000);
        expect(mockJob2.stop).toHaveBeenCalledWith(5000);
    });

    test("stop uses custom timeout", async () => {
        const scheduler = new Scheduler();
        const mockJob = {
            id: "job1",
            start: vi.fn(),
            stop: vi.fn(() => Promise.resolve()),
            // biome-ignore lint/suspicious/noExplicitAny: want any here
        } as any;

        scheduler.addJob(mockJob);

        await scheduler.stop(10000);

        expect(mockJob.stop).toHaveBeenCalledTimes(1);
        expect(mockJob.stop).toHaveBeenCalledWith(10000);
    });
});
