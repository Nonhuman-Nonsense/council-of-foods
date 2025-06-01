if (process.env.COUNCIL_ERRORBOT) {
    console.log(`[init] will attempt to post errors to errorbot on ${process.env.COUNCIL_ERRORBOT}`);
}

export async function reportError(err) {
    if (!process.env.COUNCIL_ERRORBOT) return;

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
        console.log('[Shutdown] Uncaught Exception, posting error failed.');
        process.exit(1);
    });
}

//For all unrecoverable errors, post the message to error bot, and then crash
process.on('uncaughtException', async (err) => {
    console.error(err);
    await reportError(err);
    console.log('[Shutdown] Uncaught Exception, posting error OK.');
    process.exit(1);
});