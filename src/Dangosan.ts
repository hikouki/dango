import { Platform } from "react-native";
import BackgroundJob from "react-native-background-job";
import BackgroundTimer from "react-native-background-timer";
import { ThrottledError } from "./errors/ThrottledError";

export interface Worker {
  perform(): Promise<void>;
  terminate(): Promise<void>;
}

export interface Slot {
  worker: Worker;
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
  queue?: {
    [key: string]: {
      slotSize?: number;
    };
  };
}

type EventListener = (slot: Slot) => void;

type EventHandlers = {
  [key: string]: {
    [key in typeof SUPPORTED_EVENTS[number]]: Map<EventListener, EventListener>;
  };
};

interface Props {
  options?: DangosanOption;
}

const SUPPORTED_EVENTS = ["run", "success", "fail", "done"] as const;

export class Dangosan {
  private readonly options: Required<DangosanOption>;
  private readonly eventHandlers: EventHandlers;
  private lane: Lane;

  constructor(props?: Props) {
    const attrs = props || {};
    this.lane = {};
    this.options = {
      interval: 3000,
      queue: {},
      ...attrs.options,
    };

    this.eventHandlers = {};
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

  start() {
    if (Platform.OS === "android") {
      BackgroundJob.register({
        jobKey: "dangosan",
        job: this.execute.bind(this),
      });

      BackgroundJob.schedule({
        jobKey: "dangosan",
        period: this.options.interval,
        exact: true,
        allowExecutionInForeground: true,
      });
    } else {
      BackgroundTimer.runBackgroundTimer(
        this.execute.bind(this),
        this.options.interval
      );
    }
  }

  async stop() {
    if (Platform.OS === "android") {
      await BackgroundJob.cancel({ jobKey: "dangosan" });
    } else {
      BackgroundTimer.stopBackgroundTimer();
    }
  }

  async terminateRunningWorker(key: string) {
    const lane = this.getQueue(key);
    if (lane.runningWorker) {
      await lane.runningWorker.worker.terminate();
    }
  }

  addEventListener(
    key: string,
    event: typeof SUPPORTED_EVENTS[number],
    handler: EventListener
  ) {
    this.eventHandlersByKey(key)[event].set(handler, handler);
  }

  removeEventListener(
    key: string,
    event: typeof SUPPORTED_EVENTS[number],
    handler: EventListener
  ) {
    this.eventHandlersByKey(key)[event].delete(handler);
  }

  private listenEventListeners(
    key: string,
    event: typeof SUPPORTED_EVENTS[number]
  ): EventListener[] {
    return Array.from(this.eventHandlersByKey(key)[event].values());
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
    const queueOptions = this.options.queue[key];
    const newQueue: Queue = {
      status: "idle",
      slots: [],
      runningWorker: null,
      slotSize: queueOptions
        ? typeof queueOptions.slotSize !== "undefined"
          ? queueOptions.slotSize
          : null
        : null,
    };

    this.lane[key] = newQueue;

    return newQueue;
  }

  private eventHandlersByKey(key: string) {
    if (!this.eventHandlers[key]) {
      this.eventHandlers[key] = SUPPORTED_EVENTS.reduce(
        (handlers, key) => ({
          ...handlers,
          [key]: new Map(),
        }),
        {} as EventHandlers[number]
      );
    }

    return this.eventHandlers[key];
  }

  private async execute() {
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

      const runEventListeners = this.listenEventListeners(key, "run");
      runEventListeners.forEach((it) => it(slot));

      try {
        await slot.worker.perform();

        const completeEventListeners = this.listenEventListeners(
          key,
          "success"
        );
        completeEventListeners.forEach((it) => it(slot));
      } catch (e) {
        console.warn("failed to worker perform.", e);
        const failEventListeners = this.listenEventListeners(key, "fail");
        failEventListeners.forEach((it) => it(slot));
      }

      queue.status = "idle";
      queue.runningWorker = null;

      const doneEventListeners = this.listenEventListeners(key, "done");
      doneEventListeners.forEach((it) => it(slot));
    });
  }
}
