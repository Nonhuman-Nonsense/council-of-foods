import { cyan, yellow, red, gray } from "colorette";

export class Logger {
    private static formatContext(context: string): string {
        return `[${context}]`;
    }

    static info(context: string, message: string): void {
        console.log(`${cyan(this.formatContext(context))} ${message}`);
    }

    static warn(context: string, message: string): void {
        console.warn(`${cyan(this.formatContext(context))} ${yellow(message)}`);
    }

    static error(context: string, message: string, error?: unknown): void {
        // Log the primary message in red
        console.error(`${red(this.formatContext(context))} ${red(message)}`);

        // Log error details if provided
        if (error) {
            if (error instanceof Error) {
                console.error(gray(error.stack || error.message));
            } else {
                console.error(gray(JSON.stringify(error, null, 2)));
            }
        }
    }
}
