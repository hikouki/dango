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
  debug?: boolean;
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
      interval: 900000,
      queue: {},
      debug: false,
      ...attrs.options,
    };

    this.eventHandlers = {};
  }

  enqueue(key: string, slot: Slot) {
    this.debugLog("enqueue", "key", key, "slot", slot);
    const lane = this.getQueue(key);
    if (this.filledQueue(key)) throw new ThrottledError();
    lane.slots.push(slot);

    this.start();
  }

  dequeue(key: string): Slot | undefined {
    const slot = this.lane[key].slots.shift();
    this.debugLog(
      "dequeue",
      "key",
      key,
      "slot",
      slot,
      "queue",
      this.lane[key].slots
    );
    return slot;
  }

  setup() {
    this.debugLog("setup");
    if (Platform.OS === "android") {
      BackgroundJob.register({
        jobKey: "dangosan",
        job: this.execute.bind(this),
      });
    }
  }

  private start() {
    this.debugLog("start");
    if (Platform.OS === "android") {
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
    this.debugLog("stop");
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
      this.debugLog("terminated worker", "key", key);
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
    this.debugLog("begin execute.");
    await Promise.all(
      Object.keys(this.lane).map(async (key) => {
        const queue = this.lane[key];

        if (queue.status !== "idle") {
          this.debugLog("skip. queue is running.", "key", key);
          return;
        }

        const slot = this.dequeue(key);

        if (!slot) {
          this.debugLog("skip. queue is empty.", "key", key);
          return;
        }

        queue.runningWorker = slot;
        queue.status = "running";

        const runEventListeners = this.listenEventListeners(key, "run");
        runEventListeners.forEach((it) => it(slot));

        try {
          this.debugLog(
            "begin worker.perform",
            "key",
            key,
            "worker",
            slot.worker
          );
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

        this.debugLog("end worker.perform", "key", key, "worker", slot.worker);

        const doneEventListeners = this.listenEventListeners(key, "done");
        doneEventListeners.forEach((it) => it(slot));
      })
    );

    const allSlotCounts = Object.values(this.lane)
      .map((it) => it.slots.length)
      .reduce((a, b) => a + b, 0);

    if (allSlotCounts === 0) {
      this.debugLog("all queue is empty.");
      await this.stop();
      return;
    }

    this.debugLog("end execute.");
    setTimeout(() => {
      this.execute();
    }, 300);
  }

  private debugLog(...args: any[]) {
    if (this.options.debug) {
      console.log("[Dangosan]", args);
    }
  }
}
