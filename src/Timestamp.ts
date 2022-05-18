export interface Timestamp {
  seconds: number;
  nanos: number;
}

export class TimestampUtils {
  static fromDate(date: Date): Timestamp {
    const time = date.getTime();
    const seconds = time / 1000;

    return { seconds: Math.floor(seconds), nanos: 0 };
  }

  static toDate(timestamp: Timestamp) {
    const nanos = +timestamp.nanos.toString().slice(0, 3);
    return new Date(timestamp.seconds * 1000 + nanos);
  }
}
