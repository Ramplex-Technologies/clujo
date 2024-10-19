import { Clujo } from './clujo.js';
import { Redis } from 'ioredis';
import './task-graph.js';
import 'croner';
import 'redis-semaphore';
import './_task.js';

/**
 * Scheduler class for managing and running Clujo jobs.
 * This class allows adding, starting, and stopping multiple Clujo jobs in a centralized manner.
 */
declare class Scheduler {
    private readonly jobs;
    /**
     * Adds a Clujo job to the scheduler.
     * @param input - Object containing the job and optional completion handler.
     * @param input.job - The Clujo job to be added.
     * @param input.completionHandler - Optional function to invoke after the job completes.
     */
    addJob<TDependencies extends Record<string, unknown>, TContext extends Record<string, unknown> & {
        initial: unknown;
    }>(input: {
        job: Clujo<TDependencies, TContext>;
        completionHandler?: (ctx: Required<TContext>) => Promise<void> | void;
    }): void;
    /**
     * Starts all added jobs in the scheduler.
     *
     * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
     */
    start(redis?: Redis): void;
    /**
     * Stops all running jobs in the scheduler.
     *
     * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop. Defaults to 5000ms.
     * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
     */
    stop(timeout?: number): Promise<void>;
}

export { Scheduler };
