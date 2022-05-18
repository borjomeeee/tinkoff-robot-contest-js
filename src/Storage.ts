export interface DataProvider {
  get: <T>(key: string) => T;
  set: (key: string, data: any) => void;
}
