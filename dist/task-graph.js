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

// src/task-graph.ts
var task_graph_exports = {};
__export(task_graph_exports, {
  TaskGraph: () => TaskGraph
});
module.exports = __toCommonJS(task_graph_exports);

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

// src/task-graph.ts
var TaskGraph = class {
  constructor(taskDependencies, contextValueOrFactory, tasks, order) {
    this.taskDependencies = taskDependencies;
    this.contextValueOrFactory = contextValueOrFactory;
    this.tasks = tasks;
    this.order = order;
    this.context = new Context();
    this.run = async () => {
      if (this.order.length === 0) throw new Error("No tasks to run. Did you forget to call topologicalSort?");
      let value;
      if (this.contextValueOrFactory) {
        value = typeof this.contextValueOrFactory === "function" ? await this.contextValueOrFactory() : this.contextValueOrFactory;
      }
      this.context.reset(value);
      const completed = /* @__PURE__ */ new Set();
      const running = /* @__PURE__ */ new Map();
      const readyTasks = new Set(
        this.order.filter((taskId) => this.tasks.get(taskId)?.dependencies.length === 0)
      );
      const runTask = async (taskId) => {
        const task = this.tasks.get(taskId);
        if (!task) throw new Error(`Task ${taskId} not found`);
        try {
          const result = await task.run(this.taskDependencies, this.context.value);
          await this.context.update({ [taskId]: result });
          completed.add(taskId);
        } finally {
          running.delete(taskId);
          for (const [id, t] of this.tasks) {
            if (!completed.has(id) && !running.has(id) && t.dependencies.every((depId) => completed.has(depId))) {
              readyTasks.add(id);
            }
          }
        }
      };
      while (completed.size < this.tasks.size) {
        for (const taskId of readyTasks) {
          readyTasks.delete(taskId);
          const promise = runTask(taskId);
          running.set(taskId, promise);
        }
        if (running.size > 0) {
          await Promise.race(running.values());
        }
      }
      return this.context.value;
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TaskGraph
});
//# sourceMappingURL=task-graph.js.map