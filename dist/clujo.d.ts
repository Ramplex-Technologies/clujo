import { CronOptions } from 'croner';
import { Redis } from 'ioredis';
import { LockOptions } from 'redis-semaphore';
import { TaskGraphRunner } from './task-graph.js';
import './_dependency-map.js';
import './_task.js';
import './error.js';

/**
 * Represents a Clujo instance, which is a cron job that executes a task graph.
 *
 * @template TTaskDependencies - Type of the dependencies each task will receive
 * @template TTaskContext - Type of the context each task will receive

 * @param input The input to the Clujo constructor.
 * @param input.id The unique identifier for the Clujo instance.
 * @param input.taskGraphRunner The task graph runner to use for executing the task graph.
 * @param input.cron The cron schedule for the Clujo instance.
 * @param input.cron.pattern The cron pattern to use for scheduling the task graph. If a Date object is provided, the task graph will execute once at the specified time.
 * @param input.cron.options Optional options to use when creating the cron job.
 * @param input.redis The redis settings for distributed locking
 * @param input.redis.client The IORedis client instance
 * @param input.redis.lockOptions The redis-semaphore lock options for lock acquisition
 * @param input.runOnStartup If `true`, executes the task graph immediately on start, independent of the cron schedule
 *
 * @throw An error if the Clujo ID, task graph runner, or cron pattern is not provided.
 *
 * @example
 * const clujo = new Clujo({
 *   id: 'my-clujo-instance',
 *   taskGraphRunner: myTaskGraphRunner,
 *   cron: {
 *     pattern: '0 0 * * *', // Run daily at midnight
 *     options: { timezone: 'America/New_York' }
 *   },
 *   runOnStartup: false,
 *   redis: { client: myRedisClient }
 * });
 */
declare class Clujo<TTaskDependencies extends Record<string, unknown> = Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
} = Record<string, unknown> & {
    initial: unknown;
}> {
    #private;
    constructor({ id, taskGraphRunner, cron, enabled, runOnStartup, redis, logger, }: {
        id: string;
        taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext["initial"], TTaskContext>;
        cron: ({
            pattern: string | Date;
        } | {
            patterns: (string | Date)[];
        }) & {
            options?: CronOptions;
        };
        enabled?: boolean;
        runOnStartup?: boolean;
        redis?: {
            client: Redis;
            lockOptions?: LockOptions;
        };
        logger?: ClujoLogger;
    });
    get id(): string;
    /**
     * Starts the cron job, which will execute the task graph according to the cron schedule.
     * @throws An error if the Clujo has already started.
     */
    start(): void;
    /**
     * Stops the cron job and prevents any further executions of the task graph.
     * If the task graph is currently executing, it will be allowed to finish for up to the specified timeout.
     *
     * @param timeout The maximum time to wait for the task graph to finish executing before stopping the cron.
     * @returns A promise that resolves when the cron has stopped.
     * @throws An error if the Clujo has not started.
     */
    stop(timeout?: number): Promise<void>;
    /**
     * Trigger an execution of the task graph immediately, independent of the cron schedule.
     * In the event the cron is running, the task graph will still execute.
     *
     * @returns The final context of the task graph.
     */
    trigger(): Promise<TTaskContext>;
}
interface ClujoLogger {
    log(message: string): void;
    error(message: string): void;
}

export { Clujo };
