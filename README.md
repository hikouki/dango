# dangosan

This is react native library.

Background(foreground) job scheduling system on memory.

Did not complete jobs in the foreground will also continue running in the background.

## Dependencies

- [react-native-background-timer](https://github.com/ocetnik/react-native-background-timer)
- [react-native-background-job](https://github.com/vikeri/react-native-background-job)

## How to use

Please install.

```
yarn add dangosan react-native-background-timer react-native-background-job
```

Let's run dangosan.

```typescript
import { Dangosan } from 'dangosan';
...

React.useEffect(() => {
  const dango = new Dangosan({
    interval: 3000,
    queue: {
      greeting: {
        slotSize: 1
      }
    }
  });

  dango.start();
  dango.enqueue('greeting', {
    worker: {
      perform: () => {
        console.log('hello');
      }
    }
  });
}, []);
```

## Options

|option| type | default | description |
|------|------|---------|-------------|
|interval|number?| 3000 | How often to monitor the queue. |
|queue[key].slotSize|number?| null | enqueue limit size. |

## Methods

| if                    | args                       |               description |
|-----------------------|----------------------------|---------------------------|
|start                |                            | Run job schedule. |
|stop                |                            | Stop job schedule. |
|enqueue                | key: string, slot: Slot    | Add job. |
|dequeue                | key: string                | Delete job.  |
|terminateRunningWorker | key: string                | terminate running worker. |
|addEventListener       | key: string, event: typeof SUPPORTED_EVENTS[number], EventListener | add event listener. |
|removeEventListener    | key: string, event: typeof SUPPORTED_EVENTS[number], EventListener | remove event listener. |


## Type definitions

- Slot

```typescript
export interface Slot {
  worker: Worker;
}
```

- Worker

```typescript
export interface Worker {
  perform(): Promise<void>;
  terminate(): Promise<void>;
}
```

- SUPPORTED_EVENTS

```typescript
const SUPPORTED_EVENTS = ["run", "success", "fail", "done"] as const;
```

- EventListener

```typescript
type EventListener = (slot: Slot) => void;
```
