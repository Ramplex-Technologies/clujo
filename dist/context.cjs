"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/context.ts
var context_exports = {};
__export(context_exports, {
  Context: () => Context
});
module.exports = __toCommonJS(context_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Context
});
//# sourceMappingURL=context.cjs.map