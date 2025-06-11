import { Clujo } from './clujo.mjs';
import 'croner';
import 'ioredis';
import 'redis-semaphore';

/**
 * Scheduler class for managing and running Clujo jobs.
 * This class allows adding, starting, and stopping multiple Clujo jobs in a centralized manner.
 */
declare class Scheduler {
    #private;
    /**
     * Adds a Clujo job to the scheduler.
     * @param input - Object containing the job and optional completion handler.
     * @param input.job - The Clujo job to be added.
     * @param input.completionHandler - Optional function to invoke after the job completes.
     */
    addJob(job: Clujo<any>): void;
    /**
     * Starts all added jobs in the scheduler.
     *
     * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
     */
    start(): void;
    /**
     * Stops all running jobs in the scheduler.
     *
     * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop. Defaults to 5000ms.
     * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
     */
    stop(timeout?: number): Promise<void>;
    /**
     * Returns the list of jobs added to the scheduler.
     */
    get jobs(): Clujo<any>[];
}

export { Scheduler };
