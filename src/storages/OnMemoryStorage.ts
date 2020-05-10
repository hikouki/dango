import { Storage } from "./Storage";

interface Store {
  [key: string]: string;
}

export class OnMemoryStorage implements Storage {
  private readonly store: Store;

  constructor() {
    this.store = {};
  }

  async getItem(key: string) {
    return this.store[key];
  }

  async setItem(key: string, value: string) {
    this.store[key] = value;
  }

  async removeItem(key: string) {
    delete this.store[key];
  }
}
