import { CronOptions } from 'croner';
import { IClujoStart, IClujoBuilder } from './clujo.types.mjs';
import 'ioredis';
import 'redis-semaphore';
import './task-graph.types.mjs';

/**
 * A builder class for creating and configuring a Clujo instance.
 *
 * @implements {IClujoStart}
 *
 * @description
 * The ClujoBuilder provides a fluent interface for setting up a Clujo with various configurations.
 * It allows you to define the schedule, set dependencies, configure the context, and apply retry policies.
 *
 * @example
 * ```typescript
 * const clujo = new ClujoBuilder('myClujoId')
 *   .setSchedule('* * * * *')                                // cron schedule to run on
 *   .setDependencies({ db: myDatabase })                     // every task has access to the database
 *   .setContext({ initialValue: 0 })                         // initial context value (can also be a function returning a value)
 *   .setRetryPolicy({ maxRetries: 3, retryDelayMs: 1000 })   // global retry policy (can be overriden by task)
 *   .runOnStartup()                                          // run this task immediately when the Clujo starts
 *   .build();                                                // build the Clujo instance
 * ```
 *
 * @see {@link IClujoStart} for the initial interface implemented by ClujoBuilder.
 * @see {@link IClujoBuilder} for the interface returned after setting the schedule.
 * @see {@link IClujo} for the final Clujo interface after building.
 */
declare class ClujoBuilder implements IClujoStart {
    private readonly id;
    constructor(id: string);
    setSchedule(pattern: string, options?: CronOptions): IClujoBuilder<void, {
        initial: undefined;
    }>;
}

export { ClujoBuilder };
