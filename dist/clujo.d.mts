import { IClujo, TExecute, TErrorHandler, StartOptions } from './clujo.types.mjs';
import { ICron } from './cron.types.mjs';
import { TaskMap, RetryPolicy, ITask } from './task-graph.types.mjs';
import 'croner';
import 'ioredis';
import 'redis-semaphore';

declare class Clujo<TDependencies, TContext extends object, TTaskMap extends TaskMap<TDependencies, TContext>> implements IClujo<TDependencies, TContext, TTaskMap> {
    readonly id: string;
    private readonly cron;
    private readonly retryPolicy;
    private readonly runImmediately;
    private readonly taskGraphBuilder;
    private hasStarted;
    constructor(id: string, cron: ICron, retryPolicy: RetryPolicy, runImmediately: boolean, dependencies: TDependencies, contextValueOrFactory: undefined | TContext | (() => TContext | Promise<TContext>));
    addTask<TTaskId extends string, TExecuteReturn>(input: {
        taskId: TTaskId;
        execute: TExecute<TDependencies, TContext, TExecuteReturn>;
        errorHandler?: TErrorHandler<TDependencies, TContext>;
        retryPolicy?: RetryPolicy;
        dependencies?: (keyof TTaskMap)[];
    }): IClujo<TDependencies, TContext & Partial<{
        [K in TTaskId]: TExecuteReturn extends void ? undefined : TExecuteReturn;
    }>, TTaskMap & {
        [K in TTaskId]: ITask<TDependencies, TExecuteReturn, TContext & Partial<{
            [K in TTaskId]: TExecuteReturn extends void ? undefined : TExecuteReturn;
        }>>;
    }>;
    start(options?: StartOptions<TContext>): IClujo<TDependencies, TContext, TTaskMap>;
    stop(): Promise<void>;
    trigger(): Promise<void>;
    private tryAcquire;
}

export { Clujo };
