import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import NewMeeting from "@newMeeting/NewMeeting";
import { createMeeting } from "@api/createMeeting";
import routes from "@/routes.json";
import type { MeetingCharacter } from "@newMeeting/SelectCharacters";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/routing", () => ({
    useRouting: () => ({
        newMeetingPath: `/${routes.newMeeting}`,
        meetingPath: (id: number) => `/${routes.meeting}/${id}`,
        meetingRoutesBase: `/${routes.meeting}`,
    }),
}));

vi.mock("@api/createMeeting", () => ({
    createMeeting: vi.fn(),
}));

vi.mock("@main/topicsBundle", () => ({
    getTopicsBundle: () => ({
        topics: [{ id: "test-topic", title: "Test Topic", description: "D", prompt: "P" }],
        custom_topic: { id: "customtopic", title: "Custom", description: "C", prompt: "Custom" },
        system: "System [TOPIC]",
    }),
}));

vi.mock("@newMeeting/SelectTopic", () => ({
    default: ({
        onContinueForward,
    }: {
        onContinueForward: (data: { topic: string; custom: string }) => void;
    }) => (
        <button
            type="button"
            data-testid="topic-next"
            onClick={() => onContinueForward({ topic: "test-topic", custom: "" })}
        >
            topic next
        </button>
    ),
}));

const twoCharacters: MeetingCharacter[] = [
    { id: "water", name: "Water", description: "", type: "food", voice: "alloy" },
    { id: "tomato", name: "Tomato", description: "", type: "food", voice: "alloy" },
];

vi.mock("@newMeeting/SelectCharacters", () => ({
    default: ({
        onContinueForward,
    }: {
        onContinueForward: (data: { characters: MeetingCharacter[] }) => void | Promise<void>;
    }) => (
        <button
            type="button"
            data-testid="foods-continue"
            onClick={() => onContinueForward({ characters: twoCharacters })}
        >
            continue foods
        </button>
    ),
    createDefaultHumans: () => ([
        { id: "panelist0", name: "", description: "", type: "panelist", voice: "alloy", index: 0 },
        { id: "panelist1", name: "", description: "", type: "panelist", voice: "alloy", index: 1 },
        { id: "panelist2", name: "", description: "", type: "panelist", voice: "alloy", index: 2 },
    ]),
    getFoodsBundle: () => ({
        metadata: { version: "test", last_updated: "test" },
        panelWithHumans: "",
        addHuman: { id: "addhuman", name: "Add Human", description: "" },
        characters: [{ id: "water", name: "Water", description: "", voice: "alloy" }],
    }),
}));

describe("NewMeeting — live key handoff", () => {
    const setMeetingliveKey = vi.fn();
    const setUnrecoverableError = vi.fn();
    const setTopicSelection = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createMeeting).mockResolvedValue({
            meetingId: 42,
            liveKey: "returned-live-key",
        });
    });

    it("calls setMeetingliveKey with the API key then navigates to the meeting route", async () => {
        render(
            <MemoryRouter initialEntries={[`/${routes.newMeeting}`]}>
                <Routes>
                    <Route
                        path={`/${routes.newMeeting}`}
                        element={
                            <NewMeeting
                                setUnrecoverableError={setUnrecoverableError}
                                topicSelection={{ id: "test-topic", title: "Test Topic", description: "D", prompt: "P" }}
                                setTopicSelection={setTopicSelection}
                                setMeetingliveKey={setMeetingliveKey}
                            />
                        }
                    />
                    <Route
                        path={`/${routes.meeting}/:meetingId`}
                        element={<div data-testid="meeting-screen">Meeting</div>}
                    />
                </Routes>
            </MemoryRouter>
        );

        // topicSelection is preset → NewMeeting opens on the foods step
        fireEvent.click(screen.getByTestId("foods-continue"));

        await waitFor(() => {
            expect(setMeetingliveKey).toHaveBeenCalledWith("returned-live-key");
        });

        expect(createMeeting).toHaveBeenCalled();

        await waitFor(() => {
            expect(screen.getByTestId("meeting-screen")).toBeInTheDocument();
        });

        expect(setUnrecoverableError).not.toHaveBeenCalled();
    });
});
