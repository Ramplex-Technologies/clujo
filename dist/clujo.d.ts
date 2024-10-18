import { CronOptions } from 'croner';
import { Redis } from 'ioredis';
import { LockOptions } from 'redis-semaphore';
import { TaskGraphRunner } from './task-graph.js';
import './task.js';

declare class Clujo<TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}> {
    readonly id: string;
    private readonly _cron;
    private readonly _taskGraphRunner;
    private _hasStarted;
    constructor({ id, taskGraphRunner, cron, }: {
        id: string;
        taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext>;
        cron: {
            pattern: string;
            options?: CronOptions;
        };
    });
    /**
     * Starts the cron job, which will execute the task graph according to the cron schedule.
     * If a redis client instance is provided, a lock will be acquired before executing the task graph, preventing overlapping executions.
     *
     * @param redis The Redis client to use for locking.
     * @param onTaskCompletion An optional function to execute after the task graph has completed.
     * @param runImmediately An optional boolean which, if set to true, executes the task graph immediately upon starting.
     *    The overlap behavior here depends on if a lock is used (never any overlap), or if `preventOverlap` was disabled (
     *    in which case there is overlap between multiple instances of the same Clujo).
     * @returns The Clujo instance.
     * @throws An error if the Clujo has already started.
     */
    start({ redis, onTaskCompletion, runImmediately, }?: {
        redis?: {
            client: Redis;
            lockOptions?: LockOptions;
        };
        onTaskCompletion?: (ctx: TTaskContext) => void | Promise<void>;
        runImmediately?: boolean;
    }): this;
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
    /**
     * Tries to acquire a lock from redis-semaphore. If the lock is acquired, the lock will be released when the lock is disposed.
     *
     * @param redis The Redis client to use.
     * @param lockOptions The options to use when acquiring the lock.
     *
     * @returns An AsyncDisposable lock if it was acquired, otherwise null.
     */
    private _tryAcquire;
}

export { Clujo };
