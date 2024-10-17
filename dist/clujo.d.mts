import { CronOptions } from 'croner';
import { Redis } from 'ioredis';
import { LockOptions } from 'redis-semaphore';
import { TaskGraphRunner } from './task-graph.mjs';

declare class Clujo<TTaskDependencies extends Record<string, unknown>, TTaskContext extends Record<string, unknown> & {
    initial: unknown;
}> {
    readonly id: string;
    private readonly _cron;
    private readonly _taskGraphRunner;
    private _hasStarted;
    private _runImmediately;
    constructor({ id, taskGraphRunner, cron, }: {
        id: string;
        taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext>;
        cron: {
            pattern: string;
            options?: CronOptions;
        };
    });
    runOnStartup(): this;
    start({ redis, onTaskCompletion, }?: {
        redis?: {
            client: Redis;
            lockOptions?: LockOptions;
        };
        onTaskCompletion?: (ctx: TTaskContext) => void | Promise<void>;
    }): this;
    stop(timeout?: number): Promise<void>;
    trigger(): Promise<TTaskContext>;
    private _tryAcquire;
}

export { Clujo };
