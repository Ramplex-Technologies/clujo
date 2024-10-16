import { Context } from "./context";
import type { ITask, ITaskGraph } from "./task-graph.types";

export class TaskGraph<TDependencies, TContext extends object> implements ITaskGraph<TContext> {
  private readonly context: Context<TContext> = new Context<TContext>();

  constructor(
    private readonly taskDependencies: TDependencies,
    private readonly contextValueOrFactory: undefined | TContext | (() => TContext | Promise<TContext>),
    private readonly tasks: Map<string, ITask<TDependencies, TContext, unknown>>,
    private readonly order: string[],
  ) {}

  run = async (): Promise<Required<TContext>> => {
    if (this.order.length === 0) throw new Error("No tasks to run. Did you forget to call topologicalSort?");
    let value: TContext | undefined;
    if (this.contextValueOrFactory) {
      value =
        typeof this.contextValueOrFactory === "function"
          ? await this.contextValueOrFactory()
          : this.contextValueOrFactory;
    }
    this.context.reset(value);

    const completed = new Set<string>();
    const running = new Map<string, Promise<void>>();
    const readyTasks = new Set<string>(
      this.order.filter((taskId) => this.tasks.get(taskId)?.dependencies.length === 0),
    );

    const runTask = async (taskId: string) => {
      const task = this.tasks.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      try {
        const result = await task.run(this.taskDependencies, this.context.value);
        await this.context.update({ [taskId]: result });
        completed.add(taskId);
      } catch {
        // completed in the sense that we won't try to run it again
        completed.add(taskId);
      } finally {
        running.delete(taskId);

        // Check if any dependent tasks are now ready to run
        for (const [id, t] of this.tasks) {
          if (!completed.has(id) && !running.has(id)) {
            const canRun = t.dependencies.every((depId) => {
              const depTask = this.tasks.get(depId);
              return depTask && completed.has(depId) && depTask.status === "completed";
            });
            if (canRun) readyTasks.add(id);
          }
        }
      }
    };

    while (completed.size < this.tasks.size) {
      // Start all ready tasks
      for (const taskId of readyTasks) {
        readyTasks.delete(taskId);
        const promise = runTask(taskId);
        running.set(taskId, promise);
      }

      // Wait for at least one task to complete
      if (running.size > 0) {
        await Promise.race(running.values());
      } else {
        // no tasks are running and we have not completed all tasks
        // happens when tasks could not run due to failed dependencies
        break;
      }
    }

    return this.context.value as Required<TContext>;
  };
}
