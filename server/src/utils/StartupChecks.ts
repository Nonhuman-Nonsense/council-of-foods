import { EnvConfig } from "@models/EnvValidation.js";
import { Logger } from "@utils/Logger.js";
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs/promises';
import { constants } from "fs";

export const verifyGoogleCredentials = async (config: EnvConfig) => {
    Logger.info("init", "Verifying Google Cloud Credentials...");

    const keyFilePath = config.GOOGLE_APPLICATION_CREDENTIALS;

    // 1. Check File Existence
    try {
        await fs.access(keyFilePath, constants.F_OK);
    } catch (error) {
        throw new Error(`Google Application Credentials file not found at: ${keyFilePath}`);
    }

    // 2. Auth Verification
    try {
        const auth = new GoogleAuth({
            keyFile: keyFilePath,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        // Attempt to fetch an access token. This verifies the key is valid and can authenticate.
        const client = await auth.getClient();
        await client.getAccessToken();

        Logger.info("init", "Google Cloud Authentication successful.");
    } catch (error: any) {
        throw new Error(`Google Cloud Authentication failed: ${error.message}`);
    }
};
