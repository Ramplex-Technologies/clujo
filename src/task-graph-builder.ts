import { promisify } from "node:util";
import { TaskGraph } from "./task-graph";
import type {
  ITask,
  ITaskGraph,
  ITaskGraphBuilder,
  ITaskGraphBuilderHelper,
  RetryPolicy,
  TaskMap,
  TaskOptions,
  TaskStatus,
} from "./task-graph.types";

const sleep = promisify(setTimeout);

class Task<TCommonInput, TContextInput, TReturn> implements ITask<TCommonInput, TContextInput, TReturn> {
  private readonly _dependencies: string[] = [];
  private _retryPolicy: RetryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  private _status: TaskStatus = "pending";

  constructor(
    private readonly options: TaskOptions<string, TCommonInput, TContextInput, TReturn, string | number | symbol>,
  ) {
    if (options.retryPolicy) this._retryPolicy = options.retryPolicy;
  }

  public get id() {
    return this.options.id;
  }

  public get status() {
    return this._status;
  }

  public get dependencies() {
    return this._dependencies;
  }

  public addDependency(taskId: string) {
    this._dependencies.push(taskId);
  }

  public async run(deps: TCommonInput, ctx: TContextInput): Promise<TReturn> {
    // we retry maxRetries times on top of the initial attempt
    for (let attempt = 0; attempt < this._retryPolicy.maxRetries + 1; attempt++) {
      try {
        const result = await this.options.execute({ deps, ctx });
        this._status = "completed";
        return result;
      } catch (err) {
        if (attempt === this._retryPolicy.maxRetries) {
          console.error(`Task failed after ${attempt + 1} attempts: ${err}`);
          const error = err instanceof Error ? err : new Error(`Non error throw: ${String(err)}`);
          try {
            if (this.options.errorHandler) await this.options.errorHandler(error, { deps, ctx });
            else console.error(`Error in task ${this.options.id}: ${err}`);
          } catch (error) {
            console.error(`Error in task error handler for ${this.options.id}: ${error}`);
          }
          this._status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this._retryPolicy.maxRetries}): ${err}`);
        await sleep(this._retryPolicy.retryDelayMs);
      }
    }

    // This line should never be reached due to the for loop condition,
    // but TypeScript requires a return statement here
    throw new Error("Unexpected end of run method");
  }
}

export class TaskGraphBuilder<TDependencies, TContext extends object>
  implements ITaskGraphBuilder<TDependencies, TContext>
{
  private contextValueOrFactory: unknown = undefined;
  private dependencies!: TDependencies;

  finalizeSetup() {
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    return new TaskGraphBuilderHelper<TDependencies, TContext, {}>(
      this.dependencies,
      this.contextValueOrFactory as undefined | TContext | (() => TContext | Promise<TContext>),
    );
  }

  setDependencies<TNewDependencies>(value?: undefined | TNewDependencies) {
    this.dependencies = value as unknown as TDependencies;
    return this as unknown as ITaskGraphBuilder<TNewDependencies, TContext>;
  }

  setInitialContext<TNewContext extends object>(
    valueOrFactory?: undefined | TNewContext | (() => TNewContext | Promise<TNewContext>),
  ) {
    this.contextValueOrFactory = valueOrFactory;
    return this as unknown as ITaskGraphBuilder<TDependencies, TNewContext>;
  }
}

export class TaskGraphBuilderHelper<
  TDependencies,
  TContext extends object,
  TTaskMap extends TaskMap<TDependencies, TContext>,
> implements ITaskGraphBuilderHelper<TDependencies, TContext, TTaskMap>
{
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private readonly tasks: Map<string, ITask<TDependencies, TContext, any>> = new Map();
  private readonly order: string[] = [];

  constructor(
    private readonly dependencies: TDependencies,
    private readonly contextValueOrFactory: undefined | TContext | (() => TContext | Promise<TContext>),
  ) {}

  public get size() {
    return this.tasks.size;
  }

  build(): ITaskGraph<TContext> {
    this.topologicalSort();
    return new TaskGraph(this.dependencies, this.contextValueOrFactory, this.tasks, this.order);
  }

  addTask<TTaskId extends string, TReturn>(
    options: TaskOptions<TTaskId, TDependencies, TContext, TReturn, keyof TTaskMap>,
  ): ITaskGraphBuilderHelper<
    TDependencies,
    TContext & Partial<{ [K in TTaskId]: TReturn }>,
    TTaskMap & { [K in TTaskId]: ITask<TDependencies, TContext & Partial<{ [K in TTaskId]: TReturn }>, TReturn> }
  > {
    const taskId = options.id;
    if (this.tasks.has(taskId)) {
      throw new Error(`Task with id ${taskId} already exists`);
    }
    const task = new Task(options);
    this.tasks.set(taskId, task);

    for (const depId of options.dependencies ?? []) {
      if (typeof depId !== "string") throw new Error("Dependency ID must be a string");
      const dependentTask = this.tasks.get(depId);
      if (!dependentTask) throw new Error(`Dependency ${depId} not found for task ${taskId}`);
      task.addDependency(depId);
    }

    return this as unknown as ITaskGraphBuilderHelper<
      TDependencies,
      TContext & Partial<{ [K in TTaskId]: TReturn }>,
      TTaskMap & { [K in TTaskId]: ITask<TDependencies, TContext & Partial<{ [K in TTaskId]: TReturn }>, TReturn> }
    >;
  }

  private topologicalSort() {
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (taskId: string) => {
      if (temp.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      if (!visited.has(taskId)) {
        temp.add(taskId);
        const task = this.tasks.get(taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);

        for (const depId of task.dependencies) {
          visit(depId);
        }

        temp.delete(taskId);
        visited.add(taskId);
        this.order.push(taskId);
      }
    };

    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        visit(taskId);
      }
    }
  }
}
