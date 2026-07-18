
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCouncilMachine } from '@council/hooks/useCouncilMachine';
import { MockFactory } from '../factories/MockFactory';
import { useErrorStore } from '@main/overlay/errorStore';
import { usePendingIntentStore } from '@council/hooks/pendingIntentStore';
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

vi.mock('@/navigation', () => ({
    useRouting: () => ({
        newMeetingPath: '/new',
        meetingPath: (id: number) => `/meeting/${id}`,
        meetingRoutesBase: '/meeting',
    }),
}));

// Mock Socket Hook
let socketHandlers: any = {};
const mockSocketEmit = vi.fn();

vi.mock('@council/hooks/useCouncilSocket', () => ({
    useCouncilSocket: (props: any) => {
        socketHandlers = {
            ...props,
            simulateReconnect: () => props.onReconnect?.(),
        };
        return { current: { emit: mockSocketEmit, connected: true } };
    },
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
        usePendingIntentStore.getState().clearAll();
        mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' });
        mockUseDocumentVisibility.mockReturnValue(true);
    });

    it('initializes in loading state with the meeting id from props', () => {
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, currentMeetingId: 12345 } as any)
        );
        expect(result.current.state.councilState).toBe('loading');
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
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
        );
        expect(result.current.state.councilState).toBe('loading');

        audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');
        await act(async () => {
            socketHandlers.onConversationUpdate?.([
                { id: 'msg1', text: 'Hello', speaker: 'banana', type: 'message' },
            ]);
            socketHandlers.onAudioUpdate?.({ id: 'msg1', audio: new ArrayBuffer(8) });
        });

        // Advance the 0ms initialLoadingMinElapsed timer so the machine leaves loading.
        act(() => { vi.advanceTimersByTime(10); });

        expect(result.current.state.councilState).toBe('playing');
        expect(result.current.state.playingNowIndex).toBe(0);
        vi.useRealTimers();
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
        // Pause-trigger matrix. Each row: render unpaused with `before` environment
        // (and/or fire `after` once rendered), then check whether the machine
        // auto-paused. Add new triggers as rows, not as new prose tests.
        type PauseTrigger = {
            name: string;
            props?: Record<string, unknown>;
            before?: () => void;            // environment set up before render
            after?: (result: any) => void;  // trigger fired after render
            expectPause: boolean;
        };

        const pauseTriggers: PauseTrigger[] = [
            {
                name: 'auto-pauses when location hash is set',
                before: () => mockUseLocation.mockReturnValue({ hash: '#about', pathname: '/meeting/1' }),
                expectPause: true,
            },
            {
                name: 'auto-pauses when connection error is set',
                before: () => useErrorStore.getState().setConnectionError('socket', true),
                expectPause: true,
            },
            {
                name: 'auto-pauses when tab is hidden and meta-agent is inactive',
                before: () => mockUseDocumentVisibility.mockReturnValue(false),
                expectPause: true,
            },
            {
                name: 'does not auto-pause when tab is hidden but meta-agent is active',
                before: () => mockUseDocumentVisibility.mockReturnValue(false),
                props: { metaAgentPhase: 'extension' },
                expectPause: false,
            },
            {
                name: 'auto-pauses when a council overlay opens',
                after: () => socketHandlers.onConversationUpdate?.([{ type: 'query_extension' }]),
                expectPause: true,
            },
            {
                name: 'auto-pauses when name overlay opens',
                after: (result) => result.current.actions.handleOnRaiseHand(),
                expectPause: true,
            },
        ];

        it.each(pauseTriggers)('$name', ({ props, before, after, expectPause }) => {
            const setPaused = vi.fn();
            before?.();

            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, isPaused: false, setPaused, ...props }),
            );
            if (after) act(() => after(result));

            if (expectPause) {
                expect(setPaused).toHaveBeenCalledWith(true);
            } else {
                expect(setPaused).not.toHaveBeenCalled();
            }
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

        // Resume matrix. Each row: enter paused with the `before` environment active,
        // then apply `clear` and check whether the machine auto-resumes. Museum mode
        // auto-resumes when the last environmental interrupt clears; web mode always
        // leaves resuming to the visitor. Add new resume rules as rows.
        type ResumeCase = {
            name: string;
            museum: boolean;
            before: () => void;   // environment that caused the pause
            clear: () => void;    // the change under test
            expectResume: boolean;
        };

        const resumeCases: ResumeCase[] = [
            {
                name: 'resumes in museum mode when hash overlay is dismissed',
                museum: true,
                before: () => mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' }),
                clear: () => mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' }),
                expectResume: true,
            },
            {
                name: 'resumes in museum mode when a manual hash overlay is dismissed',
                museum: true,
                before: () => mockUseLocation.mockReturnValue({ hash: '#about', pathname: '/meeting/1' }),
                clear: () => mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' }),
                expectResume: true,
            },
            {
                name: 'stays paused in web mode when hash overlay is dismissed',
                museum: false,
                before: () => mockUseLocation.mockReturnValue({ hash: '#about', pathname: '/meeting/1' }),
                clear: () => mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' }),
                expectResume: false,
            },
            {
                name: 'resumes in web mode when connection error clears',
                museum: false,
                before: () => useErrorStore.getState().setConnectionError('socket', true),
                clear: () => useErrorStore.getState().setConnectionError('socket', false),
                expectResume: true,
            },
            {
                name: 'resumes in museum mode when connection error clears',
                museum: true,
                before: () => useErrorStore.getState().setConnectionError('socket', true),
                clear: () => useErrorStore.getState().setConnectionError('socket', false),
                expectResume: true,
            },
            {
                name: 'resumes in museum mode when tab becomes visible again',
                museum: true,
                before: () => mockUseDocumentVisibility.mockReturnValue(false),
                clear: () => mockUseDocumentVisibility.mockReturnValue(true),
                expectResume: true,
            },
            {
                name: 'stays paused in web mode when tab becomes visible again',
                museum: false,
                before: () => mockUseDocumentVisibility.mockReturnValue(false),
                clear: () => mockUseDocumentVisibility.mockReturnValue(true),
                expectResume: false,
            },
            {
                name: 'stays paused in museum when hash clears but tab is still hidden',
                museum: true,
                before: () => {
                    mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' });
                    mockUseDocumentVisibility.mockReturnValue(false);
                },
                clear: () => mockUseLocation.mockReturnValue({ hash: '', pathname: '/meeting/1' }),
                expectResume: false,
            },
            {
                name: 'stays paused in museum when tab refocuses but hash overlay is still open',
                museum: true,
                before: () => {
                    mockUseLocation.mockReturnValue({ hash: '#staff', pathname: '/meeting/1' });
                    mockUseDocumentVisibility.mockReturnValue(false);
                },
                clear: () => mockUseDocumentVisibility.mockReturnValue(true),
                expectResume: false,
            },
        ];

        it.each(resumeCases)('$name', ({ museum, before, clear, expectResume }) => {
            const setPaused = vi.fn();
            before();

            const props = { ...defaultProps, isPaused: true, isMuseumMode: museum, setPaused };
            const { rerender } = renderHook((p) => useCouncilMachine(p), { initialProps: props });

            setPaused.mockClear();
            act(() => clear());
            rerender({ ...props });

            if (expectResume) {
                expect(setPaused).toHaveBeenCalledWith(false);
            } else {
                expect(setPaused).not.toHaveBeenCalledWith(false);
            }
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

        it.each([
            { name: 'stays paused when a council overlay is dismissed without acting', sentinel: 'query_extension' },
            { name: 'stays paused when incomplete overlay is dismissed via nevermind', sentinel: 'meeting_incomplete' },
        ])('$name', ({ sentinel }) => {
            const setPaused = vi.fn();
            const props = { ...defaultProps, isPaused: true, setPaused };
            const { result, rerender } = renderHook((p) => useCouncilMachine(p), { initialProps: props });

            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm0', type: 'message', text: 'x', speaker: 'water' },
                    { type: sentinel },
                ]);
            });

            act(() => {
                result.current.actions.declineOverlay();
            });

            setPaused.mockClear();
            rerender({ ...props });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('does not auto-resume in museum mode while a pausing council overlay is open', () => {
            const setPaused = vi.fn();
            const { result, rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: false,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([{ type: 'query_extension' }]);
            });

            expect(result.current.state.visibleOverlay).toBe('query_extension');
            expect(setPaused).toHaveBeenCalledWith(true);
            expect(setPaused).not.toHaveBeenCalledWith(false);

            setPaused.mockClear();
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        it('does not auto-resume in museum mode while meeting_incomplete overlay is open', () => {
            const setPaused = vi.fn();
            const { result, rerender } = renderHook(
                (props) => useCouncilMachine(props),
                {
                    initialProps: {
                        ...defaultProps,
                        isPaused: false,
                        isMuseumMode: true,
                        setPaused,
                    },
                },
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([{ type: 'meeting_incomplete' }]);
            });

            expect(result.current.state.visibleOverlay).toBe('meeting_incomplete');
            expect(setPaused).toHaveBeenCalledWith(true);
            expect(setPaused).not.toHaveBeenCalledWith(false);

            setPaused.mockClear();
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });
            rerender({
                ...defaultProps,
                isPaused: true,
                isMuseumMode: true,
                setPaused,
            });

            expect(setPaused).not.toHaveBeenCalledWith(false);
        });

        describe('deferred connection error overlay', () => {
            it('does not set connectionError when socket error fires while playing with buffered next message', async () => {
                vi.useFakeTimers();
                const { result } = renderHook(() =>
                    useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
                );

                audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');
                await act(async () => {
                    socketHandlers.onConversationUpdate?.([
                        { id: 'm1', text: 'Hello', speaker: 'banana', type: 'message' },
                    ]);
                    socketHandlers.onAudioUpdate?.({ id: 'm1', audio: new ArrayBuffer(8) });
                });

                // Advance the 0ms initialLoadingMinElapsed timer so the machine leaves loading.
                act(() => { vi.advanceTimersByTime(10); });

                // Confirm the machine has advanced out of loading.
                expect(result.current.state.councilState).toBe('playing');

                act(() => {
                    socketHandlers.onConnectionError?.(new Error('test drop'));
                });

                expect(useErrorStore.getState().connectionError).toBe(false);
                vi.useRealTimers();
            });

            it('sets connectionError when stalled in loading with no buffered data', () => {
                renderHook(() =>
                    useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
                );

                // Default state: loading, nothing buffered.
                expect(useErrorStore.getState().connectionError).toBe(false);

                act(() => {
                    socketHandlers.onConnectionError?.(new Error('test drop'));
                });

                expect(useErrorStore.getState().connectionError).toBe(true);
            });

            it('does not set connectionError in replay mode (no liveKey)', () => {
                renderHook(() =>
                    useCouncilMachine({ ...defaultProps, liveKey: undefined, currentMeetingId: 1 } as any),
                );

                act(() => {
                    socketHandlers.onConnectionError?.(new Error('test drop'));
                });

                expect(useErrorStore.getState().connectionError).toBe(false);
            });

            it('clears connectionError immediately when onConnect fires', () => {
                renderHook(() =>
                    useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
                );

                act(() => {
                    socketHandlers.onConnectionError?.(new Error('test drop'));
                });
                expect(useErrorStore.getState().connectionError).toBe(true);

                act(() => {
                    socketHandlers.onConnect?.();
                });

                expect(useErrorStore.getState().connectionError).toBe(false);
            });
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
            result.current.actions.handleOnSubmitHumanMessage('My Panelist Response');
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
            result.current.actions.handleOnSubmitHumanMessage('My Panelist Response');
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
            socketHandlers.simulateReconnect?.();
        });

        // Should not have emitted attempt_reconnection because no meeting started yet
        expect(mockSocketEmit).not.toHaveBeenCalledWith('attempt_reconnection', expect.anything());
    });

    it('should emit attempt_reconnection if a meeting was already active', () => {
        renderHook(() => useCouncilMachine({ ...defaultProps, currentMeetingId: 999 } as any));

        act(() => {
            socketHandlers.simulateReconnect?.();
        });

        expect(mockSocketEmit).toHaveBeenCalledWith('attempt_reconnection', expect.objectContaining({
            meetingId: 999,
            liveKey: 'test-live-key',
        }));
    });

    it('does not report maximum played index while reconnect handshake is in flight', async () => {
        const { result } = renderHook(() =>
            useCouncilMachine({ ...defaultProps, currentMeetingId: 100 } as any)
        );

        audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');
        await act(async () => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' },
                ]);
            }
            if (socketHandlers.onAudioUpdate) {
                socketHandlers.onAudioUpdate({ id: '1', audio: new ArrayBuffer(8) });
            }
        });

        mockSocketEmit.mockClear();

        act(() => {
            socketHandlers.simulateReconnect?.();
        });

        act(() => {
            result.current.actions.handleOnFinishedPlaying();
        });

        expect(mockSocketEmit).not.toHaveBeenCalledWith(
            'report_maximum_played_index',
            expect.anything(),
        );
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
        const { result } = renderHook(() => useCouncilMachine({ ...defaultProps, currentMeetingId: 100 } as any));

        audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' },
                ]);
            }
        });

        await act(async () => {
            if (socketHandlers.onAudioUpdate) {
                socketHandlers.onAudioUpdate({ id: '1', audio: new ArrayBuffer(8) });
            }
        });

        await waitFor(() => {
            expect(result.current.state.playingNowIndex).toBe(0);
        });

        mockSocketEmit.mockClear();

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: '1', text: 'Hello', speaker: 'banana', type: 'message' },
                    { id: 'sum1', text: 'Summary', speaker: 'water', type: 'summary' },
                ]);
            }
        });

        expect(mockSocketEmit).toHaveBeenCalledWith('report_maximum_played_index', { index: 1 });
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

    describe('raise-hand intent reconciler', () => {
        it('emits raise_hand immediately on the happy path (socket healthy, no reconnect in flight)', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Leo' } as any),
            );

            act(() => {
                result.current.actions.handleOnRaiseHand();
            });

            expect(mockSocketEmit).toHaveBeenCalledWith(
                'raise_hand',
                expect.objectContaining({ humanName: 'Leo' }),
            );
            // Intent is NOT cleared at emit time — only once the server's
            // awaiting sentinel confirms the raise landed. This means a
            // raise_hand lost between emit and ack still has a live intent
            // to retry, instead of depending on socket.io's sendBuffer.
            expect(usePendingIntentStore.getState().intent).toMatchObject({
                kind: 'raise-hand',
                humanName: 'Leo',
            });

            mockSocketEmit.mockClear();

            // Server confirms: conversation now carries the awaiting sentinel.
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm1', text: 'Hi', speaker: 'banana', type: 'message' },
                    { type: 'awaiting_human_question', speaker: 'Leo' },
                ]);
            });

            // Intent is now cleared, and no duplicate raise_hand is emitted.
            expect(usePendingIntentStore.getState().intent).toBeNull();
            expect(mockSocketEmit).not.toHaveBeenCalledWith('raise_hand', expect.anything());
        });

        it('re-emits raise_hand if the first emit is lost before the awaiting sentinel appears (e.g. disconnect mid-flight)', () => {
            // Regression test for the clear-at-emit bug: previously the intent was
            // removed from the store synchronously at emit time, so a raise_hand
            // lost to a disconnect right after emit had no durable intent left to
            // retry, and depended entirely on socket.io's sendBuffer replay.
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Sam' } as any),
            );

            act(() => {
                result.current.actions.handleOnRaiseHand();
            });

            expect(mockSocketEmit).toHaveBeenCalledWith(
                'raise_hand',
                expect.objectContaining({ humanName: 'Sam' }),
            );
            expect(usePendingIntentStore.getState().intent).not.toBeNull();

            mockSocketEmit.mockClear();

            // Simulate the emit being lost: socket drops and reconnects, and the
            // resumed conversation does NOT yet contain the awaiting sentinel
            // (the raise never reached the server).
            act(() => {
                socketHandlers.simulateReconnect();
            });
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm1', text: 'Hi', speaker: 'banana', type: 'message' },
                ]);
            });

            // The intent survived, so the reconciler retries the raise.
            expect(mockSocketEmit).toHaveBeenCalledWith(
                'raise_hand',
                expect.objectContaining({ humanName: 'Sam' }),
            );
        });

        it('holds the intent during reconnect handshake and emits after conversation_update completes it', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Alex' } as any),
            );

            // Simulate socket reconnecting: attemptingReconnect becomes true.
            act(() => {
                socketHandlers.simulateReconnect();
            });

            mockSocketEmit.mockClear();

            act(() => {
                result.current.actions.handleOnRaiseHand();
            });

            // Intent should be stored but raise_hand NOT yet emitted.
            expect(mockSocketEmit).not.toHaveBeenCalledWith('raise_hand', expect.anything());
            expect(usePendingIntentStore.getState().intent).toMatchObject({
                kind: 'raise-hand',
                humanName: 'Alex',
                meetingId: 1,
            });

            // Reconnect handshake completes when the server sends conversation_update.
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm1', text: 'Hello', speaker: 'banana', type: 'message' },
                ]);
            });

            // Now the reconciler should have fired.
            expect(mockSocketEmit).toHaveBeenCalledWith(
                'raise_hand',
                expect.objectContaining({ humanName: 'Alex' }),
            );
            // Intent clears only once the server confirms via the awaiting
            // sentinel, not synchronously at emit time.
            expect(usePendingIntentStore.getState().intent).not.toBeNull();

            mockSocketEmit.mockClear();
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm1', text: 'Hello', speaker: 'banana', type: 'message' },
                    { type: 'awaiting_human_question', speaker: 'Alex' },
                ]);
            });

            expect(usePendingIntentStore.getState().intent).toBeNull();
            expect(mockSocketEmit).not.toHaveBeenCalledWith('raise_hand', expect.anything());
        });

        it('does not re-emit raise_hand when server already processed it (awaiting sentinel on reconnect)', () => {
            // Scenario: user raised hand, raise_hand was processed by the server before the
            // disconnect. On reconnect the server sends back state with awaiting_human_question.
            // The reconciler must not double-send raise_hand.
            renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Sam' } as any),
            );

            act(() => { socketHandlers.simulateReconnect(); });

            // Inject a pending intent directly (simulating pre-disconnect state).
            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'raise-hand', meetingId: 1, index: 1, humanName: 'Sam',
                });
            });

            mockSocketEmit.mockClear();

            // Server sends back state that already includes the awaiting sentinel.
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'm1', text: 'Hi', speaker: 'banana', type: 'message' },
                    { type: 'awaiting_human_question', speaker: 'Sam' },
                ]);
            });

            expect(mockSocketEmit).not.toHaveBeenCalledWith('raise_hand', expect.anything());
        });

        it('clears all pending intents on unmount (meeting change / navigation)', () => {
            const { unmount } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Jo' } as any),
            );

            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'raise-hand', meetingId: 1, index: 1, humanName: 'Jo',
                });
            });

            unmount();

            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('ignores a stale intent tagged for a different meeting', () => {
            renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 99, humanName: 'Max' } as any),
            );

            // Manually inject an intent for a different meeting.
            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'raise-hand',
                    meetingId: 42,
                    index: 1,
                    humanName: 'Max',
                });
            });

            // No conversation update needed — the gate checks meetingId !== currentMeetingId.
            expect(mockSocketEmit).not.toHaveBeenCalledWith('raise_hand', expect.anything());
        });
    });

    describe('human-draft intent reconciler', () => {
        it('does not double-submit in the connected happy path', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Sam' } as any),
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { type: 'awaiting_human_question', speaker: 'Sam' },
                ]);
            });
            expect(result.current.state.councilState).toBe('human_input');

            act(() => {
                result.current.actions.handleOnSubmitHumanMessage('Hello world');
            });

            expect(mockSocketEmit).toHaveBeenCalledTimes(1);
            expect(mockSocketEmit).toHaveBeenCalledWith('submit_human_message', { text: 'Hello world' });

            // The reconciler observes the submit's own local truncation removed the
            // awaiting sentinel and clears the intent — no lingering re-fire.
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('auto-resubmits the retained draft after a disconnect swallows the original submit', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Sam' } as any),
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { type: 'awaiting_human_question', speaker: 'Sam' },
                ]);
            });
            expect(result.current.state.councilState).toBe('human_input');

            // Socket is mid-reconnect at the moment of submit: the raw emit is
            // fired (and, in the real world, buffered/lost by socket.io) but the
            // reconciler's global gate blocks any retry attempt until the resume
            // handshake completes (mirrors the raise-hand reconnect test above —
            // attemptingReconnect, not just socketUnhealthy, must be closed the
            // whole time, otherwise the reconciler can run against stale local
            // state in the gap between transport reconnect and fresh data).
            act(() => {
                socketHandlers.simulateReconnect();
            });

            act(() => {
                result.current.actions.handleOnSubmitHumanMessage('Hello world');
            });

            expect(usePendingIntentStore.getState().intent).toMatchObject({
                kind: 'human-draft',
                text: 'Hello world',
                mode: 'question',
            });

            mockSocketEmit.mockClear();

            // Resume handshake completes: server never actually received the
            // submit, so its resumed conversation still shows the original
            // awaiting sentinel.
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { type: 'awaiting_human_question', speaker: 'Sam' },
                ]);
            });

            // The reconciler recognizes the intent is still unfulfilled and
            // resubmits the retained text — the user never has to retype it.
            expect(mockSocketEmit).toHaveBeenCalledWith('submit_human_message', { text: 'Hello world' });
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('ignores a human-draft intent tagged for a different meeting', () => {
            renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 99, humanName: 'Max' } as any),
            );

            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'human-draft',
                    meetingId: 42,
                    text: 'stale draft',
                    mode: 'question',
                    index: 0,
                });
            });

            expect(mockSocketEmit).not.toHaveBeenCalledWith('submit_human_message', expect.anything());
        });

        it('skips replaying the invitation when a human-draft intent already answers the sentinel right after it', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Sam' } as any),
            );

            // Resumed conversation still has the invitation ahead of the awaiting
            // sentinel (the original submit never reached the server). Default
            // playNextIndex (0) points right at the invitation.
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'inv1', type: 'invitation', speaker: 'chair', text: 'Ask away' },
                    { type: 'awaiting_human_question', speaker: 'Sam' },
                ]);
            });
            expect(result.current.state.playNextIndex).toBe(0);

            // Re-enter "mid-reconnect": keeps Action B (auto-resubmit) gated off
            // below (onConversationUpdate itself always clears
            // attemptingReconnect, so this has to happen *after* the update
            // above, not before), so the skip's own effect on
            // playingNowIndex/playNextIndex can be observed in isolation before
            // the resubmit's own rewind runs.
            act(() => {
                socketHandlers.simulateReconnect();
            });

            // A human-draft intent is already queued for the sentinel at index 1
            // (as if the user had answered before the disconnect).
            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'human-draft',
                    meetingId: 1,
                    text: 'Hello world',
                    mode: 'question',
                    index: 1,
                });
            });

            // Jumped straight past the invitation instead of playing it —
            // playingNowIndex marks it as passed without ever entering the
            // 'loading'/'playing' switch for it. Action B is still gated off
            // (attemptingReconnect), so this reflects only the skip.
            expect(result.current.state.playingNowIndex).toBe(0);
            expect(result.current.state.playNextIndex).toBe(1);
            expect(result.current.state.councilState).toBe('human_input');
            expect(mockSocketEmit).not.toHaveBeenCalledWith('submit_human_message', expect.anything());

            // Handshake completes: Action B (auto-resubmit) takes over.
            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'inv1', type: 'invitation', speaker: 'chair', text: 'Ask away' },
                    { type: 'awaiting_human_question', speaker: 'Sam' },
                ]);
            });
            expect(mockSocketEmit).toHaveBeenCalledWith('submit_human_message', { text: 'Hello world' });
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });
    });

    describe('resolve-extension intent reconciler', () => {
        it('does not double-fire in the connected happy path (extend)', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([{ type: 'query_extension' }]);
            });
            expect(result.current.state.councilState).toBe('query_extension');

            mockSocketEmit.mockClear();
            act(() => {
                result.current.actions.handleOnExtendMeeting();
            });

            expect(mockSocketEmit).toHaveBeenCalledTimes(1);
            expect(mockSocketEmit).toHaveBeenCalledWith('extend_meeting');

            // The reconciler observes the choice's own local truncation removed
            // the query_extension sentinel and clears the intent — no re-fire.
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('auto-resolves the retained choice after a disconnect swallows the original extend_meeting', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
            );

            const conversation = [{ type: 'query_extension' }];
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });
            expect(result.current.state.councilState).toBe('query_extension');

            // Mid-reconnect at the moment of the click: the raw emit fires (and,
            // in the real world, is buffered/lost by socket.io) but the
            // reconciler's global gate blocks any retry until the resume
            // handshake completes.
            act(() => {
                socketHandlers.simulateReconnect();
            });

            act(() => {
                result.current.actions.handleOnExtendMeeting();
            });

            expect(usePendingIntentStore.getState().intent).toMatchObject({
                kind: 'resolve-extension',
                choice: 'extend',
            });

            mockSocketEmit.mockClear();

            // Resume handshake completes: server never actually received the
            // choice, so its resumed conversation still shows the original
            // query_extension sentinel.
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });

            expect(mockSocketEmit).toHaveBeenCalledWith('extend_meeting');
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('auto-resolves conclude with the originally captured date, not a re-derived one', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
            );

            const conversation = [{ type: 'query_extension' }];
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });

            act(() => {
                socketHandlers.simulateReconnect();
            });
            act(() => {
                result.current.actions.handleOnConcludeMeeting();
            });

            const capturedDate = (usePendingIntentStore.getState().intent as any)?.date;
            expect(typeof capturedDate).toBe('string');

            mockSocketEmit.mockClear();
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });

            expect(mockSocketEmit).toHaveBeenCalledWith('conclude_meeting', { date: capturedDate });
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('ignores a resolve-extension intent tagged for a different meeting', () => {
            renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 99 } as any),
            );

            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'resolve-extension',
                    meetingId: 42,
                    choice: 'extend',
                    index: 0,
                });
            });

            expect(mockSocketEmit).not.toHaveBeenCalledWith('extend_meeting');
        });
    });

    describe('skip-turn intent reconciler', () => {
        it('does not double-fire in the connected happy path (question)', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Frank' } as any),
            );

            act(() => {
                socketHandlers.onConversationUpdate?.([
                    { id: 'msg_question', text: '...', speaker: 'Frank', type: 'awaiting_human_question' },
                ]);
            });
            expect(result.current.state.councilState).toBe('human_input');

            mockSocketEmit.mockClear();
            act(() => {
                result.current.actions.handleOnAbandonHumanTurn();
            });

            expect(mockSocketEmit).toHaveBeenCalledTimes(1);
            expect(mockSocketEmit).toHaveBeenCalledWith('skip_human_turn');

            // The reconciler observes the skip's own local truncation removed
            // the awaiting sentinel and clears the intent — no re-fire.
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('auto-resolves the retained skip after a disconnect swallows the original skip_human_turn', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1, humanName: 'Frank' } as any),
            );

            const conversation = [
                { id: 'msg_question', text: '...', speaker: 'Frank', type: 'awaiting_human_question' },
            ];
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });
            expect(result.current.state.councilState).toBe('human_input');

            // Mid-reconnect at the moment of the click: the raw emit fires (and,
            // in the real world, is buffered/lost by socket.io) but the
            // reconciler's global gate blocks any retry until the resume
            // handshake completes.
            act(() => {
                socketHandlers.simulateReconnect();
            });

            act(() => {
                result.current.actions.handleOnAbandonHumanTurn();
            });

            expect(usePendingIntentStore.getState().intent).toMatchObject({
                kind: 'skip-turn',
                mode: 'question',
                speaker: 'Frank',
            });
            mockSocketEmit.mockClear();

            // Resume handshake completes: server never actually received the
            // skip, so its resumed conversation still shows the original
            // awaiting sentinel.
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });

            expect(mockSocketEmit).toHaveBeenCalledWith('skip_human_turn');
            expect(result.current.state.textMessages).toEqual([
                expect.objectContaining({ type: 'skipped', speaker: 'Frank', text: '' }),
            ]);
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('auto-resolves a panelist skip, crediting the panelist speaker', () => {
            const { result } = renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 1 } as any),
            );

            const conversation = [
                { id: 'msg_panelist', text: '...', speaker: 'human-panelist-1', type: 'awaiting_human_panelist' },
            ];
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });
            expect(result.current.state.councilState).toBe('human_panelist');

            act(() => {
                socketHandlers.simulateReconnect();
            });
            act(() => {
                result.current.actions.handleOnAbandonHumanTurn();
            });

            mockSocketEmit.mockClear();
            act(() => {
                socketHandlers.onConversationUpdate?.(conversation);
            });

            expect(mockSocketEmit).toHaveBeenCalledWith('skip_human_turn');
            expect(result.current.state.textMessages).toEqual([
                expect.objectContaining({ type: 'skipped', speaker: 'human-panelist-1', text: '' }),
            ]);
            expect(usePendingIntentStore.getState().intent).toBeNull();
        });

        it('ignores a skip-turn intent tagged for a different meeting', () => {
            renderHook(() =>
                useCouncilMachine({ ...defaultProps, currentMeetingId: 99 } as any),
            );

            act(() => {
                usePendingIntentStore.getState().setPendingIntent({
                    kind: 'skip-turn',
                    meetingId: 42,
                    mode: 'question',
                    index: 0,
                    speaker: 'Frank',
                });
            });

            expect(mockSocketEmit).not.toHaveBeenCalledWith('skip_human_turn');
        });
    });
});

