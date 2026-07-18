import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import NewMeeting from "@newMeeting/NewMeeting";
import MeetingSetupShell from "@newMeeting/MeetingSetupShell";
import { createMeeting } from "@api/createMeeting";
import routes from "@/routes.json";
import type { Character } from "@newMeeting/SelectCharacters";
import { MockFactory } from "../factories/MockFactory";
import { useErrorStore } from "@main/overlay/errorStore";

vi.mock("@voice/MeetingVoiceGuide", () => ({
    default: () => null,
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/navigation", () => ({
    useRouting: () => ({
        newMeetingPath: `/${routes.newMeeting}`,
        meetingPath: (id: number) => `/${routes.meeting}/${id}`,
        meetingRoutesBase: `/${routes.meeting}`,
    }),
    isRootPath: (pathname: string) => pathname === "/" || pathname === "",
}));

vi.mock("@api/createMeeting", () => ({
    createMeeting: vi.fn(),
}));

vi.mock("@main/topicsBundle", () => ({
    getTopicsBundle: () => ({
        topics: [MockFactory.createTopic({ id: "test-topic", title: "Test Topic", description: "D", prompt: "P" })],
        custom_topic: MockFactory.createTopic({
            id: "customtopic",
            title: "Custom",
            description: "C",
            prompt: "Custom",
        }),
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

const twoCharacters: Character[] = [
    MockFactory.createCharacter({ id: "chair", name: "Chair", description: "", prompt: "" }),
    MockFactory.createCharacter({ id: "participant-a", name: "Participant A", description: "", prompt: "" }),
];

vi.mock("@newMeeting/SelectCharacters", () => ({
    default: ({
        onContinueForward,
    }: {
        onContinueForward: (data: { characters: Character[] }) => void | Promise<void>;
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
        MockFactory.createPanelist(0),
        MockFactory.createPanelist(1),
        MockFactory.createPanelist(2),
    ]),
    getFoodsBundle: () => MockFactory.createCharacterSetupBundle(),
}));

describe("NewMeeting — live key handoff", () => {
    const setMeetingliveKey = vi.fn();
    const setTopicSelection = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        useErrorStore.getState().resetForTests();
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
                        element={
                            <MeetingSetupShell
                                topicSelection={MockFactory.createTopic({
                                    id: "test-topic",
                                    title: "Test Topic",
                                    description: "D",
                                    prompt: "P",
                                })}
                                setTopicSelection={setTopicSelection}
                                setMeetingliveKey={setMeetingliveKey}
                            />
                        }
                    >
                        <Route path={`/${routes.newMeeting}`} element={<NewMeeting />} />
                    </Route>
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

        expect(useErrorStore.getState().unrecoverableError).toBeNull();
    });
});
