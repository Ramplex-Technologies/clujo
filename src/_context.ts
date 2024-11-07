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
    #object!: { initial: TInitial | undefined } & TContext;
    #updateQueue: Promise<void>;

    constructor(initialValue?: TInitial) {
        this.reset(initialValue);
        this.#updateQueue = Promise.resolve();
    }

    /**
     * Gets the current state of the managed object.
     */
    get value(): { initial: TInitial | undefined } & TContext {
        return this.#object;
    }

    /**
     * Resets the context to its initial state or a new initial object.
     */
    reset(initialValue: TInitial | undefined): void {
        if (initialValue !== undefined && initialValue !== null) {
            this.#object = deepFreeze({ initial: initialValue }) as {
                initial: TInitial;
            } & TContext;
        } else {
            this.#object = deepFreeze({ initial: undefined }) as {
                initial: TInitial | undefined;
            } & TContext;
        }
    }

    /**
     * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
     */
    update<NewValue extends object>(updateValue: NewValue): Promise<void> {
        this.#updateQueue = this.#updateQueue.then(() => {
            // overrides won't happen with how this is used since
            // the initial context is under the key "initial"
            // and all task results are under the unique id of that task
            this.#object = deepFreeze({ ...this.#object, ...updateValue });
            return Promise.resolve();
        });
        return this.#updateQueue;
    }
}

// prevent runtime modifications to the context
function deepFreeze<T extends object>(obj: T): Readonly<T> {
    const propNames = Reflect.ownKeys(obj) as (keyof T)[];

    for (const name of propNames) {
        const value = obj[name];
        if (value && typeof value === "object" && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    }

    return Object.freeze(obj);
}
