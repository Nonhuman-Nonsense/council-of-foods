import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import NewMeeting from "@/components/NewMeeting";
import { createMeeting } from "@/api/createMeeting";
import routes from "@/routes.json";
import { meetingPath } from "@/routing";
import type { Food } from "@/components/settings/SelectFoods";

vi.mock("@/api/createMeeting", () => ({
    createMeeting: vi.fn(),
}));

vi.mock("@/components/topicsBundle", () => ({
    getTopicsBundle: () => ({
        topics: [{ id: "test-topic", title: "Test Topic", description: "D", prompt: "P" }],
        custom_topic: { id: "customtopic", title: "Custom", description: "C", prompt: "Custom" },
        system: "System [TOPIC]",
    }),
}));

vi.mock("@/components/settings/SelectTopic", () => ({
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

const twoFoods: Food[] = [
    { id: "water", name: "Water", description: "", type: "food", voice: "alloy" },
    { id: "tomato", name: "Tomato", description: "", type: "food", voice: "alloy" },
];

vi.mock("@/components/settings/SelectFoods", () => ({
    default: ({
        onContinueForward,
    }: {
        onContinueForward: (data: { foods: Food[] }) => void | Promise<void>;
    }) => (
        <button
            type="button"
            data-testid="foods-continue"
            onClick={() => onContinueForward({ foods: twoFoods })}
        >
            continue foods
        </button>
    ),
}));

describe("NewMeeting — creator key handoff", () => {
    const setMeetingCreatorKey = vi.fn();
    const setUnrecoverableError = vi.fn();
    const setTopicSelection = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createMeeting).mockResolvedValue({
            meetingId: 42,
            creatorKey: "returned-creator-key",
        });
    });

    it("calls setMeetingCreatorKey with the API key then navigates to the meeting route", async () => {
        render(
            <MemoryRouter initialEntries={[`/${routes.newMeeting}`]}>
                <Routes>
                    <Route
                        path={`/${routes.newMeeting}`}
                        element={
                            <NewMeeting
                                lang="en"
                                setUnrecoverableError={setUnrecoverableError}
                                topicSelection={{ id: "test-topic", title: "Test Topic", description: "D", prompt: "P" }}
                                setTopicSelection={setTopicSelection}
                                setMeetingCreatorKey={setMeetingCreatorKey}
                            />
                        }
                    />
                    <Route
                        path={meetingPath("en", 99999).replace("99999", ":meetingId")}
                        element={<div data-testid="meeting-screen">Meeting</div>}
                    />
                </Routes>
            </MemoryRouter>
        );

        // topicSelection is preset → NewMeeting opens on the foods step
        fireEvent.click(screen.getByTestId("foods-continue"));

        await waitFor(() => {
            expect(setMeetingCreatorKey).toHaveBeenCalledWith("returned-creator-key");
        });

        expect(createMeeting).toHaveBeenCalled();

        await waitFor(() => {
            expect(screen.getByTestId("meeting-screen")).toBeInTheDocument();
        });

        expect(setUnrecoverableError).not.toHaveBeenCalled();
    });
});
