import BackgroundTimer from "react-native-background-timer";
import { ThrottledError } from "./errors/ThrottledError";

export interface Worker {
  perform(): Promise<void>;
  terminate(): Promise<void>;
}

export interface Slot {
  worker: Worker;
  onCompleted?: (slot: Slot) => void;
}

interface Queue {
  status: "idle" | "running";
  slots: Slot[];
  runningWorker: Worker | null;
  slotSize: number | null;
}

interface Lane {
  [key: string]: Queue;
}

export interface DangosanOption {
  interval: number;
}

interface Props {
  options?: DangosanOption;
}

export class Dangosan {
  private readonly lane: Lane;
  private readonly options: DangosanOption;

  constructor(props?: Props) {
    const attrs = props || {};
    this.lane = {};
    this.options = { interval: 3000, ...attrs.options };
  }

  enqueue(key: string, slot: Slot) {
    const lane = this.getQueue(key);
    if (this.filledQueue(key)) throw new ThrottledError();
    lane.slots.push(slot);
  }

  dequeue(key: string): Slot | undefined {
    return this.lane[key].slots.shift();
  }

  perform() {
    BackgroundTimer.runBackgroundTimer(
      this.execute.bind(this),
      this.options.interval
    );
  }

  private filledQueue(key: string): boolean {
    const lane = this.getQueue(key);
    if (lane.slotSize === null) return false;
    const workerCnt = (lane.runningWorker ? 1 : 0) + lane.slots.length;
    return workerCnt >= lane.slotSize;
  }

  private getQueue(key: string) {
    return this.lane[key] || this.buildQueue(key);
  }

  private buildQueue(key: string): Queue {
    const newQueue: Queue = {
      status: "idle",
      slots: [],
      runningWorker: null,
      slotSize: null,
    };

    this.lane[key] = newQueue;
    return newQueue;
  }

  private execute() {
    Object.keys(this.lane).forEach(async (key) => {
      const queue = this.lane[key];

      if (queue.status !== "idle") {
        return;
      }

      const slot = this.dequeue(key);

      if (!slot) {
        return;
      }

      queue.runningWorker = slot.worker;
      queue.status = "running";

      await slot.worker.perform();

      queue.status = "idle";
      queue.runningWorker = null;

      if (slot.onCompleted) {
        slot.onCompleted(slot);
      }
    });
  }

  async terminateRunningWorker(key: string) {
    const lane = this.getQueue(key);
    if (lane.runningWorker) {
      await lane.runningWorker.terminate();
    }
  }
}
