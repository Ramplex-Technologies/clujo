import { strict as assert } from "node:assert";
import { test, describe, mock } from "node:test";
import { Scheduler } from "../src/scheduler";
import type { Clujo } from "../src/clujo";

describe("Scheduler Class", async () => {
  test("addJob adds a job successfully", () => {
    const scheduler = new Scheduler();
    const mockJob = {
      id: "job1",
      start: mock.fn(),
      stop: mock.fn(() => Promise.resolve()),
    } as unknown as Clujo<Record<string, unknown>, { initial: unknown }>;

    scheduler.addJob({ job: mockJob });

    // @ts-ignore: Accessing private property for testing
    assert.equal(scheduler.jobs.length, 1);
    // @ts-ignore: Accessing private property for testing
    assert.equal(scheduler.jobs[0].job, mockJob);
  });

  test("addJob throws error when adding duplicate job", () => {
    const scheduler = new Scheduler();
    const mockJob = {
      id: "job1",
      start: mock.fn(),
      stop: mock.fn(() => Promise.resolve()),
    } as unknown as Clujo<Record<string, unknown>, { initial: unknown }>;

    scheduler.addJob({ job: mockJob });

    assert.throws(
      () => {
        scheduler.addJob({ job: mockJob });
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

    scheduler.addJob({ job: mockJob1 });
    scheduler.addJob({ job: mockJob2 });

    scheduler.start();

    assert.equal(mockJob1.start.mock.calls.length, 1);
    assert.equal(mockJob2.start.mock.calls.length, 1);
    assert.deepEqual(mockJob1.start.mock.calls[0].arguments[0], {});
    assert.deepEqual(mockJob2.start.mock.calls[0].arguments[0], {});
  });

  test("start starts all jobs with Redis", () => {
    const scheduler = new Scheduler();
    const mockJob = {
      id: "job1",
      start: mock.fn(),
      stop: mock.fn(() => Promise.resolve()),
      // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
    } as any;
    const mockRedis = {};

    scheduler.addJob({ job: mockJob });

    // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
    scheduler.start(mockRedis as any);

    assert.equal(mockJob.start.mock.calls.length, 1);
    assert.deepEqual(mockJob.start.mock.calls[0].arguments[0], { redis: { client: mockRedis } });
  });

  test("start invokes completion handler if provided", () => {
    const scheduler = new Scheduler();
    const mockJob = {
      id: "job1",
      start: mock.fn(),
      stop: mock.fn(() => Promise.resolve()),
      // biome-ignore lint/suspicious/noExplicitAny: did not wanna deal with this
    } as any;
    const mockCompletionHandler = mock.fn();

    scheduler.addJob({ job: mockJob, completionHandler: mockCompletionHandler });

    scheduler.start();

    assert.equal(mockJob.start.mock.calls.length, 1);
    assert.equal(typeof mockJob.start.mock.calls[0].arguments[0].onTaskCompletion, "function");
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

    scheduler.addJob({ job: mockJob1 });
    scheduler.addJob({ job: mockJob2 });

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

    scheduler.addJob({ job: mockJob });

    await scheduler.stop(10000);

    assert.equal(mockJob.stop.mock.calls.length, 1);
    assert.equal(mockJob.stop.mock.calls[0].arguments[0], 10000);
  });
});
