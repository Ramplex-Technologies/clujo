import Redis from 'ioredis';
import { IClujo } from './clujo.types.mjs';
import 'croner';
import 'redis-semaphore';
import './task-graph.types.mjs';

declare class Scheduler {
    private readonly jobs;
    addJob<TDependencies, TContext>(input: {
        job: IClujo<TDependencies, TContext, any>;
        completionHandler: (ctx: Required<TContext>) => Promise<void> | void;
    }): void;
    start(redis?: Redis): void;
    stop(): Promise<void>;
}

export { Scheduler };
