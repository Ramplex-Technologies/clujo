"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cron.ts
var cron_exports = {};
__export(cron_exports, {
  Cron: () => Cron
});
module.exports = __toCommonJS(cron_exports);
var import_croner = __toESM(require("croner"));
var Cron = class {
  constructor(cronExpression, cronOptions) {
    this.cronExpression = cronExpression;
    this.cronOptions = cronOptions;
    this.job = null;
  }
  start(handler) {
    if (this.job) throw new Error("Attempting to start an already started job");
    this.job = new import_croner.default(this.cronExpression, this.cronOptions, handler);
  }
  stop() {
    return new Promise((resolve) => {
      const checkAndStop = () => {
        if (this.job?.isBusy()) setTimeout(checkAndStop, 100);
        else {
          this.job?.stop();
          resolve();
        }
      };
      checkAndStop();
    });
  }
  async trigger() {
    if (!this.job) throw new Error("Attempting to trigger a non-started job");
    await this.job.trigger();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Cron
});
//# sourceMappingURL=cron.js.map