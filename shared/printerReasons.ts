/**
 * Why an installation's printer needs attention, in words museum staff
 * understand. Shared by the bridge (which detects it), the server (which emails
 * it) and the staff page (which shows it).
 *
 * Codes are CUPS printer-state-reasons without their `-error`/`-report` suffix,
 * plus the bridge's own `stopped`, `not-printing` and `no-printer`.
 */

const REASON_TEXT: Record<string, string> = {
    "media-empty": "out of paper",
    "media-needed": "out of paper",
    "media-jam": "paper jam",
    "door-open": "a cover or door is open",
    "cover-open": "a cover or door is open",
    "offline": "switched off or disconnected",
    "toner-empty": "out of toner",
    "marker-supply-empty": "out of ink or toner",
    "input-tray-missing": "the paper tray is missing",
    "stopped": "the print queue is paused",
    "not-printing": "protocols are not printing",
    "no-printer": "no printer is set up",
};

export function describePrinterReason(reason: string | undefined | null): string {
    if (!reason) return "needs attention";
    return REASON_TEXT[reason] ?? reason;
}
