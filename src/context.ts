/**
 * Used to allow for the sharing of state between tasks.
 */
export class Context<TInitial, TContext> {
  private object!: { initial: TInitial | undefined } & TContext;
  private updateQueue: Promise<void>;

  constructor(initialValue?: TInitial) {
    this.reset(initialValue);
    this.updateQueue = Promise.resolve();
  }

  /**
   * Gets the current state of the managed object.
   */
  public get value(): { initial: TInitial | undefined } & TContext {
    return this.object;
  }

  /**
   * Resets the context to its initial state or a new initial object.
   */
  public reset(initialValue: TInitial | undefined): void {
    if (initialValue !== undefined && initialValue !== null) {
      this.object = { initial: initialValue } as {
        initial: TInitial;
      } & TContext;
    } else {
      this.object = { initial: undefined } as {
        initial: TInitial | undefined;
      } & TContext;
    }
  }

  /**
   * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
   */
  public update<NewValue extends object>(updateValue: NewValue): Promise<void> {
    this.updateQueue = this.updateQueue.then(() => {
      // overrides won't happen with how this is used since
      // the initial context is under the key "initial"
      // and all task results are under the unique id of that task
      this.object = { ...this.object, ...updateValue };
      return Promise.resolve();
    });
    return this.updateQueue;
  }
}
