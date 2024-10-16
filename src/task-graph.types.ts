export type RetryPolicy = {
  maxRetries: number;
  retryDelayMs: number;
};

export interface TaskOptions<TTaskId extends string, TCommonInput, TContextInput, TReturn, TDependencies> {
  id: TTaskId;
  dependencies?: TDependencies[];
  retryPolicy?: RetryPolicy;
  execute: (input: { deps: TCommonInput; ctx: TContextInput }) => Promise<TReturn> | TReturn;
  errorHandler?: (err: Error, input: { deps: TCommonInput; ctx: TContextInput }) => Promise<void> | void;
}

export interface ITask<TCommonInput, TContextInput, TReturn> {
  id: string;
  dependencies: string[];
  addDependency(taskId: string): void;
  run(commonInput: TCommonInput, context: TContextInput): Promise<TReturn>;
}

export type TaskMap<TDependencies, TContext> = {
  // biome-ignore lint/suspicious/noExplicitAny: unknown return ahead of time
  [key: string]: ITask<TDependencies, TContext, any>;
};

export interface ITaskGraphBuilder<TDependencies, TContext> {
  // biome-ignore lint/complexity/noBannedTypes: any task map here
  finalizeSetup(): ITaskGraphBuilderHelper<TDependencies, TContext, {}>;
  setDependencies<TNewDependencies extends object>(
    value?: TNewDependencies,
  ): ITaskGraphBuilder<TNewDependencies, TContext>;
  setInitialContext<TNewContext extends object>(
    valueOrFactory?: TNewContext | (() => TNewContext | Promise<TNewContext>),
  ): ITaskGraphBuilder<TDependencies, TNewContext>;
}

export interface ITaskGraphBuilderHelper<TDependencies, TContext, TTaskMap extends TaskMap<TDependencies, TContext>> {
  addTask<TTaskId extends string, TReturn>(
    options: TaskOptions<TTaskId, TDependencies, TContext, TReturn, keyof TTaskMap>,
  ): ITaskGraphBuilderHelper<
    TDependencies,
    TContext &
      Partial<{
        [K in TTaskId]: TReturn;
      }>,
    TTaskMap & {
      [K in TTaskId]: ITask<
        TDependencies,
        TContext &
          Partial<{
            [K in TTaskId]: TReturn;
          }>,
        TReturn
      >;
    }
  >;
  build(): ITaskGraph<TContext>;
  size: number;
}

export interface ITaskGraph<TContext> {
  run(): Promise<Required<TContext>>;
}
