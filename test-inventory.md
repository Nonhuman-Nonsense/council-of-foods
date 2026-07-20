# Test-suite inventory (generated 2026-07-20)

A periodic mechanical scan of the test suite — see [TESTING.md](TESTING.md) for the rubric
it supports. Regenerate with `node generate-test-inventory.mjs` (see the header of that
script) rather than hand-editing the tables; it's a diagnostic tool, not a target — re-run it
before a major refactor or when the suite feels like it's drifted, not on a fixed schedule.

**Totals:** 159 test files, ~1274 cases
(client 105 files / 837 cases, server 54 files / 437 cases).

Columns: **ms** = wall time for the file in the profiling run (blank if no report; Playwright
e2e specs always run outside vitest). **asserts/case** = expect() calls per test — very low
values can flag weak tests, very high values flag multi-behavior tests. **churn** = commits
touching the file in the last 6 months (high churn = high-maintenance).

## Review flags (mechanical, no judgment applied)

### Large files (>400 lines) — table-driven / consolidation candidates
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 53 (+4 each) | 1774 |  | 2.8 | 43 |
| client/tests/unit/components/HumanInput.render.test.tsx | 45 | 1196 |  | 1.8 | 2 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 23 | 551 |  | 1.9 | 24 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 |  | 2.8 | 6 |
| server/tests/DialogGenerator.test.js | 25 | 513 |  | 2.1 | 10 |
| client/tests/unit/realtime/realtimeEventLoop.test.ts | 11 | 443 |  | 3.5 | 0 |
| server/tests/meetingsHttpAndSocket.integration.test.js | 10 | 419 |  | 2.7 | 12 |
| client/tests/unit/components/settings/SelectTopic.test.tsx | 10 | 409 |  | 3.7 | 3 |
| client/tests/unit/setupAgent/setupAgentTools.test.ts | 41 | 406 |  | 1.5 | 0 |

### Slowest files (>2s)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
_none_

### Weak assertion density (<1.5 expect/case, excluding .each tables)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/audio/audioContext.test.ts | 5 | 56 |  | 0.8 | 2 |
| server/tests/SpeakerSelection.test.js | 27 | 349 |  | 1 | 8 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 |  | 1 | 6 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 |  | 1 | 5 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 |  | 1 | 3 |
| client/tests/unit/components/overlays/Incomplete.test.tsx | 5 | 64 |  | 1 | 4 |
| client/tests/unit/api/httpErrorMessage.test.ts | 7 | 40 |  | 1 | 1 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 9 | 162 |  | 1.1 | 12 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 |  | 1.1 | 1 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 17 | 260 |  | 1.2 | 4 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 |  | 1.2 | 1 |
| server/tests/AudioUtils.test.ts | 16 | 191 |  | 1.3 | 6 |
| client/tests/unit/api/createMeeting.test.ts | 4 | 81 |  | 1.3 | 1 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 |  | 1.3 | 1 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 |  | 1.4 | 3 |
| client/tests/unit/setupAgent/MeetingSetupAgent.ptt.test.tsx | 7 | 180 |  | 1.4 | 0 |
| server/tests/textUtils.test.js | 15 | 172 |  | 1.4 | 3 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 |  | 1.4 | 2 |

### Duplicate test names across files
- `should have a valid JSON file for every available language` — client/tests/unit/ValidateFoodData.test.ts, client/tests/unit/ValidateTopicsData.test.ts
- `renders children correctly` — client/tests/unit/components/Overlay.test.tsx, client/tests/unit/components/OverlayWrapper.test.tsx
- `does not send LED commands when usb serial is disconnected` — client/tests/unit/museum/button/bridgeTransport.test.ts, client/tests/unit/museum/button/buttonStore.test.ts
- `keeps owner when claimed with off LED` — client/tests/unit/museum/button/buttonStore.test.ts, client/tests/unit/museum/button/useButton.test.ts

## Coverage gaps (source files < 50% statements covered)

Low coverage is a *prompt to check for untested behaviors*, not a target (TESTING.md).
Entry points, dev tooling, and thin wrappers may be fine uncovered.

### Client
| source file | % stmts | stmts |
|---|---|---|
| client/src/api/fetchAutoplayMeeting.ts | 0 | 7 |
| client/src/main/Loading.tsx | 0 | 2 |
| client/src/museum/button/useButton.ts | 28 | 43 |

### Server
| source file | % stmts | stmts |
|---|---|---|
| server/src/services/OpenAIService.ts | 33 | 6 |
| server/src/api/devErrorbotRoutes.ts | 34 | 32 |

## Full inventory

### Client
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 53 (+4 each) | 1774 |  | 2.8 | 43 |
| client/tests/unit/components/HumanInput.render.test.tsx | 45 | 1196 |  | 1.8 | 2 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 23 | 551 |  | 1.9 | 24 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 |  | 2.8 | 6 |
| client/tests/unit/realtime/realtimeEventLoop.test.ts | 11 | 443 |  | 3.5 | 0 |
| client/tests/unit/components/settings/SelectTopic.test.tsx | 10 | 409 |  | 3.7 | 3 |
| client/tests/unit/setupAgent/setupAgentTools.test.ts | 41 | 406 |  | 1.5 | 0 |
| client/tests/unit/components/Staff.test.tsx | 25 | 390 |  | 2.6 | 2 |
| client/tests/unit/museum/button/bridgeTransport.test.ts | 11 | 387 |  | 3.1 | 4 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 13 | 379 |  | 2.6 | 10 |
| client/tests/unit/museum/button/buttonStore.test.ts | 25 | 354 |  | 2.3 | 11 |
| client/tests/unit/components/overlays/Summary.test.tsx | 10 | 349 |  | 2.6 | 12 |
| client/tests/unit/autoplay/AutoplayCoordinator.test.tsx | 13 (+1 each) | 333 |  | 2.1 | 8 |
| client/tests/unit/components/Council.test.tsx | 10 | 329 |  | 1.6 | 36 |
| client/tests/unit/components/LiveAudioVisualizer.test.tsx | 7 | 268 |  | 3.7 | 4 |
| client/tests/unit/museum/metaAgent/metaAgentPrompt.test.ts | 25 | 265 |  | 2.2 | 8 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 17 | 260 |  | 1.2 | 4 |
| client/tests/unit/settings/councilSettings.test.tsx | 21 | 256 |  | 2.5 | 4 |
| client/tests/unit/realtime/inworldSubtitleTrack.test.ts | 23 | 252 |  | 1.6 | 0 |
| client/tests/unit/meetingSetup.test.ts | 10 | 247 |  | 3.2 | 8 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 |  | 1.4 | 3 |
| client/tests/unit/components/RouterLogic.test.tsx | 8 | 238 |  | 1.9 | 18 |
| client/tests/unit/components/MeetingSetupReset.test.tsx | 3 | 214 |  | 2.7 | 5 |
| client/tests/unit/components/settings/SelectFoods.test.tsx | 8 | 206 |  | 3.3 | 2 |
| client/tests/foods/Main.test.tsx | 4 | 204 |  | 1.5 | 2 |
| client/tests/unit/logger.test.ts | 12 | 204 |  | 1.8 | 6 |
| client/tests/unit/AutoButton.test.tsx | 7 | 203 |  | 2.4 | 1 |
| client/tests/unit/setupAgent/MeetingSetupAgent.ptt.test.tsx | 7 | 180 |  | 1.4 | 0 |
| client/tests/unit/components/FoodItem.test.tsx | 7 | 178 |  | 1.9 | 4 |
| client/tests/unit/components/HumanInput.test.tsx | 15 | 175 |  | 1.9 | 7 |
| client/tests/unit/main/overlay/Reconnecting.test.tsx | 5 | 169 |  | 1.6 | 5 |
| client/tests/unit/components/FoodAnimation.test.tsx | 6 | 168 |  | 2 | 8 |
| client/tests/unit/components/ConversationControls.test.tsx | 12 | 166 |  | 2.3 | 3 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 9 | 162 |  | 1.1 | 12 |
| client/tests/unit/museum/button/museumButton.test.tsx | 9 | 156 |  | 2 | 3 |
| client/tests/unit/main/overlay/CouncilError.test.tsx | 4 | 148 |  | 2 | 2 |
| client/tests/unit/components/AudioOutputMessage.test.tsx | 5 | 147 |  | 2.2 | 6 |
| client/tests/unit/components/Main.test.tsx | 3 | 147 |  | 1.3 | 2 |
| client/tests/unit/components/NewMeeting.creatorKey.test.tsx | 1 | 146 |  | 4 | 16 |
| client/tests/unit/museum/useMuseumCursorHide.test.ts | 7 | 138 |  | 2 | 1 |
| client/tests/unit/components/TextOutput.test.tsx | 6 | 137 |  | 2.7 | 5 |
| client/tests/unit/components/MainOverlays.test.tsx | 10 | 135 |  | 1.6 | 11 |
| client/tests/unit/museum/button/buttonIntentIntegration.test.tsx | 5 | 132 |  | 2.8 | 4 |
| client/tests/unit/navigation/reloadApp.test.ts | 5 | 132 |  | 2.8 | 3 |
| client/tests/unit/components/settings/Landing.test.tsx | 4 | 128 |  | 2.5 | 13 |
| client/tests/unit/audio/wakeLock.test.ts | 7 | 119 |  | 1.9 | 0 |
| client/tests/unit/realtime/RealtimeCaptionOverlay.test.tsx | 7 | 119 |  | 2 | 7 |
| client/tests/unit/api/http.test.ts | 5 | 115 |  | 1.8 | 2 |
| client/tests/unit/components/Navbar.test.tsx | 5 | 115 |  | 2.4 | 10 |
| client/tests/unit/museum/metaAgent/metaAgentTools.test.ts | 8 | 115 |  | 2.9 | 10 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 |  | 1.4 | 2 |
| client/tests/unit/components/FoodsCouncilScene.test.tsx | 2 | 113 |  | 3 | 9 |
| client/tests/unit/ValidateFoodData.test.ts | 2 | 110 |  | 9 | 6 |
| client/tests/unit/setupAgent/useSetupAgent.test.ts | 4 | 110 |  | 1.5 | 0 |
| client/tests/unit/components/AudioOutput.test.tsx | 4 | 101 |  | 1.5 | 4 |
| client/tests/unit/components/Output.test.tsx | 5 | 101 |  | 2.4 | 7 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 |  | 1.1 | 1 |
| client/tests/unit/ValidateTopicsData.test.ts | 2 | 93 |  | 11 | 4 |
| client/tests/unit/autoplay/autoplayStore.test.ts | 7 | 91 |  | 2.3 | 8 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 |  | 1 | 6 |
| client/tests/unit/components/overlays/Name.test.tsx | 5 (+1 each) | 88 |  | 2 | 3 |
| client/tests/unit/museum/button/ButtonBanner.test.tsx | 4 | 86 |  | 1.5 | 4 |
| client/tests/unit/utils.test.ts | 11 | 84 |  | 1.8 | 2 |
| client/tests/unit/components/Overlay.test.tsx | 6 | 82 |  | 1.5 | 1 |
| client/tests/unit/museum/button/useButton.test.ts | 3 | 82 |  | 3.3 | 3 |
| client/tests/unit/api/createMeeting.test.ts | 4 | 81 |  | 1.3 | 1 |
| client/tests/unit/api/resumeMeeting.test.ts | 2 (+1 each) | 81 |  | 4.5 | 4 |
| client/tests/unit/components/FullscreenButton.test.tsx | 3 | 79 |  | 1.3 | 3 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 |  | 1.3 | 1 |
| client/tests/unit/FoodVideoIntegrity.test.ts | 1 | 72 |  | 6 | 6 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 |  | 1.2 | 1 |
| client/tests/unit/locales.test.ts | 4 | 67 |  | 1.5 | 1 |
| client/tests/unit/routing.multilanguage.test.ts | 6 | 66 |  | 1.7 | 3 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 |  | 1 | 3 |
| client/tests/unit/components/overlays/Incomplete.test.tsx | 5 | 64 |  | 1 | 4 |
| client/tests/unit/museum/metaAgent/useMetaAgent.test.ts | 1 | 62 |  | 1 | 4 |
| client/tests/unit/components/Background.test.tsx | 3 | 61 |  | 2 | 1 |
| client/tests/unit/components/overlays/Contact.test.tsx | 1 | 58 |  | 10 | 2 |
| client/tests/unit/agendaPointInjection.test.ts | 6 | 57 |  | 1.5 | 1 |
| client/tests/unit/components/ConversationControlIcon.test.tsx | 4 | 57 |  | 1.8 | 3 |
| client/tests/unit/museum/MuseumSwitchButton.test.tsx | 4 | 57 |  | 1.5 | 2 |
| client/tests/unit/audio/audioContext.test.ts | 5 | 56 |  | 0.8 | 2 |
| client/tests/unit/topicPrompt.test.ts | 5 | 54 |  | 2.8 | 3 |
| client/tests/unit/api/getMeeting.test.ts | 2 | 48 |  | 1 | 4 |
| client/tests/unit/autoplay/AutoplayWarning.test.tsx | 2 | 48 |  | 2 | 2 |
| client/tests/unit/realtime/realtimeProtocol.test.ts | 2 | 47 |  | 2.5 | 2 |
| client/tests/e2e/src/meeting_flow.spec.ts | 2 | 46 |  | 6 | 6 |
| client/tests/unit/routing.singleLanguage.test.ts | 2 | 45 |  | 2.5 | 4 |
| client/tests/unit/setupAgent/setupAgentPrompt.test.ts | 6 | 44 |  | 1.7 | 0 |
| client/tests/unit/museum/button/bridgeHealth.test.ts | 2 | 43 |  | 1 | 3 |
| client/tests/unit/museum/button/ButtonLedDebugOverlay.test.tsx | 3 | 42 |  | 2.3 | 5 |
| client/tests/unit/main/ErrorBoundary.test.tsx | 2 | 41 |  | 1.5 | 0 |
| client/tests/unit/setupAgent/SetupAgentOverlay.test.tsx | 2 | 41 |  | 1 | 0 |
| client/tests/unit/api/httpErrorMessage.test.ts | 7 | 40 |  | 1 | 1 |
| client/tests/unit/shared/devPorts.test.ts | 5 | 39 |  | 1.6 | 2 |
| client/tests/unit/components/VideoPreloader.test.tsx | 2 | 38 |  | 5.5 | 3 |
| client/tests/unit/components/overlays/About.test.tsx | 1 | 38 |  | 5 | 2 |
| client/tests/unit/museum/button/buttonLedDebug.test.ts | 3 | 38 |  | 2 | 2 |
| client/tests/unit/museum/button/protocol.test.ts | 4 | 35 |  | 2.3 | 1 |
| client/tests/unit/newMeeting/meetingSetupStore.test.ts | 1 | 29 |  | 6 | 1 |
| client/tests/unit/IconIntegrity.test.ts | 1 | 28 |  | 2 | 1 |
| client/tests/unit/FoodImageIntegrity.test.ts | 1 | 26 |  | 3 | 6 |
| client/tests/unit/routing.test.ts | 1 | 22 |  | 1 | 6 |
| client/tests/unit/characterSetupMetadata.test.ts | 2 | 20 |  | 1.5 | 1 |

### Server
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| server/tests/DialogGenerator.test.js | 25 | 513 |  | 2.1 | 10 |
| server/tests/meetingsHttpAndSocket.integration.test.js | 10 | 419 |  | 2.7 | 12 |
| server/tests/realtimeProviders.test.ts | 11 (+1 each) | 396 |  | 2.5 | 12 |
| server/tests/AudioSystemInworld.test.js | 8 | 395 |  | 2 | 10 |
| server/tests/SpeakerSelection.test.js | 27 | 349 |  | 1 | 8 |
| server/tests/ConversationFlow.test.js | 9 | 339 |  | 4.7 | 19 |
| server/tests/replayManifest.test.ts | 24 | 339 |  | 1.5 | 14 |
| server/tests/realtimeSessionApi.integration.test.ts | 12 | 327 |  | 2.7 | 5 |
| server/tests/AsyncErrorPropagation.test.js | 5 | 326 |  | 3.4 | 13 |
| server/tests/AudioSystemElevenLabs.test.js | 8 | 317 |  | 2.3 | 5 |
| server/tests/meetingsHttp.integration.test.js | 12 | 316 |  | 3.1 | 14 |
| server/tests/MeetingLifecycleHandler.test.js | 13 | 314 |  | 3.1 | 16 |
| server/tests/HumanInput.test.js | 10 | 258 |  | 5.2 | 12 |
| server/tests/PronunciationUtils.test.ts | 22 | 245 |  | 1.9 | 3 |
| server/tests/AudioSystem.test.js | 8 | 240 |  | 1.8 | 6 |
| server/tests/SpeakerTargetClassifier.test.ts | 9 | 239 |  | 2.8 | 7 |
| server/tests/MeetingLoopHardening.test.js | 6 | 234 |  | 4 | 3 |
| server/tests/ConversationService.test.ts | 9 | 233 |  | 2.1 | 6 |
| server/tests/SummaryGeneration.test.ts | 2 | 219 |  | 6 | 5 |
| server/tests/SummaryPendingConclude.test.js | 9 | 218 |  | 2.6 | 2 |
| server/tests/ConnectionHandler.test.js | 8 | 207 |  | 2.9 | 9 |
| server/tests/resumeMeeting.test.ts | 9 | 204 |  | 3 | 6 |
| server/tests/AudioUtils.test.ts | 16 | 191 |  | 1.3 | 6 |
| server/tests/DecisionLogic.test.js | 0 | 186 |  | 0 | 12 |
| server/tests/LoggingAndReporting.test.js | 12 | 174 |  | 1.6 | 8 |
| server/tests/characterSetupBundle.test.ts | 10 | 172 |  | 1.6 | 3 |
| server/tests/textUtils.test.js | 15 | 172 |  | 1.4 | 3 |
| server/tests/Concurrency.test.js | 2 | 154 |  | 7 | 5 |
| server/tests/spaShell.test.ts | 15 | 153 |  | 4.7 | 1 |
| server/tests/SocketManager.reconnectRace.test.js | 2 | 123 |  | 3 | 1 |
| server/tests/SubtitleTimingValidation.test.ts | 7 | 119 |  | 1.6 | 2 |
| server/tests/NetworkUtils.test.ts | 9 | 111 |  | 1.8 | 1 |
| server/tests/ClientReportRoute.test.ts | 9 | 109 |  | 1.8 | 0 |
| server/tests/SummaryMarkdownHandling.test.ts | 1 | 108 |  | 11 | 15 |
| server/tests/reportMaximumPlayedIndex.test.ts | 4 | 107 |  | 2.8 | 5 |
| server/tests/HandRaising.test.js | 2 | 101 |  | 6.5 | 4 |
| server/tests/directedHandoff.test.ts | 5 | 100 |  | 1.6 | 1 |
| server/tests/MeetingManagerTransition.test.js | 2 | 97 |  | 3.5 | 6 |
| server/tests/ReconnectionRace.test.js | 3 | 97 |  | 1.7 | 6 |
| server/tests/SpeakerClassifierBase.test.ts | 11 | 93 |  | 1.5 | 1 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 |  | 1 | 5 |
| server/tests/EstimatedSubtitles.test.ts | 6 | 84 |  | 3 | 1 |
| server/tests/SocketManager.startOptions.test.js | 2 | 79 |  | 3 | 2 |
| server/tests/audioHttp.integration.test.js | 3 | 79 |  | 4.3 | 2 |
| server/tests/AudioDrain.test.js | 1 | 77 |  | 4 | 8 |
| server/tests/ConfigurationAndDbErrors.test.js | 4 | 74 |  | 1.8 | 3 |
| server/tests/CouncilError.test.js | 6 | 74 |  | 2.2 | 1 |
| server/tests/getAutoplayMeeting.test.ts | 5 | 70 |  | 1.6 | 4 |
| server/tests/LoggerStaleEvent.test.ts | 4 | 64 |  | 2 | 2 |
| server/tests/liveSessionRegistry.test.ts | 7 | 59 |  | 1.9 | 4 |
| server/tests/ErrorbotTestRoute.test.js | 3 | 55 |  | 3 | 1 |
| server/tests/ValidationSchemas.test.js | 3 | 53 |  | 2.7 | 2 |
| server/tests/MarkdownStripping.test.ts | 6 | 51 |  | 2.5 | 1 |
| server/tests/ElevenLabsAlignmentUtils.test.ts | 2 | 26 |  | 1 | 1 |
