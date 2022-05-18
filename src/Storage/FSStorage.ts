// @ts-ignore
import Storage from "node-storage";
import { DataProvider } from "../Storage";

export class FSStorage implements DataProvider {
  private storage: Storage;

  constructor(path: string) {
    this.storage = new Storage(path);
  }

  get(key: string): any {
    return this.storage.get(key);
  }

  set(key: string, data: string) {
    this.storage.set(key, data);
  }
}
