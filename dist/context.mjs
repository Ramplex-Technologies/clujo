// src/context.ts
var Context = class {
  constructor(initialObject) {
    this.reset(initialObject);
    this.updateQueue = Promise.resolve();
  }
  get value() {
    return this.object;
  }
  reset(initialObject) {
    if (initialObject) {
      this.object = { initial: { ...initialObject } };
    } else {
      this.object = { initial: void 0 };
    }
  }
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
//# sourceMappingURL=context.mjs.map