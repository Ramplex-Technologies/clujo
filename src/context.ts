/* --------------------------------------------------------------------------

  MIT License

  Copyright (c) 2024 Rami Pellumbi

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
-----------------------------------------------------------------------------*/

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
