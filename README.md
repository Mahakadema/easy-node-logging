# easy-node-logging
A simple solution to logging in Node. Meant to ease debugging of deployments of various scales.

### Usage
1. Install the package `npm i easy-node-logging`
2. Import the module in your project
```js
import { createLoggerFactory } from "easy-node-logging";
```
3. Set up your loggers and targets
```js
const factory = await createLoggerFactory([
    { type: "STDOUT", color: true },
    { type: "FILE", path: `~/application/logs/all.log`, style: "JSON" },
    { type: "FILE", path: `~/application/logs/error.log`, style: "JSON" level: "ERROR" }
]);
const loggerNetwork = factory.createLogger("NETWORK");
const loggerUsers = factory.createLogger("USERS");
```
4. Log easily, comfortably, and safe
```js
loggerNetwork.info("New connection:", remote);
loggerUsers.error("Couldn't authenticate user:", username, reason);
loggerNetwork.warn("Connection closed:", remote, reason);
// in STDOUT
// [17:42:55.642] [INFO] [NETWORK] New connection: 85.184.244.97:56909
// [17:42:56.055] [ERROR] [USERS] Couldn't authenticate user: John Doe USER_NOT_FOUND
// [17:42:56.072] [WARN] [NETWORK] Connection closed: 85.184.244.97:56909 Disconnected
// in all.log
// {"timestamp":1677355019642,"level":"INFO","source":"NETWORK","msg":["New connection:","85.184.244.97:56909"]}
// {"timestamp":1677355020055,"level":"ERROR","source":"USERS","msg":["Couldn't authenticate user:","John Doe","USER_NOT_FOUND"]}
// {"timestamp":1677355020072,"level":"WARN","source":"NETWORK","msg":["Connection closed:","85.184.244.97:56909","Disconnected"]}
// in error.log
// {"timestamp":1677355020055,"level":"ERROR","source":"USERS","msg":["Couldn't authenticate user:","John Doe","USER_NOT_FOUND"]}
```
