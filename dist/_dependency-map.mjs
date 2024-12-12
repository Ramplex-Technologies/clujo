// src/_dependency-map.ts
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
export {
  DependencyMap
};
//# sourceMappingURL=_dependency-map.mjs.map