
export class Logger {
    constructor(source: string, color: Function, manager: LoggerFactory);

    /**
     * The specified source of the Logger
     */
    public source: string;
    /**
     * Whether this Logger has been destroyed
     */
    public destroyed: boolean;
    /**
     * The color function of this Logger
     */
    private color: Function;
    /**
     * The factory that instantiated this Logger
     */
    private manager: LoggerFactory;

    /**
     * Logs a TRACE level message
     * @param messages The objects to log
     */
    public trace(...messages: any[]): Promise<any>;
    /**
     * Logs a DEBUG level message
     * @param messages The objects to log
     */
    public debug(...messages: any[]): Promise<any>;
    /**
     * Logs a INFO level message
     * @param messages The objects to log
     */
    public info(...messages: any[]): Promise<any>;
    /**
     * Logs a WARN level message
     * @param messages The objects to log
     */
    public warn(...messages: any[]): Promise<any>;
    /**
     * Logs a ERROR level message
     * @param messages The objects to log
     */
    public error(...messages: any[]): Promise<any>;
    /**
     * Logs a FATAL level message
     * @param messages The objects to log
     */
    public fatal(...messages: any[]): Promise<any>;
}

/**
 * A factory for creating Logger objects bound to a specific target.
 * You should not create these objects yourself, refer to {@link createLoggerFactory} instead
 */
export class LoggerFactory {
    constructor(targets: ParsedTarget[])

    /**
     * Whether this factory has been destroyed
     */
    public destroyed: boolean;
    /**
     * The targets used for the Loggers
     */
    private targets: ParsedTarget[];
    /**
     * the maximum length of the sources instantiated by this factory
     */
    private maxSourceLength: number;

    /**
     * Returns a new instance of Logger
     * @param source The source to display next to all logs from this logger
     * @param sourceColor The color used to color the source, if color is enabled
     */
    public createLogger(source: string, sourceColor: string | number | number[]): Logger;
    /**
     * Destroys the logger factory and all loggers created by it.
     * If any logger from this factory attempts to log after it has been destroyed, it will throw.
     * This action is destructive and immediate, if any logs have not yet been written, they will not be written.
     */
    public destroy(): void
}

/**
 * Creates a new instance of LoggerFactory
 * @param targets The targets of the LoggerFactory
 */
export function createLoggerFactory(targets: Target[] | Target): LoggerFactory

type ParsedTarget = ({ type: "STREAM", stream: import("fs").WriteStream, private: boolean } | { type: "FUNCTION", func: Function } | { type: "HTTP" | "HTTPS", url: string | URL, options: any }) & { level: number, uniform: boolean, format: "JSON" | "TEXT", color: boolean, fullTimestamps: boolean, errorPolicy: "THROW" | "LOG" | "IGNORE" };

/**
 * A typeless target
 */
interface BaseTarget {
    /**
     * The minimum log level required to write to this target
     */
    logLevel?: LogLevel,
    /**
     * Whether to output logs in raw text, colored text, or in json
     * @default "TEXT"
     */
    style?: "JSON" | "TEXT",
    /**
     * Whether the source and log level should be formated to all have the same length.
     * Only affects text style logs
     * @default false
     */
    uniformLength?: boolean,
    /**
     * Whether the logs should be colored.
     * Only affects text style logs
     * @default false
     */
    color?: boolean,
    /**
     * Whether to display timestamps as YYYY-MM-DDTHH:mm:ss.SSSZ or HH:mm:ss.SSS.
     * Only affects text style logs
     * @default false
     */
    fullTimestamps?: boolean,
    /**
     * What action should be taken when an error is raised while writing the log.
     * If "LOG" is selected, and loggin the error raises another error, the error is ignored instead
     * @default "LOG"
     */
    errorPolicy?: "THROW" | "LOG" | "IGNORE",
}

/**
 * Writes logs to the provided stream. The user is responsible for handling errors and closing the stream once it is no longer in use
 */
interface StreamTarget extends BaseTarget {
    /**
     * Declares this target as a stream target
     */
    type: "STREAM",
    /**
     * The stream to write to
     */
    stream: import("fs").WriteStream,
}

/**
 * Writes logs to STDOUT using the `console.log` function
 */
interface StdOutTarget extends BaseTarget {
    /**
     * Declares this target as a console target
     */
    type: "STDOUT",
}

/**
 * Calls a function with the logs as argument
 */
interface FunctionTarget extends BaseTarget {
    /**
     * Declares this target as a console target
     */
    type: "FUNCTION",
    /**
     * The function to call with the parsed
     */
    function: (content: string) => void;
}

/**
 * Writes logs to a file.
 */
interface FileTarget extends BaseTarget {
    /**
     * Declares this target as a file target
     */
    type: "FILE",
    /**
     * The path of the file to write to. Appends to the file if it already exists.
     * If path is a string, ~/ will reference the user home directory
     */
    path: import("fs").PathLike,
    /**
     * Whether an {@link FileTarget.errorListener | error event} should be emitted in case the file at the supplied path already exists.
     * If false and a file exists, it will be appended. Otherwise it will be created.
     * @default false
     */
    failIfExists?: boolean,
    /**
     * The error listener to attach to the file stream. If this option is not supplied an an error is emited, the process exits.
     */
    errorListener?: Function
}

/**
 * Sends an HTTP or HTTPS post request with the log content as a request body to the specified URL
 */
interface PostTarget extends BaseTarget {
    /**
     * Declares this target as a stream target
     */
    type: "POST",
    /**
     * The URL to POST to
     */
    url: string | URL,
    /**
     * Whether to use HTTPS
     * @default true
     */
    https?: boolean,
    /**
     * The options object to pass to the request function
     */
    options?: any,
}

type Target = StreamTarget | FileTarget | PostTarget | StdOutTarget | FunctionTarget;

type LogLevel = "FATAL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";
