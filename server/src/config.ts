import dotenv from 'dotenv';
import { EnvSchema } from '@models/EnvValidation.js';

// Load environment variables immediately
dotenv.config();

// Validate
const envParse = EnvSchema.safeParse(process.env);

if (!envParse.success) {
    const errorMsg = "Invalid environment variables: " + JSON.stringify(envParse.error.format(), null, 2);
    console.error(errorMsg); // Ensure it logs to stdout/stderr

    process.exit(1);
}

console.log(`[init] node_env is ${envParse.data.NODE_ENV}`);

export const config = envParse.data;