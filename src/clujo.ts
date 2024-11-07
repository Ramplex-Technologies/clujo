/* --------------------------------------------------------------------------

  croner - MIT License - Hexagon <hexagon@56k.guru>
  ioredis - MIT License - Zihua Li
  redis-semaphore - MIT License - Alexander Mochalin

  ---------------------------------------------------------------------------

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

import type { CronOptions } from "croner";
import type { Redis } from "ioredis";
import { type LockOptions, Mutex } from "redis-semaphore";
import { Cron } from "./_cron";
import type { TaskGraphRunner } from "./task-graph";

/**
 * Represents a Clujo instance, which is a cron job that executes a task graph.
 *
 * @template TTaskDependencies - Type of the dependencies each task will receive
 * @template TTaskContext - Type of the context each task will receive
 */
export class Clujo<
    TTaskDependencies extends Record<string, unknown> = Record<string, unknown>,
    TTaskContext extends Record<string, unknown> & {
        initial: unknown;
    } = Record<string, unknown> & { initial: unknown },
> {
    readonly #id: string;
    readonly #cron: Cron;
    readonly #taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext["initial"], TTaskContext>;
    readonly #redis?: { client: Redis; lockOptions?: LockOptions };

    #hasStarted = false;
    #runImmediately = false;

    /**
     *
     * @param input The input to the Clujo constructor.
     * @param input.id The unique identifier for the Clujo instance.
     * @param input.taskGraphRunner The task graph runner to use for executing the task graph.
     * @param input.cron The cron schedule for the Clujo instance.
     * @param input.cron.pattern The cron pattern to use for scheduling the task graph. If a Date object is provided, the task graph will execute once at
     *   the specified time.
     * @param input.cron.options Optional options to use when creating the cron job.
     *
     * @throw An error if the Clujo ID, task graph runner, or cron pattern is not provided.
     *
     * @example
     * const clujo = new Clujo({
     *   id: 'my-clujo-instance',
     *   taskGraphRunner: new TaskGraphRunner(...),
     *   cron: {
     *     pattern: '0 0 * * *', // Run daily at midnight
     *     options: { timezone: 'America/New_York' }
     *   }
     * });
     */
    constructor({
        id,
        taskGraphRunner,
        cron,
        runImmediately,
        redis,
    }: {
        id: string;
        taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext["initial"], TTaskContext>;
        cron: { pattern: string | Date; options?: CronOptions };
        runImmediately?: boolean;
        redis?: { client: Redis; lockOptions?: LockOptions };
    }) {
        if (!id) {
            throw new Error("Clujo ID is required.");
        }
        if (!taskGraphRunner) {
            throw new Error("taskGraphRunner is required");
        }
        if (!cron.pattern) {
            throw new Error("cron.pattern is required");
        }
        if (runImmediately && typeof runImmediately !== "boolean") {
            throw new Error("runImmediately must be a boolean.");
        }
        if (redis && !redis.client) {
            throw new Error("Redis client is required in redis input.");
        }
        this.#id = id;
        this.#taskGraphRunner = taskGraphRunner;
        this.#cron = new Cron(cron.pattern, cron.options);
        this.#runImmediately = Boolean(runImmediately);
        this.#redis = redis;
    }

    get id(): string {
        return this.#id;
    }

    /**
     * Starts the cron job, which will execute the task graph according to the cron schedule.
     * @throws An error if the Clujo has already started.
     */
    start(): void {
        if (this.#hasStarted) {
            throw new Error("Cannot start a Clujo that has already started.");
        }

        const handler = async () => {
            try {
                if (!this.#redis) {
                    await this.#taskGraphRunner.run();
                } else {
                    await using lock = await this._tryAcquire(this.#redis.client, this.#redis.lockOptions);
                    if (lock) {
                        await this.#taskGraphRunner.run();
                    }
                }
            } catch (error) {
                console.error(`Clujo ${this.#id} failed: ${error}`);
            }
        };
        this.#cron.start(handler);
        this.#hasStarted = true;
        // we use the cron trigger here so that prevent overlapping is active by default
        // i.e., if no lock is used, and the trigger is executing, and the schedule time is reached, the scheduled execution will be skipped
        if (this.#runImmediately) {
            this.#cron.trigger();
        }
    }

    /**
     * Stops the cron job and prevents any further executions of the task graph.
     * If the task graph is currently executing, it will be allowed to finish for up to the specified timeout.
     *
     * @param timeout The maximum time to wait for the task graph to finish executing before stopping the cron.
     * @returns A promise that resolves when the cron has stopped.
     * @throws An error if the Clujo has not started.
     */
    async stop(timeout = 5000): Promise<void> {
        if (!this.#hasStarted) {
            throw new Error("Cannot stop a Clujo that has not started.");
        }
        await this.#cron.stop(timeout);
    }

    /**
     * Trigger an execution of the task graph immediately, independent of the cron schedule.
     * In the event the cron is running, the task graph will still execute.
     *
     * @returns The final context of the task graph.
     */
    async trigger(): Promise<TTaskContext> {
        // we do not trigger via the cron here so that we can make use of the result of the task graph
        return await this.#taskGraphRunner.run();
    }

    /**
     * Tries to acquire a lock from redis-semaphore. If the lock is acquired, the lock will be released when the lock is disposed.
     *
     * @param redis The Redis client to use.
     * @param lockOptions The options to use when acquiring the lock.
     *
     * @returns An AsyncDisposable lock if it was acquired, otherwise null.
     */
    private async _tryAcquire(
        redis: Redis,
        lockOptions: LockOptions | undefined,
    ): Promise<AsyncDisposableMutex | null> {
        const mutex = new Mutex(redis, this.#id, lockOptions);
        const lock = await mutex.tryAcquire();
        if (!lock) {
            return null;
        }
        return {
            mutex,
            [Symbol.asyncDispose]: async () => {
                try {
                    await mutex.release();
                } catch (error) {
                    console.error(`Error releasing lock for Clujo ${this.#id}: ${error}`);
                }
            },
        };
    }
}

interface AsyncDisposableMutex extends AsyncDisposable {
    mutex: Mutex;
}
