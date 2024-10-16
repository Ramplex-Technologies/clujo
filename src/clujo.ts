import type { Redis } from "ioredis";
import { type LockOptions, Mutex } from "redis-semaphore";
import type { IClujo, ILock, StartOptions, TErrorHandler, TExecute } from "./clujo.types";
import type { ICron } from "./cron.types";
import { TaskGraphBuilder } from "./task-graph-builder";
import type { ITask, ITaskGraph, ITaskGraphBuilderHelper, RetryPolicy, TaskMap } from "./task-graph.types";

export class Clujo<TDependencies, TContext extends object, TTaskMap extends TaskMap<TDependencies, TContext>>
  implements IClujo<TDependencies, TContext, TTaskMap>
{
  private readonly taskGraphBuilder: ITaskGraphBuilderHelper<TDependencies, TContext, TTaskMap>;
  private taskGraph: ITaskGraph<TContext> | undefined;
  private hasStarted = false;

  constructor(
    public readonly id: string,
    private readonly cron: ICron,
    private readonly retryPolicy: RetryPolicy,
    private readonly runImmediately: boolean,
    dependencies: TDependencies,
    contextValueOrFactory: undefined | TContext | (() => TContext | Promise<TContext>),
  ) {
    this.taskGraphBuilder = new TaskGraphBuilder<TDependencies, TContext>()
      .setDependencies(dependencies)
      .setInitialContext(contextValueOrFactory)
      .finalizeSetup();
  }

  addTask<TTaskId extends string, TExecuteReturn>(input: {
    taskId: TTaskId;
    // pick the keys of TTaskMap in TContext
    execute: TExecute<TDependencies, TContext, TExecuteReturn>;
    errorHandler?: TErrorHandler<TDependencies, TContext>;
    retryPolicy?: RetryPolicy;
    dependencies?: (keyof TTaskMap)[];
  }): IClujo<
    TDependencies,
    TContext &
      Partial<{
        [K in TTaskId]: TExecuteReturn extends void ? undefined : TExecuteReturn;
      }>,
    TTaskMap & {
      [K in TTaskId]: ITask<
        TDependencies,
        TExecuteReturn,
        TContext &
          Partial<{
            [K in TTaskId]: TExecuteReturn extends void ? undefined : TExecuteReturn;
          }>
      >;
    }
  > {
    if (this.hasStarted) throw new Error("Cannot add a task after the Clujo has started.");
    this.taskGraphBuilder.addTask({
      id: input.taskId,
      execute: input.execute,
      errorHandler: input.errorHandler,
      retryPolicy: input.retryPolicy ?? this.retryPolicy,
      dependencies: input.dependencies as string[] | undefined,
    });
    return this as unknown as IClujo<
      TDependencies,
      TContext & { [K in TTaskId]: TExecuteReturn extends void ? undefined : TExecuteReturn },
      TTaskMap & {
        [K in TTaskId]: ITask<
          TDependencies,
          TExecuteReturn,
          TContext & { [K in TTaskId]: TExecuteReturn extends void ? undefined : TExecuteReturn }
        >;
      }
    >;
  }

  start(options?: StartOptions<TContext>): IClujo<TDependencies, TContext, TTaskMap> {
    if (this.hasStarted) throw new Error("Cannot start a Clujo that has already been started.");
    if (!this.taskGraphBuilder.size) throw new Error("Cannot start a Clujo with no added tasks.");
    // run the topological sort when starting as this is now a finalized task graph (graph invoked with trigger before start may no longer be valid)
    this.taskGraph = this.taskGraphBuilder.build();
    const redis = options?.redis;

    const executeTasksAndCompletionHandler = async () => {
      if (!this.taskGraph) throw new Error("Task graph not initialized");
      const finalContext = await this.taskGraph.run();
      if (options?.completionHandler) await options.completionHandler(finalContext);
    };

    const handler = async () => {
      try {
        if (!redis) {
          await executeTasksAndCompletionHandler();
        } else {
          await using lock = await this.tryAcquire(redis, options?.options);
          if (lock) {
            await executeTasksAndCompletionHandler();
          }
        }
      } catch (error) {
        console.error(`Clujo ${this.id} failed: ${error}`);
      }
    };
    this.cron.start(handler);
    this.hasStarted = true;
    if (this.runImmediately) this.trigger();
    return this;
  }

  async stop(): Promise<void> {
    if (!this.hasStarted) throw new Error("Cannot stop a Clujo that has not been started.");
    await this.cron.stop();
  }

  async trigger(): Promise<Required<TContext>> {
    if (!this.taskGraphBuilder.size) throw new Error("Cannot trigger a Clujo with no added tasks.");
    if (!this.taskGraph) this.taskGraph = this.taskGraphBuilder.build();
    return await this.taskGraph.run();
  }

  private async tryAcquire(redis: Redis, lockOptions: LockOptions | undefined): Promise<ILock | null> {
    const mutex = new Mutex(redis, this.id, lockOptions);
    const lock = await mutex.tryAcquire();
    if (!lock) return null;
    return {
      mutex,
      [Symbol.asyncDispose]: async () => {
        try {
          await mutex.release();
        } catch (error) {
          console.error(`Error releasing lock for Clujo ${this.id}: ${error}`);
        }
      },
    };
  }
}
