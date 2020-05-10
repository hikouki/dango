# dangosan

This is react-native library.

Background(foreground) job scheduling system.

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

## In the Future

- [ ] Retry.
- [ ] Async worker support.
