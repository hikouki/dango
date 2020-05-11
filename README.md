# dangosan

This is react native library.

Background(foreground) job scheduling system on memory.

Did not complete jobs in the foreground will also continue running in the background.

## Dependencies

- [react-native-background-timer](https://github.com/ocetnik/react-native-background-timer)

## How to use

Please install.

```
yarn add dangosan react-native-background-timer
```

Let's run dangosan.

```typescript
import { Dangosan } from 'dangosan';
...

React.useEffect(() => {
  const dango = new Dangosan();
  dango.perform();
  dango.enqueue('greeting', {
    onCompleted: () => {
      console.log('hi!');
    },
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
|interval|number?| 3000 | How often to monitor the queue |

## Methods

| if                    | args        |               description |
|-----------------------|-------------|---------------------------|
|perform                |             | Run job schedule. |
|enqueue | key: string, slot: Slot    | Add job. |
|dequeue | key: string                | Delete job.  |
|terminateRunningWorker | key: string | terminate running worker. |

## Type definitions

- Slot

```typescript
export interface Slot {
  worker: Worker;
  onCompleted?: (slot: Slot) => void;
}
```

- Worker

```typescript
export interface Worker {
  perform(): Promise<void>;
  terminate(): Promise<void>;
}
```
