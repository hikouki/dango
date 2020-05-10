import BackgroundTimer from "react-native-background-timer";
import { ThrottledError } from "./errors/ThrottledError";
import { Storage } from "./storages/Storage";
import { OnMemoryStorage } from "./storages/OnMemoryStorage";

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
  storage?: Storage;
  storageKey?: string;
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
      storage: new OnMemoryStorage(),
      storageKey: "#dangosan",
      ...attrs.options,
    };
  }

  async enqueue(key: string, slot: Slot) {
    const lane = this.getQueue(key);
    if (this.filledQueue(key)) throw new ThrottledError();
    lane.slots.push(slot);
    await this.saveLane();
  }

  async dequeue(key: string): Promise<Slot | undefined> {
    const queue = this.lane[key].slots.shift();
    await this.saveLane();
    return queue;
  }

  async perform() {
    await this.restore();

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

  private storage() {
    return this.options.storage;
  }

  private async restore() {
    const lane: Lane =
      JSON.parse(await this.storage().getItem(this.options.storageKey)) || {};

    this.lane = Object.keys(lane).reduce((sum, key) => {
      const queue = { ...lane[key] };
      if (queue.status === "running" && queue.runningWorker) {
        queue.slots.unshift(queue.runningWorker);
        queue.runningWorker = null;
        queue.status = "idle";
      }
      return { ...sum, [key]: queue };
    }, {});
  }

  private async saveLane() {
    await this.storage().setItem(
      this.options.storageKey,
      JSON.stringify(this.lane)
    );
  }

  private getQueue(key: string) {
    return this.lane[key] || this.buildQueue(key);
  }

  private async buildQueue(key: string): Promise<Queue> {
    const newQueue: Queue = {
      status: "idle",
      slots: [],
      runningWorker: null,
      slotSize: null,
    };

    this.lane[key] = newQueue;

    return newQueue;
  }

  private async execute() {
    Object.keys(this.lane).forEach(async (key) => {
      const queue = this.lane[key];

      if (queue.status !== "idle") {
        return;
      }

      const slot = await this.dequeue(key);

      if (!slot) {
        return;
      }

      queue.runningWorker = slot;
      queue.status = "running";

      await this.saveLane();

      await slot.worker.perform();

      queue.status = "idle";
      queue.runningWorker = null;

      if (slot.onCompleted) {
        slot.onCompleted(slot);
      }

      await this.saveLane();
    });
  }

  async terminateRunningWorker(key: string) {
    const lane = await this.getQueue(key);
    if (lane.runningWorker) {
      await lane.runningWorker.worker.terminate();
    }
  }
}
