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

// src/_dependency-map.ts
var dependency_map_exports = {};
__export(dependency_map_exports, {
  DependencyMap: () => DependencyMap
});
module.exports = __toCommonJS(dependency_map_exports);
var DependencyMap = class {
  #dependencies = /* @__PURE__ */ Object.create(null);
  add(key, value) {
    if (!this.#dependencies[key]) {
      this.#dependencies[key] = [];
    }
    this.#dependencies[key].push(value);
  }
  get(key) {
    return Object.freeze(this.#dependencies[key]?.slice() ?? []);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DependencyMap
});
//# sourceMappingURL=_dependency-map.js.map