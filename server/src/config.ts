import dotenv from 'dotenv';
import { EnvSchema } from '@models/ValidationSchemas.js';
import { reportError } from '@utils/errorbot.js';

// Load environment variables immediately
dotenv.config();

// Validate
const envParse = EnvSchema.safeParse(process.env);

if (!envParse.success) {
    const errorMsg = "Invalid environment variables: " + JSON.stringify(envParse.error.format(), null, 2);
    console.error(errorMsg); // Ensure it logs to stdout/stderr

    // Attempt to report to errorbot
    try {
        await reportError("init", errorMsg, envParse.error);
    } catch (e) {
        console.error("Failed to report config error to errorbot");
    }

    process.exit(1);
}

export const config = envParse.data;
