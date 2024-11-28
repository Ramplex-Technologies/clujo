// src/error.ts
var TaskError = class extends Error {
  id;
  error;
  constructor(id, error) {
    super(`Task ${id} failed: ${error.message}`);
    this.id = id;
    this.error = error;
    this.name = "TaskError";
  }
};
export {
  TaskError
};
//# sourceMappingURL=error.mjs.map