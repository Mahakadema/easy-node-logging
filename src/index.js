
import chalk from "chalk";
import { createWriteStream, WriteStream } from "fs";
import { homedir } from "os";
import { stringifySafe } from "simple-safe-stringify";
import { inspect } from "util";
import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";

export class LoggerFactory {
    /**
     * @param {import(".").ParsedTarget[]} targets
     */
    constructor(targets) {
        this.targets = targets;
        this.maxSourceLength = 0;
        this.destroyed = false;
    }

    createLogger(source, sourceColor = null) {
        if (this.destroyed)
            throw new Error("LoggerFacotry has been destroyed");

        let color = sourceColor;
        if (Array.isArray(color)) {
            if (!color.every(v => typeof v === "number" && v >= 0 && v < 256) || color.length !== 3)
                throw new TypeError(`Expected sourceColor to be an array of 3 numbers between 0 and 255, but received ${color} instead`);
            color = (color[0] << 16) + (color[1] << 8) + color[2];
        }
        if (typeof color === "number") {
            if (!(color >= 0 && color < (1 << 24)))
                throw new RangeError(`Expected sourceColor to be in range 0 to 16777215, but received ${color} instead`)
            color = color.toString(16).padStart(6, "0");
        }
        if (color && color.startsWith("#"))
            color = color.slice(1);
        if (color && !/^[0-9a-fA-F]{6}$/.test(color))
            throw new RangeError(`Expected sourceColor to be a hex string of length 6, but received '${color}' instead`);

        color = color ? chalk.hex(color) : noColor;

        if (source.length > this.maxSourceLength)
            this.maxSourceLength = source.length;

        const logger = new Logger(source, color, this);
        return logger;
    }

    destroy() {
        this.destroyed = true;
        this.targets.filter(v => v.type === "STREAM").forEach(v => v.stream.destroy());
        this.targets = null;
    }
}

export class Logger {
    constructor(source, color, manager) {
        this.source = source;
        this.color = color;
        this.manager = manager;
    }

    get destroyed() {
        return this.manager.destroyed;
    }

    trace(...messages) {
        return _log(this.manager.targets, messages, 6, this, this.manager.maxSourceLength)
    }

    debug(...messages) {
        return _log(this.manager.targets, messages, 5, this, this.manager.maxSourceLength);
    }

    info(...messages) {
        return _log(this.manager.targets, messages, 4, this, this.manager.maxSourceLength);
    }

    warn(...messages) {
        return _log(this.manager.targets, messages, 3, this, this.manager.maxSourceLength);
    }

    error(...messages) {
        return _log(this.manager.targets, messages, 2, this, this.manager.maxSourceLength);
    }

    fatal(...messages) {
        return _log(this.manager.targets, messages, 1, this, this.manager.maxSourceLength);
    }
}

/**
 * @param {import(".").ParsedTarget[]} targets
 * @param {any[]} messages
 * @param {number} level
 * @param {Logger} logger
 * @param {number} maxSourceLength
 */
function _log(targets, messages, level, logger, maxSourceLength) {
    if (logger.destroyed)
        throw new Error("Logger has been destroyed");
    const timestamp = Date.now();
    return Promise.all(targets.map((v, i) => {
        if (v.level < level)
            return;
        return (async () => {
            const content = format(messages, level, logger.source, logger.color, v.uniform, maxSourceLength, v.format, v.color, timestamp, v.fullTimestamps);
            try {
                switch (v.type) {
                    case "STREAM":
                        return await writeToStream(v.stream, content)
                    case "FUNCTION":
                        return await v.func(content);
                    case "HTTP":
                        return await postRequest(false, v.url, content, v.options);
                    case "HTTPS":
                        return await postRequest(true, v.url, content, v.options);
                }
            } catch (e) {
                switch (v.errorPolicy) {
                    case "THROW":
                        throw e;
                    case "LOG":
                        if (!logger.destroyed) {
                            return _log(targets.map(v => ({ ...v, errorPolicy: "IGNORE" })), [`Failed to log to target ${i}:`, { error: e, messages }], 2, logger, maxSourceLength);
                        }
                }
            };
        })();
    }).filter(v => v));
}

/**
 * @param {any[]} messages
 * @param {number} level
 * @param {string} source
 * @param {Function} sourceColor
 * @param {boolean} uniform
 * @param {number} maxSourceLength
 * @param {"TEXT" | "JSON"} format
 * @param {boolean} color
 * @param {number} timestamp
 * @param {boolean} fullTimestamps
 */
function format(messages, level, source, sourceColor, uniform, maxSourceLength, format, color, timestamp, fullTimestamps) {
    const levels = {
        1: "FATAL",
        2: "ERROR",
        3: "WARN",
        4: "INFO",
        5: "DEBUG",
        6: "TRACE"
    };
    const maxCategoryLength = 5;
    if (format === "JSON") {
        return stringifySafe({
            timestamp: timestamp,
            level: levels[level],
            source: source,
            msg: messages
        }, (k, v) => {
            if (v instanceof Error) {
                const error = {};
                Object.getOwnPropertyNames(v).forEach(name => error[name] = v[name]);
                return error;
            }
            return v;
        });
    } else {
        // console.log(messages, level, source, sourceColor, uniform, maxSourceLength, format, color, timestamp, fullTimestamps);
        let msg = null;
        const styledSource = (color ? sourceColor : noColor)(source.padEnd(uniform * maxSourceLength));
        switch (level) {
            case 6:
                const tracePrefix = `[${formatTime(timestamp, fullTimestamps)}] ${color ? chalk.blackBright("[") + chalk.gray(levels[level]) + chalk.blackBright("]") : "[" + levels[level] + "]"} ${"".padEnd((maxCategoryLength - levels[level].length) * uniform)}${color ? chalk.blackBright("[") + chalk.gray(styledSource) + chalk.blackBright("]") : "[" + styledSource + "]"} `;
                const traceContent = (color ? chalk.gray : noColor)(messages.map(v => typeof v === "string" ? v : inspect(v, false, null, color)).join(" "));
                msg = tracePrefix + traceContent.split("\n").join("\n" + tracePrefix);
                break;
            case 5:
                const debugPrefix = `[${formatTime(timestamp, fullTimestamps)}] ${color ? chalk.white("[") + chalk.whiteBright(levels[level]) + chalk.white("]") : "[" + levels[level] + "]"} ${"".padEnd((maxCategoryLength - levels[level].length) * uniform)}[${styledSource}] `;
                const debugContent = (color ? chalk.gray : noColor)(messages.map(v => typeof v === "string" ? v : inspect(v, false, null, color)).join(" "));
                msg = debugPrefix + debugContent.split("\n").join("\n" + debugPrefix);
                break;
            case 4:
                const infoPrefix = `[${formatTime(timestamp, fullTimestamps)}] ${color ? chalk.hex("#0B8E82")("[") + chalk.hex("#26E2D0")(levels[level]) + chalk.hex("#0B8E82")("]") : "[" + levels[level] + "]"} ${"".padEnd((maxCategoryLength - levels[level].length) * uniform)}[${styledSource}] `;
                const infoContent = messages.map(v => typeof v === "string" ? v : inspect(v, false, null, color)).join(" ");
                msg = infoPrefix + infoContent.split("\n").join("\n" + infoPrefix);
                break;
            case 3:
                const warnPrefix = `[${formatTime(timestamp, fullTimestamps)}] ${color ? chalk.yellow("[") + chalk.yellowBright(levels[level]) + chalk.yellow("]") : "[" + levels[level] + "]"} ${"".padEnd((maxCategoryLength - levels[level].length) * uniform)}${color ? chalk.yellow("[") + chalk.yellowBright(styledSource) + chalk.yellow("]") : "[" + styledSource + "]"} `;
                const warnContent = (color ? chalk.yellowBright : noColor)(messages.map(v => typeof v === "string" ? v : inspect(v, false, null, color)).join(" "));
                msg = warnPrefix + warnContent.split("\n").join("\n" + warnPrefix);
                break;
            case 2:
                const errorPrefix = `[${formatTime(timestamp, fullTimestamps)}] ${color ? chalk.hex("#9F0000")("[") + chalk.hex("#FF0000")(levels[level]) + chalk.hex("#9F0000")("]") : "[" + levels[level] + "]"} ${"".padEnd((maxCategoryLength - levels[level].length) * uniform)}${color ? chalk.hex("#9F0000")("[") + chalk.hex("#FF0000")(styledSource) + chalk.hex("#9F0000")("]") : "[" + styledSource + "]"} `;
                const errorContent = (color ? chalk.hex("#FF0000") : noColor)(messages.map(v => typeof v === "string" ? v : inspect(v, false, null, color)).join(" "));
                msg = errorPrefix + errorContent.split("\n").join("\n" + errorPrefix);
                break;
            case 1:
                const fatalPrefix = `[${formatTime(timestamp, fullTimestamps)}] ${(color ? chalk.bgRedBright : noColor)(`${color ? chalk.black("[") + chalk.hex("#0F0F0F")(levels[level]) + chalk.black("]") : "[" + levels[level] + "]"} ${"".padEnd((maxCategoryLength - levels[level].length) * uniform)}${color ? chalk.black("[") + chalk.hex("#0F0F0F")(styledSource) + chalk.black("]") : "[" + styledSource + "]"} `)}`;
                const fatalContent = (color ? chalk.hex("#0F0F0F").bgRedBright : noColor)(messages.map(v => typeof v === "string" ? v : inspect(v, false, null, color)).join(" "));
                msg = fatalPrefix + fatalContent.split("\n").join("\n" + fatalPrefix);
                break;
        }
        return msg;
    }
}

function formatTime(ms, full) {
    const date = new Date(ms);
    if (full) {
        return date.toISOString();
    } else {
        return `${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")}.${date.getUTCMilliseconds().toString().padStart(3, "0")}`
    }
}

function writeToStream(stream, content) {
    return new Promise((res, rej) => {
        stream.write(content + "\n", (err) => err ? rej(err) : res(null))
    });
}

/**
 * @type {import("http").RequestOptions}
 */
const postOptions = {
    method: "POST",
};

function postRequest(https, url, content, options) {
    return new Promise((resolve, reject) => {
        const functionToUse = https ? httpsRequest : httpRequest;
        const req = functionToUse(url, options, res => {
            let text = "";

            res.on("data", chunk => {
                text += chunk;
            });

            res.on("end", () => {
                if (!res.complete) {
                    reject(new Error("Connection closed before response was fully transmitted"));
                    return;
                }
                const result = {
                    status: res.statusCode,
                    headers: res.headers,
                    body: text
                }
                resolve(result);
            });

            res.on("error", e => {
                reject(e);
            });
        });

        req.on("error", e => {
            req.destroy();
            reject(e);
        });
        req.on("close", () => {
            req.destroy();
            reject(new Error("No response received"));
        });

        req.write(content);
        req.end();
    });
}

export async function createLoggerFactory(targets) {
    if (!Array.isArray(targets)) {
        targets = [targets];
    }

    const parsedTargets = [];

    for (const target of targets) {
        switch (target.type) {
            case "FILE":
                const stream = await createStream(target.path);
                parsedTargets.push({
                    type: "STREAM",
                    stream: stream,
                    ...baseTargetOptions(target)
                })
                break;
            case "STREAM":
                if (!(target.stream instanceof WriteStream))
                    throw new Error("stream must be a WriteStream");
                parsedTargets.push({
                    type: "STREAM",
                    stream: target.stream,
                    ...baseTargetOptions(target)
                });
                break;
            case "POST":
                parsedTargets.push({
                    type: (target.https ?? true) ? "HTTPS" : "HTTP",
                    url: target.url,
                    options: target.options ? { ...target.options, ...postOptions } : postOptions,
                    ...baseTargetOptions(target)
                });
                break;
            case "STDOUT":
                parsedTargets.push({
                    type: "FUNCTION",
                    func: console.log,
                    ...baseTargetOptions(target)
                });
                break;
            case "FUNCTION":
                if (!(target.function instanceof Function))
                    throw new Error("function must be a Function");
                parsedTargets.push({
                    type: "FUNCTION",
                    func: target.function,
                    ...baseTargetOptions(target)
                });
                break;
            default:
                throw new TypeError(`Invalid target type: ${target.type}`);
        }
    }

    const factory = new LoggerFactory(parsedTargets);

    return factory;
}

async function createStream(path) {
    if (typeof path === "string") {
        path = path.split("\\").join("/");
        if (path.startsWith("~/"))
            path = homedir().split("\\").join("/") + path.slice(1);
    } else if (!Buffer.isBuffer(path) && !(path instanceof URL)) {
        throw new Error("path must be a string");
    }

    const stream = await new Promise((resolve, reject) => {
        try {
            const ws = createWriteStream(path, { flags: "a" });
            ws.on("ready", () => resolve(ws));
        } catch (e) {
            reject(e);
        }
    });

    return stream;
}

function baseTargetOptions(target) {
    return {
        level: logLevelNum(target.logLevel),
        color: target.color || false,
        uniform: target.uniformLength || false,
        format: logStyle(target.style),
        fullTimestamps: target.fullTimestamps || false,
        errorPolicy: errorPolicy(target.errorPolicy)
    }
}

function logLevelNum(level) {
    const levels = {
        FATAL: 1,
        ERROR: 2,
        WARN: 3,
        INFO: 4,
        DEBUG: 5,
        TRACE: 6
    };
    if (level && levels[level] === undefined)
        throw new TypeError(`log level must be one of 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'. Received ${level} instead`);
    return levels[level] || levels.TRACE;
}

function logStyle(style) {
    switch (style) {
        case "JSON":
            return "JSON";
        case "TEXT":
            return "TEXT";
        case undefined:
        case null:
            return "TEXT";
        default:
            throw new TypeError("log style must be one of 'JSON', 'TEXT'");
    }
}

function errorPolicy(policy) {
    switch (policy) {
        case "THROW":
            return "THROW";
        case "LOG":
            return "LOG";
        case "IGNORE":
            return "IGNORE";
        case undefined:
        case null:
            return "LOG";
        default:
            throw new TypeError("error policy must be one of 'THROW', 'LOG' or 'IGNORE'");
    }
}

function url(url) {
    if (url instanceof URL) {
        return 
    }
}

const noColor = v => v;
