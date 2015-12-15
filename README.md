# simple-logger

Nice simple logger for Node. Has coloured output for TTY and ability to send messages to Logstash via UDP.

```bash
npm install nice-simple-logger
```

```javascript
var logger = require('simple-logger')({});

logger.log('hello', 'world');
logger.warn('hello', 'world');
logger.error(new Error('failed!'));
```


