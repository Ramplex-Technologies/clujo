/* --------------------------------------------------------------------------

  croner - MIT License - Hexagon <hexagon@56k.guru>
  ioredis - MIT License - Zihua Li
  redis-semaphore - MIT License - Alexander Mochalin

  ---------------------------------------------------------------------------

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

import type { CronOptions } from "croner";
import type { Redis } from "ioredis";
import { type LockOptions, Mutex } from "redis-semaphore";

import { Cron } from "./_cron";

/**
 * Represents a Clujo instance, which is a cron job that executes a runner with a trigger function.
 *
 * @template T - Type of the value returned by the runner's trigger function

 * @param input The input to the Clujo constructor.
 * @param input.id The unique identifier for the Clujo instance.
 * @param input.runner The runner object with a trigger function to execute. Can be any object that implements { trigger: () => T | Promise<T> }
 * @param input.cron The cron schedule for the Clujo instance.
 * @param input.cron.pattern The cron pattern to use for scheduling. If a Date object is provided, the runner will execute once at the specified time.
 * @param input.cron.options Optional options to use when creating the cron job.
 * @param input.redis The redis settings for distributed locking
 * @param input.redis.client The IORedis client instance
 * @param input.redis.lockOptions The redis-semaphore lock options for lock acquisition
 * @param input.runOnStartup If `true`, executes the runner immediately on start, independent of the cron schedule
 *
 * @throw An error if the Clujo ID, runner, or cron pattern is not provided.
 *
 * @example
 * const clujo = new Clujo({
 *   id: 'my-clujo-instance',
 *   runner: myWorkflowRunner,
 *   cron: {
 *     pattern: '0 0 * * *', // Run daily at midnight
 *     options: { timezone: 'America/New_York' }
 *   },
 *   runOnStartup: false,
 *   redis: { client: myRedisClient }
 * });
 */
export class Clujo<T> {
    readonly #id: string;
    readonly #cron: Cron;
    readonly #runner: IRunner<T>;
    readonly #redis?: { client: Redis; lockOptions?: LockOptions };
    readonly #enabled: boolean;
    readonly #logger?: IClujoLogger;

    #hasStarted = false;
    #runOnStartup = false;

    constructor({
        id,
        runner,
        cron,
        enabled,
        runOnStartup,
        redis,
        logger,
    }: {
        id: string;
        runner: IRunner<T>;
        cron: ({ pattern: string | Date } | { patterns: (string | Date)[] }) & {
            options?: CronOptions;
        };
        enabled?: boolean;
        runOnStartup?: boolean;
        redis?: { client: Redis; lockOptions?: LockOptions };
        logger?: IClujoLogger;
    }) {
        logger?.debug?.(`Initializing Clujo instance with ID: ${id}`);
        if (!id) {
            throw new Error("Clujo ID is required.");
        }
        if (!runner) {
            throw new Error("runner is required");
        }
        if (!runner.trigger || typeof runner.trigger !== "function") {
            throw new Error("runner must have a trigger function");
        }
        if (!("pattern" in cron || "patterns" in cron)) {
            throw new Error("Either cron.pattern or cron.patterns is required.");
        }
        if ("pattern" in cron && !cron.pattern) {
            throw new Error("cron.pattern is required");
        }
        if ("patterns" in cron && !cron.patterns) {
            throw new Error("cron.patterns is required");
        }
        if (enabled && typeof enabled !== "boolean") {
            throw new Error("enabled must be a boolean");
        }
        if (runOnStartup && typeof runOnStartup !== "boolean") {
            throw new Error("runOnStartup must be a boolean.");
        }
        if (redis && !redis.client) {
            throw new Error("Redis client is required in redis input.");
        }
        if (redis) {
            logger?.debug?.(`Redis configuration provided for Clujo ${id}`);
        }
        if (enabled === false) {
            logger?.log?.(`Clujo instance ${id} initialized in disabled state`);
        }
        if (runOnStartup) {
            logger?.debug?.(`Clujo ${id} configured to run on startup`);
        }
        this.#id = id;
        this.#runner = runner;
        this.#cron = new Cron("pattern" in cron ? cron.pattern : cron.patterns, cron.options);
        this.#runOnStartup = Boolean(runOnStartup);
        // default to enabled
        this.#enabled = enabled ?? true;
        this.#redis = redis;
        this.#logger = logger;
        logger?.log?.(`Clujo instance ${id} successfully initialized`);
    }

    get id(): string {
        return this.#id;
    }

    /**
     * Starts the cron job, which will execute the task graph according to the cron schedule.
     * @throws An error if the Clujo has already started.
     */
    start(): void {
        this.#logger?.debug?.(`Attempting to start Clujo ${this.#id}`);
        if (this.#hasStarted) {
            this.#logger?.error?.(`Failed to start Clujo ${this.#id}: already started`);
            throw new Error("Cannot start a Clujo that has already started.");
        }

        const handler = async () => {
            try {
                this.#logger?.debug?.(`Cron trigger received for Clujo ${this.#id}`);
                if (!this.#enabled) {
                    this.#logger?.log?.(`Skipping execution - Clujo ${this.#id} is disabled`);
                    return;
                }
                if (!this.#redis) {
                    this.#logger?.debug?.(`Executing runner for Clujo ${this.#id} without distributed lock`);
                    await this.#runner.trigger();
                    this.#logger?.log?.(`Successfully completed runner execution for Clujo ${this.#id}`);
                } else {
                    this.#logger?.debug?.(`Attempting to acquire distributed lock for Clujo ${this.#id}`);
                    await using lock = await this.#tryAcquire(this.#redis.client, this.#redis.lockOptions);
                    if (lock) {
                        this.#logger?.debug?.(`Executing runner for Clujo ${this.#id} with distributed lock`);
                        await this.#runner.trigger();
                        this.#logger?.log?.(`Successfully completed runner execution for Clujo ${this.#id}`);
                    } else {
                        this.#logger?.log?.(`Skipping execution - Could not acquire lock for Clujo ${this.#id}`);
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.#logger?.error?.(`Failed to execute runner for Clujo ${this.#id}: ${message}`);
            }
        };
        this.#cron.start(handler);
        this.#hasStarted = true;
        this.#logger?.log?.(`Clujo ${this.#id} started successfully`);

        // we use the cron trigger here so that prevent overlapping is active by default
        // i.e., if no lock is used, and the trigger is executing, and the schedule time is reached, the scheduled execution will be skipped
        if (this.#runOnStartup) {
            void this.#cron.trigger();
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
        this.#logger?.debug?.(`Attempting to stop Clujo ${this.#id} with timeout ${timeout}ms`);
        if (!this.#hasStarted) {
            this.#logger?.error?.(`Failed to stop Clujo ${this.#id}: not started`);
            throw new Error("Cannot stop a Clujo that has not started.");
        }
        try {
            await this.#cron.stop(timeout);
            this.#logger?.log?.(`Clujo ${this.#id} stopped successfully`);
        } catch (error) {
            this.#logger?.error?.(`Failed to stop Clujo ${this.#id}: ${error}`);
            throw error;
        }
    }

    /**
     * Trigger an execution of the runner immediately, independent of the cron schedule.
     * In the event the cron is running, the runner will still execute.
     *
     * @returns The final context returned by the runner.
     */
    async trigger(): Promise<T> {
        // we do not trigger via the cron here so that we can make use of the result of the runner
        this.#logger?.debug?.(`Manual trigger initiated for Clujo ${this.#id}`);
        try {
            const result = await this.#runner.trigger();
            this.#logger?.log?.(`Manual trigger completed successfully for Clujo ${this.#id}`);
            return result;
        } catch (error) {
            this.#logger?.error?.(`Manual trigger failed for Clujo ${this.#id}: ${error}`);
            throw error;
        }
    }

    /**
     * Tries to acquire a lock from redis-semaphore. If the lock is acquired, the lock will be released when the lock is disposed.
     *
     * @param redis The Redis client to use.
     * @param lockOptions The options to use when acquiring the lock.
     *
     * @returns An AsyncDisposable lock if it was acquired, otherwise null.
     */
    async #tryAcquire(redis: Redis, lockOptions: LockOptions | undefined): Promise<AsyncDisposableMutex | null> {
        this.#logger?.debug?.(`Attempting to acquire mutex for Clujo ${this.#id}`);
        const mutex = new Mutex(redis, this.#id, {
            acquireAttemptsLimit: 1,
            lockTimeout: 30000,
            refreshInterval: 24000,
            onLockLost: (lockLostError) => {
                this.#logger?.error?.(`Lock lost for Clujo ${this.#id}: ${lockLostError.message}`);
                throw lockLostError;
            },
            ...lockOptions,
        });

        try {
            const lock = await mutex.tryAcquire();
            if (!lock) {
                this.#logger?.debug?.(
                    `Could not acquire mutex for Clujo ${this.#id} - another instance is likely running`,
                );
                return null;
            }
            this.#logger?.debug?.(`Successfully acquired mutex for Clujo ${this.#id}`);
            return {
                mutex,
                [Symbol.asyncDispose]: async () => {
                    try {
                        await mutex.release();
                        this.#logger?.debug?.(`Successfully released mutex for Clujo ${this.#id}`);
                    } catch (error) {
                        this.#logger?.error?.(`Failed to release mutex for Clujo ${this.#id}: ${error}`);
                        throw error;
                    }
                },
            };
        } catch (error) {
            this.#logger?.error?.(`Failed to acquire mutex for Clujo ${this.#id}: ${error}`);
            throw error;
        }
    }
}

interface AsyncDisposableMutex extends AsyncDisposable {
    mutex: Mutex;
}

export interface IClujoLogger {
    log?: (message: string) => void;
    debug?: (message: string) => void;
    error?: (message: string) => void;
}

export interface IRunner<T> {
    trigger: () => T | Promise<T>;
}
