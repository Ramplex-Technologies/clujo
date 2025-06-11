import { CronOptions } from 'croner';
import { Redis } from 'ioredis';
import { LockOptions } from 'redis-semaphore';

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
declare class Clujo<T> {
    #private;
    constructor({ id, runner, cron, enabled, runOnStartup, redis, logger, }: {
        id: string;
        runner: IRunner<T>;
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
        logger?: IClujoLogger;
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
     * Trigger an execution of the runner immediately, independent of the cron schedule.
     * In the event the cron is running, the runner will still execute.
     *
     * @returns The final context returned by the runner.
     */
    trigger(): Promise<T>;
}
interface IClujoLogger {
    log?: (message: string) => void;
    debug?: (message: string) => void;
    error?: (message: string) => void;
}
interface IRunner<T> {
    trigger: () => T | Promise<T>;
}

export { Clujo, type IClujoLogger, type IRunner };
