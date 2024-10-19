// src/_context.ts
var Context = class {
  object;
  updateQueue;
  constructor(initialValue) {
    this.reset(initialValue);
    this.updateQueue = Promise.resolve();
  }
  /**
   * Gets the current state of the managed object.
   */
  get value() {
    return this.object;
  }
  /**
   * Resets the context to its initial state or a new initial object.
   */
  reset(initialValue) {
    if (initialValue !== void 0 && initialValue !== null) {
      this.object = { initial: initialValue };
    } else {
      this.object = { initial: void 0 };
    }
  }
  /**
   * Asynchronously updates the context with new values. Ensures that updates are applied in the order they are called.
   */
  update(updateValue) {
    this.updateQueue = this.updateQueue.then(() => {
      this.object = { ...this.object, ...updateValue };
      return Promise.resolve();
    });
    return this.updateQueue;
  }
};
export {
  Context
};
//# sourceMappingURL=_context.mjs.map