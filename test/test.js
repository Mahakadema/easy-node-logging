
import { createLoggerFactory } from "../src/index.js";
import { createWriteStream, unlinkSync, readFileSync, readdirSync } from "fs";
import assert from "assert";
import { createServer } from "http";

// remove old files
for (const file of readdirSync("./test/out/")) {
    unlinkSync(`./test/out/${file}`);
}

async function test(name, fn) {
    let res;
    try {
        res = await fn();
        if (res === undefined) {
            console.log(`[PASSED] ${name}`);
        } else {
            console.log(`[PASSED] ${name}:`, res);
        }
    } catch (e) {
        console.log(`[FAILED] ${name}:`, e);
    }
}

// server for http requests
let httpReceivedData = "";
const server = createServer({}, (req, res) => {
    console.log(req.method, req.url, req.headers);
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
        httpReceivedData += body + "\n";
        console.log("REQUEST END", body);
    });
    req.on("error", e => console.log("Server request error:", e));
    res.writeHead(201);
    res.end();
});
server.listen(80);

const ws = await new Promise((resolve, reject) => {
    try {
        const ws = createWriteStream("./test/out/stream_target.log", { flags: "ax" });
        ws.on("ready", () => resolve(ws));
    } catch (e) {
        reject(e);
    }
});

const loggerFactory = await createLoggerFactory([
    {
        type: "FILE",
        path: `./test/out/file_target.log`,
        errorListener: console.error,
        failIfExists: true,
        color: false,
        errorPolicy: "LOG",
        fullTimestamps: true,
        logLevel: "TRACE",
        style: "JSON",
        uniformLength: false
    },
    {
        type: "STDOUT",
        color: true,
        uniformLength: true
    },
    {
        type: "FUNCTION",
        function: () => null,
        color: true,
        uniformLength: true
    },
    {
        type: "STREAM",
        stream: ws,
        color: false,
        fullTimestamps: true,
        style: "TEXT",
        logLevel: "WARN"
    },
    {
        type: "POST",
        url: "http://localhost:80/log",
        https: false,
        style: "JSON",
        logLevel: "FATAL"
    },
    {
        type: "FILE",
        path: `./test/out/invalid/file_target.log`,
        errorListener: () => null,
    },
]);

const circularObject = {
    a: [
        { b: [null] },
        null
    ]
};
circularObject.a[0].b[0] = circularObject.a[0];
circularObject.a[1] = circularObject.a[0].b;

const promises = [];

const logger1 = loggerFactory.createLogger("component1", null, "#FFFF00");
const logger2 = loggerFactory.createLogger("component2", null, 0x00ffff);
const logger3 = loggerFactory.createLogger("component3", null, [255, 0, 206]);
const logger4 = loggerFactory.createLogger("component4looong");
const logger5 = loggerFactory.createLogger("components", "longgg", "888800");

promises.push(logger1.trace("Trace", "stuff"));
promises.push(logger1.debug("Debug", global));
promises.push(logger2.info("Info", { bool: false, undef: undefined }));
promises.push(logger3.warn("Warn", ["with", "arrays"], 42, circularObject));
promises.push(logger4.error("Error", new SyntaxError("Something failed")));
promises.push(logger5.fatal("Fatal", 1, undefined, null));

await Promise.all(promises);

await test("Invalid loggers fail", () => {
    assert.throws(() => loggerFactory.createLogger("component1", null, "#FFFF0"));
    assert.throws(() => loggerFactory.createLogger("component1", null, 0x1000000));
    assert.throws(() => loggerFactory.createLogger("component1", null, [256, 0, 206]));
    assert.throws(() => loggerFactory.createLogger("component1", "part1", [255, 0]));
    loggerFactory.destroy();
});

loggerFactory.destroy();

await test("JSON logs are as expected", () => {
    const lines = readFileSync("./test/out/file_target.log", "utf-8").split("\n").slice(0, -1);
    // console.log(fileContent);
    assert.doesNotThrow(() => lines.map(v => JSON.parse(v)));
    assert(lines.length === 12, `${lines.length} lines in log`);
});

await test("Text logs are as expected", () => {
    const lines = readFileSync("./test/out/stream_target.log", "utf-8").split("\n").slice(0, -1);
    // console.log(fileContent);
    lines.forEach((v, i) => {
        assert.match(v, /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[(WARN|ERROR|FATAL)\]  ?\[component.*\] .*$/, `Line ${i} did not pass`);
    });
    assert(lines.length === 127, `${lines.length} lines in log`);
});

await test("HTTP requests sent", () => {
    server.close();
    const validHttpDataRegex = /^{"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","level":"FATAL","component":"components","source":"longgg","msg":\["Fatal",1,"undefined",null\]}\n{"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","level":"FATAL","component":"components","source":"longgg","msg":\["Failed to log to target 5:",{"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","level":"FATAL","messages":\["Fatal",1,"undefined",null\],"error":{.*}}\]}\n$/;
    assert.match(httpReceivedData, validHttpDataRegex);
});
