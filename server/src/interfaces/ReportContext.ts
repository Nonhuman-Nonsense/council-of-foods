export type ReportContext = {
    meetingId?: number;
    socketId?: string;
};

export interface ProvidesReportContext {
    getReportContext(): ReportContext;
}

export function resolveReportContext(from?: ProvidesReportContext | ReportContext): ReportContext {
    if (!from) {
        return {};
    }
    if ("getReportContext" in from) {
        return from.getReportContext();
    }
    return from;
}
