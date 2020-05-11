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
  runningWorker: Slot | null;
  slotSize: number | null;
}

interface Lane {
  [key: string]: Queue;
}

export interface DangosanOption {
  interval?: number;
}

interface Props {
  options?: DangosanOption;
}

export class Dangosan {
  private readonly options: Required<DangosanOption>;
  private lane: Lane;

  constructor(props?: Props) {
    const attrs = props || {};
    this.lane = {};
    this.options = {
      interval: 3000,
      ...attrs.options,
    };
  }

  enqueue(key: string, slot: Slot) {
    const lane = this.getQueue(key);
    if (this.filledQueue(key)) throw new ThrottledError();
    lane.slots.push(slot);
  }

  dequeue(key: string): Slot | undefined {
    const queue = this.lane[key].slots.shift();
    return queue;
  }

  perform() {
    BackgroundTimer.runBackgroundTimer(
      this.execute.bind(this),
      this.options.interval
    );
  }

  private filledQueue(key: string): boolean {
    const queue = this.getQueue(key);
    if (queue.slotSize === null) return false;
    const workerCnt = (queue.runningWorker ? 1 : 0) + queue.slots.length;
    return workerCnt >= queue.slotSize;
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

      queue.runningWorker = slot;
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
      await lane.runningWorker.worker.terminate();
    }
  }
}
