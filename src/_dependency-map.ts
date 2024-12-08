export class DependencyMap {
    readonly #dependencies: Record<string, string[]> = Object.create(null);

    add(key: string, value: string) {
        if (!this.#dependencies[key]) {
            this.#dependencies[key] = [];
        }
        this.#dependencies[key].push(value);
    }

    get(key: string) {
        return this.#dependencies[key] ?? [];
    }
}
