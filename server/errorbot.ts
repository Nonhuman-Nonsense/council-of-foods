//We wrap this in a function to make sure that it runs after .env is loaded
export function initReporting(): void {
    if (process.env.COUNCIL_ERRORBOT) {
        console.log(`[init] will attempt to post errors to errorbot on ${process.env.COUNCIL_ERRORBOT}`);
    } else {
        console.log(`[init] COUNCIL_ERRORBOT not set, will not report errors.`);
    }
}

export async function reportError(err: any): Promise<void> {
    if (!process.env.COUNCIL_ERRORBOT) {
        console.log(`[Error] COUNCIL_ERRORBOT not set, will not report errors.`);
        return;
    }

    const sendStr = JSON.stringify({
        service: process.env.COUNCIL_DB_PREFIX,
        time: new Date().toISOString(),
        err: err
    });

    await fetch(process.env.COUNCIL_ERRORBOT, {
        method: 'POST',
        body: sendStr,
        headers: { 'Content-Type': 'application/json' }
    }).catch(error => {
        //We better catch errors posting to the bot, otherwise we get endless loop
        console.error(error);
        console.log('[Error] posting error FAILED');
        console.log('[Shutdown] Uncaught Exception');
        process.exit(1);
    });

    console.log('[Error] posting error OK');
}

//For all unrecoverable errors, post the message to error bot, and then crash
process.on('uncaughtException', async (err) => {
    console.error(err);
    await reportError(err);
    console.log('[Shutdown] Uncaught Exception');
    process.exit(1);
});