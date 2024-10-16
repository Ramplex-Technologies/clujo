import type { CronOptions } from "croner";
import { Clujo } from "./clujo";
import type { IClujo, IClujoBuilder, IClujoStart } from "./clujo.types";
import { Cron } from "./cron";
import type { ICron } from "./cron.types";
import type { RetryPolicy } from "./task-graph.types";

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
 *   .build();                                                // build the Clujo instance -- tasks can now be added
 * ```
 *
 * @see {@link IClujoStart} for the initial interface implemented by ClujoBuilder.
 * @see {@link IClujoBuilder} for the interface returned after setting the schedule.
 * @see {@link IClujo} for the final Clujo interface after building.
 */
export class ClujoBuilder implements IClujoStart {
  constructor(private readonly id: string) {}

  setSchedule(pattern: string, options?: CronOptions): IClujoBuilder<void, { initial: undefined }> {
    // TODO: validate this pattern?
    const cron = new Cron(pattern, options);
    return new ClujoBuilderHelper(this.id, cron);
  }
}

class ClujoBuilderHelper<TDependencies, TContext extends object> implements IClujoBuilder<TDependencies, TContext> {
  // do not retry by default
  private retryPolicy: RetryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  // do not run immediately by default
  private runImmediately = false;
  // do not set initial context by default
  private contextValueOrFactory: unknown = undefined;
  private dependencies!: TDependencies;

  constructor(
    private readonly id: string,
    private readonly cron: ICron,
  ) {}

  // biome-ignore lint/complexity/noBannedTypes: valid use case here
  build(): IClujo<TDependencies, TContext, {}> {
    // biome-ignore lint/complexity/noBannedTypes: valid use case here
    return new Clujo<TDependencies, TContext, {}>(
      this.id,
      this.cron,
      this.retryPolicy,
      this.runImmediately,
      this.dependencies,
      this.contextValueOrFactory as undefined | TContext | (() => TContext | Promise<TContext>),
    );
  }

  runOnStartup(): IClujoBuilder<TDependencies, TContext> {
    this.runImmediately = true;
    return this;
  }

  setDependencies<TNewDeps extends object>(deps: TNewDeps): IClujoBuilder<TNewDeps, TContext> {
    this.dependencies = deps as unknown as TDependencies;
    return this as unknown as IClujoBuilder<TNewDeps, TContext>;
  }

  setInitialContext<TNewContext>(
    valueOrFactory: TNewContext | (() => TNewContext | Promise<TNewContext>),
  ): IClujoBuilder<TDependencies, { initial: TNewContext }> {
    this.contextValueOrFactory = valueOrFactory;
    return this as unknown as IClujoBuilder<TDependencies, { initial: TNewContext }>;
  }

  setRetryPolicy(policy: RetryPolicy): IClujoBuilder<TDependencies, TContext> {
    this.retryPolicy = policy;
    return this;
  }
}
