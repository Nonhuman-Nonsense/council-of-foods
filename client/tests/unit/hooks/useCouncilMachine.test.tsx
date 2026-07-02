
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCouncilMachine } from '@council/hooks/useCouncilMachine';
import { MockFactory } from '../factories/MockFactory';
import { useErrorStore } from '@main/overlay/errorStore';
// import { useCouncilSocket } from "@council/hooks/useCouncilSocket"; // doing manual mock

// --- Mocks ---

const mockNavigate = vi.fn();
const mockUseLocation = vi.fn().mockReturnValue({ hash: '', pathname: '' });

vi.mock('react-router', () => ({
    useNavigate: () => mockNavigate,
    useLocation: () => mockUseLocation() // Call it to allow changing return value
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));

const mockUseDocumentVisibility = vi.fn().mockReturnValue(true);
vi.mock('@/utils', () => ({
    useDocumentVisibility: () => mockUseDocumentVisibility(),
}));

vi.mock('@/routing', () => ({
    useRouting: () => ({
        newMeetingPath: '/new',
        meetingPath: (id: number) => `/meeting/${id}`,
        meetingRoutesBase: '/meeting',
    }),
}));

// Mock Socket Hook
// We need to be able to trigger callbacks passed to useCouncilSocket
let socketHandlers: any = {};
const mockSocketEmit = vi.fn();

vi.mock('@council/hooks/useCouncilSocket', () => ({
    useCouncilSocket: (props: any) => {
        socketHandlers = props; // Capture handlers
        return { current: { emit: mockSocketEmit } }; // Return mock socket ref
    }
}));

// Mock resumeMeeting API for resume-flow tests.
const mockResumeMeeting = vi.fn();
vi.mock('@api/resumeMeeting', () => ({
    ResumeMeetingError: class ResumeMeetingError extends Error {
        readonly status: number;
        constructor(status: number, message: string) {
            super(message);
            this.name = 'ResumeMeetingError';
            this.status = status;
        }
    },
    resumeMeeting: (...args: any[]) => mockResumeMeeting(...args),
}));

describe('useCouncilMachine', () => {
    let audioContextMock: any;

    let defaultProps: any;

    beforeEach(() => {
        vi.clearAllMocks();
        socketHandlers = {};
        audioContextMock = {
            current: {
                decodeAudioData: vi.fn(),
                state: 'running',
                suspend: vi.fn(),
                resume: vi.fn()
            }
        };
        defaultProps = {
            currentMeetingId: 0,
            liveKey: 'test-live-key',
            replayManifest: null,
            topic: MockFactory.createTopic({ id: 't', title: 'T', description: 'D', prompt: 'Test Topic' }),
            participants: [],
            humanName: '',
            setHumanName: vi.fn(),
            audioContext: audioContextMock,
            isPaused: false,
            setPaused: vi.fn(),
            isMuseumMode: false,
            agentMode: "off",
            setMetaAgentPhase: vi.fn(),
            metaAgentPhase: "inactive",
        };
        useErrorStore.getState().resetForTests();
        mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
        mockUseDocumentVisibility.mockReturnValue(true);
    });

    it('initializes with loading state', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));
        expect(result.current.state.councilState).toBe('loading');
    });

    it('exposes currentMeetingId from props in state', () => {
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, currentMeetingId: 12345 } as any)
        );
        expect(result.current.state.currentMeetingId).toBe(12345);
    });

    it('updates text messages on conversation update', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const newMessages = [
            { id: '1', text: 'Hello', speaker: 'banana', type: 'message' }
        ];

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate(newMessages);
            }
        });

        expect(result.current.state.textMessages).toEqual(newMessages);
    });

    it('transitions to playing when audio and text are available', async () => {
        renderHook(() => useCouncilMachine(defaultProps as any));

        // 1. Add Text
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: 'msg1', text: 'Hello', speaker: 'banana', type: 'message' }
                ]);
            }
        });

        // 2. Add Audio
        // Mock decodeAudioData to return a fake buffer
        audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');

        await act(async () => {
            if (socketHandlers.onAudioUpdate) {
                // Must trigger async decoding
                socketHandlers.onAudioUpdate({ id: 'msg1', audio: new ArrayBuffer(8) });
            }
        });

        // Current implementation of onAudioUpdate is async IIFE, so we might need a small wait
        // The await act() should handle promises pushed to microtask queue?
        // Let's retry condition if needed.

        // Trigger generic re-render check or rely on useEffect inside hook
        // The hook has a useEffect that checks TryToFindTextAndAudio when loading
        // We might need to force a re-render or wait for the useEffect

        // Wait for next update
        // Using waitFor from testing-library/react would be better if we rendered component, 
        // with renderHook we can just check result.current if we awaited enough.

        // Note: The hook state update happens after await decodeAudioData.
    });

    it('declineOverlay does not navigate (routing handled elsewhere)', () => {
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, currentMeetingId: 42 } as any)
        );
        mockNavigate.mockClear();

        act(() => {
            result.current.actions.declineOverlay();
        });

        expect(mockNavigate).not.toHaveBeenCalled();
    });

    describe('auto-pause / auto-resume', () => {
        it('auto-pauses when location hash is set', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#about', pathname: '/meeting/1' });

            renderHook(() => useCouncilMachine({ ...defaultProps, isPaused: false, setPaused }));

            expect(setPaused).toHaveBeenCalledWith(true);
        });

        it('auto-pauses when connection error is set', () => {
            const setPaused = vi.fn();
            act(() => useErrorStore.getState().setConnectionError("socket", true));

            renderHook(() =>
                useCouncilMachine({
                    ...defaultProps,
                    isPaused: false,
                    setPaused,
                }),
            );

            expect(setPaused).toHaveBeenCalledWith(true);
        });

        it('auto-pauses when tab is hidden and meta-agent is inactive', () => {
            const setPaused = vi.fn();
            mockUseDocumentVisibility.mockReturnValue(false);

            renderHook(() => useCouncilMachine({ ...defaultProps, isPaused: false, setPaused }));

            expect(setPaused).toHaveBeenCalledWith(true);
        });

        it('does not auto-pause when tab is hidden but meta-agent is active', () => {
            const setPaused = vi.fn();
            mockUseDocumentVisibility.mockReturnValue(false);

            renderHook(() =>
                useCouncilMachine({
                    ...defaultProps,
                    isPaused: false,
                    metaAgentPhase: 'extension',
                    setPaused,
                }),
            );

            expect(setPaused).not.toHaveBeenCalled();
        });

        it('auto-pauses when a council overlay opens', () => {
            const setPaused = vi.fn();
            renderHook(() => useCouncilMachine({ ...defaultProps, isPaused: false, setPaused }));

            act(() => {
                socketHandlers.onConversationUpdate?.([{ type: 'query_extension' }]);
            });

            expect(setPaused).toHaveBeenCalledWith(true);
        });

        it('auto-pauses when name overlay opens', () => {
            const setPaused = vi.fn();
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, isPaused: false, setPaused }),
            );

            act(() => {
                result.current.actions.handleOnRaiseHand();
            });

            expect(result.current.state.visibleOverlay).toBe('name');
            expect(setPaused).toHaveBeenCalledWith(true);
        });

        it('does not auto-pause for summary overlay', async () => {
            vi.useFakeTimers();
            const setPaused = vi.fn();
            const { result } = renderHook(() =>
                useCouncilMachine({
                    ...defaultProps,
                    currentMeetingId: 100,
                    isPaused: false,
                    setPaused,
                } as any),
            );

            audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');
            await act(async () => {
                socketHandlers.onConversationUpdate?.([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' },
                ]);
                socketHandlers.onAudioUpdate?.({ id: '1', audio: new ArrayBuffer(8) });
            });

            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' },
                    { id: 'sum1', text: 'Summary', speaker: 'water', type: 'summary' },
                ]);
            });

            act(() => {
                vi.advanceTimersByTime(400);
            });
            setPaused.mockClear();

            act(() => {
                result.current.actions.handleOnFinishedPlaying();
            });
            act(() => {
                vi.advanceTimersByTime(400);
            });

            expect(result.current.state.councilState).toBe('summary');
            expect(result.current.state.visibleOverlay).toBe('summary');
            expect(setPaused).not.toHaveBeenCalled();

            vi.useRealTimers();
        });

        it('resumes in museum mode when hash overlay is dismissed', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' });

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).toHaveBeenCalledWith(false);
        });

        it('resumes in museum mode when a manual hash overlay is dismissed', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#about', pathname: '/meeting/1' });

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).toHaveBeenCalledWith(false);
        });

        it('stays paused in web mode when hash overlay is dismissed', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#about', pathname: '/meeting/1' });

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
            rerender({
                ...defaultProps,
                isPaused: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('resumes in web and museum when connection error clears', () => {
            const setPaused = vi.fn();
            act(() => useErrorStore.getState().setConnectionError("socket", true));

            renderHook(() =>
                useCouncilMachine({
                    ...defaultProps,
                    isPaused: true,
                    setPaused,
                }),
            );

            setPaused.mockClear();
            act(() => useErrorStore.getState().setConnectionError("socket", false));

            expect(setPaused).toHaveBeenCalledWith(false);
        });

        it('resumes in museum mode when connection error clears', () => {
            const setPaused = vi.fn();
            act(() => useErrorStore.getState().setConnectionError("socket", true));

            renderHook(() =>
                useCouncilMachine({
                    ...defaultProps,
                    isPaused: true,
                    isMuseumMode: true,
                    setPaused,
                }),
            );

            setPaused.mockClear();
            act(() => useErrorStore.getState().setConnectionError("socket", false));

            expect(setPaused).toHaveBeenCalledWith(false);
        });

        it('resumes in museum mode when tab becomes visible again', () => {
            const setPaused = vi.fn();
            mockUseDocumentVisibility.mockReturnValue(false);

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseDocumentVisibility.mockReturnValue(true);
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).toHaveBeenCalledWith(false);
        });

        it('stays paused in web mode when tab becomes visible again', () => {
            const setPaused = vi.fn();
            mockUseDocumentVisibility.mockReturnValue(false);

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseDocumentVisibility.mockReturnValue(true);
            rerender({
                ...defaultProps,
                isPaused: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('stays paused in museum when hash clears but tab is still hidden', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' });
            mockUseDocumentVisibility.mockReturnValue(false);

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('stays paused in museum when tab refocuses but hash overlay is still open', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' });
            mockUseDocumentVisibility.mockReturnValue(false);

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseDocumentVisibility.mockReturnValue(true);
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('resumes in museum when the last stacked environmental interrupt clears', () => {
            const setPaused = vi.fn();
            mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' });
            mockUseDocumentVisibility.mockReturnValue(false);

            const { rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            setPaused.mockClear();
            mockUseDocumentVisibility.mockReturnValue(true);
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });
            expect(setPaused).not.toHaveBeenCalledWith(false);

            setPaused.mockClear();
            mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });
            expect(setPaused).toHaveBeenCalledWith(false);
        });

        it('stays paused when a council overlay is dismissed without acting', () => {
            const setPaused = vi.fn();
            const { result, rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        setPaused,
                    },
                },
            );

            act(() => {
                if (socketHandlers.onConversationUpdate) {
                    socketHandlers.onConversationUpdate([
                        { id: 'm0', type: 'message', text: 'x', speaker: 'water' },
                        { type: 'query_extension' },
                    ]);
                }
            });

            act(() => {
                result.current.actions.declineOverlay();
            });

            setPaused.mockClear();
            rerender({
                ...defaultProps,
                isPaused: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('stays paused when incomplete overlay is dismissed via nevermind', () => {
            const setPaused = vi.fn();
            const { result, rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: true,
                        setPaused,
                    },
                },
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm0', type: 'message', text: 'x', speaker: 'water' },
                    { type: 'meeting_incomplete' },
                ]);
            });

            act(() => {
                result.current.actions.declineOverlay();
            });

            setPaused.mockClear();
            rerender({
                ...defaultProps,
                isPaused: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        describe('overlay action handlers resume playback', () => {
            it('handleOnExtendMeeting resumes playback', () => {
                const setPaused = vi.fn();
                const { result } = renderHook(() =>
                    useCouncilMachine({ ...defaultProps, setPaused } as any),
                );

                act(() => {
                    socketHandlers.onConversationUpdate?.([
                        { id: 'm0', type: 'message', text: 'x', speaker: 'water' },
                        { type: 'query_extension' },
                    ]);
                });

                setPaused.mockClear();
                act(() => {
                    result.current.actions.handleOnExtendMeeting();
                });

                expect(setPaused).toHaveBeenCalledWith(false);
            });

            it('handleHumanNameEntered resumes playback', () => {
                const setPaused = vi.fn();
                const { result } = renderHook(() =>
                    useCouncilMachine({ ...defaultProps, setPaused } as any),
                );

                act(() => {
                    result.current.actions.handleOnRaiseHand();
                });

                setPaused.mockClear();
                act(() => {
                    result.current.actions.handleHumanNameEntered({ humanName: 'Alex' });
                });

                expect(setPaused).toHaveBeenCalledWith(false);
            });

            it('handleOnAttemptResume resumes playback before the API call', async () => {
                const setPaused = vi.fn();
                mockResumeMeeting.mockRejectedValueOnce(new Error('network'));
                const { result } = renderHook(() =>
                    useCouncilMachine({
                        ...defaultProps,
                        liveKey: undefined,
                        currentMeetingId: 77,
                        setPaused,
                    } as any),
                );

                act(() => {
                    socketHandlers.onConversationUpdate?.([
                        { id: 'a', text: 'Hi', speaker: 'banana', type: 'message' },
                        { type: 'meeting_incomplete' },
                    ]);
                });

                setPaused.mockClear();
                await act(async () => {
                    await result.current.actions.handleOnAttemptResume();
                });

                expect(setPaused).toHaveBeenCalledWith(false);
            });
        });
    });

    it('toggles mute state when toggleMute is called', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        // Initial state should be unmuted (false)
        expect(result.current.state.isMuted).toBe(false);

        // Toggle mute
        act(() => {
            result.current.actions.toggleMute();
        });
        expect(result.current.state.isMuted).toBe(true);

        // Toggle again
        act(() => {
            result.current.actions.toggleMute();
        });
        expect(result.current.state.isMuted).toBe(false);
    });

    // --- Human Panelist Tests ---

    it('enters query_extension overlay state when conversation ends with synthetic query_extension message', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([{ type: 'query_extension' }]);
            }
        });

        expect(result.current.state.councilState).toBe('query_extension');
        expect(result.current.state.visibleOverlay).toBe('query_extension');
        expect(defaultProps.setMetaAgentPhase).not.toHaveBeenCalled();
    });

    it('museum mode with ptt activates meta-agent extension instead of query_extension overlay', () => {
        const setMetaAgentPhase = vi.fn();

        const { result } = renderHook(() =>
            useCouncilMachine({
                ...defaultProps,
                isMuseumMode: true,
                agentMode: "ptt",
                setMetaAgentPhase,
            } as any),
        );

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([{ type: 'query_extension' }]);
            }
        });

        expect(result.current.state.councilState).toBe('query_extension');
        expect(result.current.state.visibleOverlay).toBeNull();
        expect(setMetaAgentPhase).toHaveBeenCalledWith('extension');
    });

    it('museum mode without ptt uses query_extension overlay', () => {
        const setMetaAgentPhase = vi.fn();

        const { result } = renderHook(() =>
            useCouncilMachine({
                ...defaultProps,
                isMuseumMode: true,
                agentMode: "always-on",
                setMetaAgentPhase,
            } as any),
        );

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([{ type: 'query_extension' }]);
            }
        });

        expect(result.current.state.councilState).toBe('query_extension');
        expect(result.current.state.visibleOverlay).toBe('query_extension');
        expect(setMetaAgentPhase).not.toHaveBeenCalled();
    });

    it('museum mode transitions interruption to extension at soft cap', () => {
        const setMetaAgentPhase = vi.fn();

        renderHook(() =>
            useCouncilMachine({
                ...defaultProps,
                isMuseumMode: true,
                agentMode: "ptt",
                setMetaAgentPhase,
            } as any),
        );

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([{ type: 'query_extension' }]);
            }
        });

        expect(setMetaAgentPhase).toHaveBeenCalledWith('extension');
    });

    it('handleOnExtendMeeting drops query_extension locally and emits extend_meeting', () => {
        const setPaused = vi.fn();
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, setPaused } as any),
        );
        mockSocketEmit.mockClear();
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: 'm0', type: 'message', text: 'x', speaker: 'water' },
                    { type: 'query_extension' },
                ]);
            }
        });
        act(() => {
            result.current.actions.handleOnExtendMeeting();
        });
        expect(result.current.state.textMessages.map((m) => m.type)).toEqual(['message']);
        expect(mockSocketEmit).toHaveBeenCalledWith('extend_meeting');
        expect(result.current.state.councilState).toBe('loading');
        expect(setPaused).toHaveBeenCalledWith(false);
    });

    it('handleOnConcludeMeeting drops query_extension locally and emits conclude_meeting', () => {
        const setPaused = vi.fn();
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, setPaused } as any),
        );
        mockSocketEmit.mockClear();
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: 'm0', type: 'message', text: 'x', speaker: 'water' },
                    { type: 'query_extension' },
                ]);
            }
        });
        act(() => {
            result.current.actions.handleOnConcludeMeeting();
        });
        expect(result.current.state.textMessages.map((m) => m.type)).toEqual(['message']);
        expect(mockSocketEmit).toHaveBeenCalledWith(
            'conclude_meeting',
            expect.objectContaining({ date: expect.any(String) }),
        );
        expect(result.current.state.councilState).toBe('loading');
        expect(setPaused).toHaveBeenCalledWith(false);
    });

    it('transitions to human_panelist state when awaiting_human_panelist message is next', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const panelistMsg = {
            id: 'msg_panelist',
            text: '...',
            speaker: 'human-panelist',
            type: 'awaiting_human_panelist'
        };

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([panelistMsg]);
            }
        });

        // The state machine effect should trigger
        expect(result.current.state.councilState).toBe('human_panelist');
    });

    it('submits human panelist message correctly', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const panelistMsg = {
            id: 'msg_panelist',
            text: '...',
            speaker: 'human-panelist-1',
            type: 'awaiting_human_panelist'
        };

        // 1. Enter state
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([panelistMsg]);
            }
        });
        expect(result.current.state.councilState).toBe('human_panelist');

        // 2. Submit
        act(() => {
            result.current.actions.handleOnSubmitHumanMessage('My Panelist Response', '');
        });

        // 3. Verify Emission
        // Expect "submit_human_panelist" with correct structure
        expect(mockSocketEmit).toHaveBeenCalledWith('submit_human_panelist', {
            text: 'My Panelist Response',
            speaker: 'human-panelist-1' // Should use the speaker ID from the awaiting message
        });

        // 4. Verify Local State update (slicing) and transition
        // Slicing removes the 'awaiting' message, so textMessages should be empty
        expect(result.current.state.textMessages).toEqual([]);

        // Next action calculation should transition back to loading or appropriate state
        // If textMessages is empty, tryToFind will fail -> loading
        expect(result.current.state.councilState).toBe('loading');
    });

    it('skips human panelist turn on abandon', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const panelistMsg = {
            id: 'msg_panelist',
            text: '...',
            speaker: 'human-panelist-1',
            type: 'awaiting_human_panelist'
        };

        act(() => {
            socketHandlers.onConversationUpdate?.([panelistMsg]);
        });
        expect(result.current.state.councilState).toBe('human_panelist');

        act(() => {
            result.current.actions.handleOnAbandonHumanTurn();
        });

        expect(mockSocketEmit).toHaveBeenCalledWith('skip_human_turn');
        expect(result.current.state.textMessages).toEqual([
            expect.objectContaining({ type: 'skipped', speaker: 'human-panelist-1', text: '' }),
        ]);
        expect(result.current.state.councilState).toBe('loading');
    });

    it('skips human question turn on abandon', () => {
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, humanName: 'Frank' } as any)
        );

        const questionMsg = {
            id: 'msg_question',
            text: '...',
            speaker: 'Frank',
            type: 'awaiting_human_question'
        };

        act(() => {
            socketHandlers.onConversationUpdate?.([questionMsg]);
        });
        expect(result.current.state.councilState).toBe('human_input');

        act(() => {
            result.current.actions.handleOnAbandonHumanTurn();
        });

        expect(mockSocketEmit).toHaveBeenCalledWith('skip_human_turn');
        expect(result.current.state.textMessages).toEqual([
            expect.objectContaining({ type: 'skipped', speaker: 'Frank', text: '' }),
        ]);
        expect(result.current.state.councilState).toBe('loading');
    });

    it('surfaces an unrecoverable error if abandon is called without awaiting message', () => {
        const { result } = renderHook(() =>
            useCouncilMachine(defaultProps as any)
        );

        act(() => {
            result.current.actions.handleOnAbandonHumanTurn();
        });

        expect(mockSocketEmit).not.toHaveBeenCalledWith('skip_human_turn');
        expect(useErrorStore.getState().unrecoverableError).toMatchObject({
            message: expect.stringContaining('awaiting_human_question'),
            source: 'useCouncilMachine.skip_human_turn',
        });
    });

    it('surfaces an unrecoverable error if human_panelist submit loses its awaiting message', () => {
        const { result } = renderHook(() =>
            useCouncilMachine(defaultProps as any)
        );

        const panelistMsg = {
            id: 'msg_panelist',
            text: '...',
            speaker: 'human-panelist-1',
            type: 'awaiting_human_panelist'
        };

        act(() => {
            socketHandlers.onConversationUpdate?.([panelistMsg]);
        });
        expect(result.current.state.councilState).toBe('human_panelist');

        // Simulate the impossible state we now treat as unrecoverable: panelist mode
        // remains active but the queued awaiting marker is gone.
        act(() => {
            socketHandlers.onConversationUpdate?.([]);
        });

        act(() => {
            result.current.actions.handleOnSubmitHumanMessage('My Panelist Response', '');
        });

        expect(mockSocketEmit).not.toHaveBeenCalledWith(
            'submit_human_panelist',
            expect.anything()
        );
        expect(useErrorStore.getState().unrecoverableError).toMatchObject({
            message: 'Internal state mismatch: expected awaiting_human_panelist before submitting panelist response.',
            source: 'useCouncilMachine.submit_panelist',
        });
    });


    it('should NOT emit attempt_reconnection if reconnection happens without a current meeting ID (race condition fix)', () => {
        renderHook(() => useCouncilMachine(defaultProps as any));

        // Simulate reconnect event
        act(() => {
            if (socketHandlers.onReconnect) {
                socketHandlers.onReconnect();
            }
        });

        // Should not have emitted attempt_reconnection because no meeting started yet
        expect(mockSocketEmit).not.toHaveBeenCalledWith('attempt_reconnection', expect.anything());
    });

    it('should emit attempt_reconnection if a meeting was already active', () => {
        renderHook(() => useCouncilMachine({ ...defaultProps, currentMeetingId: 999 } as any));

        act(() => {
            if (socketHandlers.onReconnect) {
                socketHandlers.onReconnect();
            }
        });

        expect(mockSocketEmit).toHaveBeenCalledWith('attempt_reconnection', expect.objectContaining({
            meetingId: 999,
            liveKey: 'test-live-key',
        }));
    });

    // --- Resume flow ---
    //
    // The resume path is a one-shot handoff: strip the synthetic `meeting_incomplete`
    // message, PUT `/api/meetings/:id`, replace `textMessages` with the server's
    // sanitized conversation, kick off any missing audio in the background, and lift
    // the rotated `liveKey` via `setliveKey` so the socket effect flips us live.
    // Errors fall through to `setUnrecoverableError(message)` — there is no
    // per-status UI state inside the hook.

    describe('handleOnAttemptResume', () => {
        // Stub global fetch so the background audio prefetch triggered by the happy path
        // doesn't raise ERR_INVALID_URL in Node (which would call setUnrecoverableError).
        // The actual clip payload doesn't matter — only that it resolves successfully.
        beforeEach(() => {
            const payload = { id: 'x', type: 'chat', audioBase64: btoa('raw'), sentences: [] };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
                new Response(JSON.stringify(payload), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            ));
            audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        // Seed a replay buffer that ends with the synthetic `meeting_incomplete` message,
        // as if the replay FSM had driven the hook into the `meeting_incomplete` overlay state.
        function seedReplayAtIncomplete() {
            act(() => {
                if (socketHandlers.onConversationUpdate) {
                    socketHandlers.onConversationUpdate([
                        { id: 'a', text: 'Hi', speaker: 'banana', type: 'message' },
                        { id: 'b', text: 'Bye', speaker: 'apple', type: 'message' },
                        { id: 'incomplete', text: '', speaker: '', type: 'meeting_incomplete' },
                    ]);
                }
            });
        }

        it('flips to live by calling setliveKey on success and drops the synthetic meeting_incomplete message', async () => {
            const setliveKey = vi.fn();
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, liveKey: undefined, setliveKey, currentMeetingId: 77 } as any)
            );
            seedReplayAtIncomplete();

            mockResumeMeeting.mockResolvedValueOnce({
                liveKey: 'rotated-key',
                meeting: {
                    _id: 77,
                    topic: MockFactory.createTopic({ id: 't', title: 'T', description: '', prompt: '' }),
                    characters: [],
                    conversation: [
                        { id: 'a', text: 'Hi', speaker: 'banana', type: 'message' },
                        { id: 'b', text: 'Bye', speaker: 'apple', type: 'message' },
                    ],
                    audio: ['a', 'b'],
                },
            });

            await act(async () => {
                await result.current.actions.handleOnAttemptResume();
            });

            expect(mockResumeMeeting).toHaveBeenCalledWith({ meetingId: 77 });
            expect(setliveKey).toHaveBeenCalledWith('rotated-key');
            expect(result.current.state.textMessages.map((m: any) => m.id)).toEqual(['a', 'b']);
        });

        it('picks up server-side messages that were generated past maximumPlayedIndex', async () => {
            const setliveKey = vi.fn();
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, liveKey: undefined, setliveKey, currentMeetingId: 1 } as any)
            );
            seedReplayAtIncomplete();

            mockResumeMeeting.mockResolvedValueOnce({
                liveKey: 'k',
                meeting: {
                    _id: 1,
                    topic: MockFactory.createTopic({ id: 't', title: 'T', description: '', prompt: '' }),
                    characters: [],
                    conversation: [
                        { id: 'a', text: 'Hi', speaker: 'banana', type: 'message' },
                        { id: 'b', text: 'Bye', speaker: 'apple', type: 'message' },
                        { id: 'c', text: 'New', speaker: 'cherry', type: 'message' },
                    ],
                    audio: ['a', 'b', 'c'],
                },
            });

            await act(async () => {
                await result.current.actions.handleOnAttemptResume();
            });

            expect(result.current.state.textMessages.map((m: any) => m.id)).toEqual(['a', 'b', 'c']);
        });

        it('on API failure does not flip to live and surfaces an unrecoverable error', async () => {
            const setliveKey = vi.fn();
            const { result } = renderHook(() =>
                useCouncilMachine({
                    ...defaultProps,
                    liveKey: undefined,
                    setliveKey,
                    currentMeetingId: 5,
                } as any)
            );
            seedReplayAtIncomplete();

            mockResumeMeeting.mockRejectedValueOnce(new Error('anything'));

            await act(async () => {
                await result.current.actions.handleOnAttemptResume();
            });

            expect(setliveKey).not.toHaveBeenCalled();
            expect(useErrorStore.getState().unrecoverableError).toMatchObject({
                message: 'anything',
                source: 'useCouncilMachine.resume',
            });
        });
    });

    it('reports summary index when summary is shown (after preceding message finishes)', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useCouncilMachine({ ...defaultProps, currentMeetingId: 100 } as any));

        // 1. Initial message and audio to start playing index 0
        audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');
        await act(async () => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' }
                ]);
            }
            if (socketHandlers.onAudioUpdate) {
                socketHandlers.onAudioUpdate({ id: '1', audio: new ArrayBuffer(8) });
            }
        });

        // 2. Add Summary via conversation update
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' },
                    { id: 'sum1', text: 'Summary', speaker: 'water', type: 'summary' }
                ]);
            }
        });

        // Clear any reports for index 0
        act(() => { vi.advanceTimersByTime(400); });
        mockSocketEmit.mockClear();

        // 3. Finish playing message 0 -> playNextIndex becomes 1
        act(() => {
            result.current.actions.handleOnFinishedPlaying();
        });

        // Machine sees summary at playNextIndex=1, sets 'summary' state, triggers effect
        act(() => {
            vi.advanceTimersByTime(400);
        });

        // Should now have reported index 1
        expect(mockSocketEmit).toHaveBeenCalledWith('report_maximum_played_index', { index: 1 });

        vi.useRealTimers();
    });

    describe('raise hand name overlay', () => {
        it('shows name overlay when humanName is unknown', () => {
            const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

            act(() => {
                result.current.actions.handleOnRaiseHand();
            });

            expect(result.current.state.visibleOverlay).toBe('name');
            expect(result.current.state.isRaisedHand).toBe(false);
        });

        it('skips name overlay when humanName is provided', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, humanName: 'Leo' } as any)
            );

            act(() => {
                result.current.actions.handleOnRaiseHand();
            });

            expect(result.current.state.visibleOverlay).not.toBe('name');
            expect(result.current.state.isRaisedHand).toBe(true);
        });
    });
});

