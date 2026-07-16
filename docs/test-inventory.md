# Test-suite inventory (generated 2026-07-16)

Working document for the test-coverage review — see [TESTING.md](../TESTING.md) for the
rubric. Regenerate with `node docs/generate-test-inventory.mjs` (see the header of that
script) rather than hand-editing the tables; verdicts go in the review-slice section at the
bottom.

**Totals:** 157 test files, ~1263 cases
(client 103 files / 847 cases, server 54 files / 416 cases).

Columns: **ms** = wall time for the file in the profiling run (blank if no report; Playwright
e2e specs always run outside vitest). **asserts/case** = expect() calls per test — very low
values can flag weak tests, very high values flag multi-behavior tests. **churn** = commits
touching the file in the last 6 months (high churn = high-maintenance).

## Review flags (mechanical, no judgment applied)

### Large files (>400 lines) — table-driven / consolidation candidates
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 73 | 2007 | 147 | 2.2 | 40 |
| client/tests/unit/components/HumanInput.test.jsx | 47 | 1256 | 3134 | 1.8 | 35 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 24 | 579 | 129 | 1.8 | 23 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2533 | 2.8 | 6 |
| server/tests/DialogGenerator.test.js | 25 | 513 | 94 | 2.1 | 10 |
| client/tests/unit/voice/realtimeEventLoop.test.ts | 11 | 456 | 26 | 3.8 | 10 |
| client/tests/unit/museum/button/bridgeTransport.test.ts | 11 | 454 | 45 | 3.1 | 3 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 15 | 445 | 713 | 2.7 | 10 |
| server/tests/AudioSystemInworld.test.js | 8 | 424 | 55 | 2 | 10 |
| client/tests/unit/voice/guideTools.test.ts | 41 | 406 | 23 | 1.5 | 19 |

### Slowest files (>2s)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/components/HumanInput.test.jsx | 47 | 1256 | 3134 | 1.8 | 35 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2533 | 2.8 | 6 |

### Weak assertion density (<1.5 expect/case, excluding .each tables)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/audio/audioContext.test.ts | 5 | 55 | 11 | 0.8 | 1 |
| server/tests/SpeakerSelection.test.js | 27 | 349 | 184 | 1 | 8 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 | 4 | 1 | 6 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 | 2 | 1 | 6 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 | 82 | 1 | 3 |
| client/tests/unit/main/overlay/Reconnecting.test.tsx | 7 | 177 | 116 | 1.1 | 4 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 8 | 150 | 85 | 1.1 | 11 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 | 10 | 1.1 | 1 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 | 1 | 1.2 | 1 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 16 | 235 | 44 | 1.3 | 3 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 | 6 | 1.3 | 1 |
| server/tests/replayManifest.test.ts | 22 | 305 | 9 | 1.4 | 14 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 | 24 | 1.4 | 2 |
| client/tests/unit/voice/MeetingVoiceGuide.ptt.test.tsx | 7 | 173 | 39 | 1.4 | 12 |
| server/tests/textUtils.test.js | 15 | 172 | 8 | 1.4 | 3 |
| server/tests/AudioUtils.test.ts | 14 | 160 | 165 | 1.4 | 3 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 | 45 | 1.4 | 2 |
| client/tests/unit/components/overlays/Name.test.jsx | 7 | 83 | 359 | 1.4 | 3 |

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
| client/src/api/createMeeting.ts | 0 | 6 |
| client/src/api/fetchAutoplayMeeting.ts | 0 | 7 |
| client/src/api/httpErrorMessage.ts | 0 | 8 |
| client/src/main/Loading.tsx | 0 | 2 |
| client/src/museum/button/useButton.ts | 28 | 43 |

### Server
| source file | % stmts | stmts |
|---|---|---|
| server/src/api/voiceGuideSession.ts | 0 | 15 |
| server/src/services/OpenAIService.ts | 33 | 6 |
| server/src/api/devErrorbotRoutes.ts | 34 | 32 |

## Full inventory

### Client
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 73 | 2007 | 147 | 2.2 | 40 |
| client/tests/unit/components/HumanInput.test.jsx | 47 | 1256 | 3134 | 1.8 | 35 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 24 | 579 | 129 | 1.8 | 23 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2533 | 2.8 | 6 |
| client/tests/unit/voice/realtimeEventLoop.test.ts | 11 | 456 | 26 | 3.8 | 10 |
| client/tests/unit/museum/button/bridgeTransport.test.ts | 11 | 454 | 45 | 3.1 | 3 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 15 | 445 | 713 | 2.7 | 10 |
| client/tests/unit/voice/guideTools.test.ts | 41 | 406 | 23 | 1.5 | 19 |
| client/tests/unit/components/settings/SelectTopic.test.jsx | 10 | 386 | 474 | 3.7 | 13 |
| client/tests/unit/components/Staff.test.tsx | 25 | 378 | 986 | 2.6 | 1 |
| client/tests/unit/components/overlays/Summary.test.tsx | 12 | 359 | 439 | 2.2 | 10 |
| client/tests/unit/museum/button/buttonStore.test.ts | 25 | 354 | 18 | 2.3 | 11 |
| client/tests/unit/components/Council.test.tsx | 11 | 332 | 110 | 1.5 | 33 |
| client/tests/unit/autoplay/AutoplayCoordinator.test.tsx | 13 (+1 each) | 331 | 196 | 2.1 | 7 |
| client/tests/unit/components/LiveAudioVisualizer.test.tsx | 7 | 268 | 66 | 3.7 | 4 |
| client/tests/unit/museum/metaAgent/metaAgentPrompt.test.ts | 25 | 265 | 9 | 2.2 | 8 |
| client/tests/unit/settings/councilSettings.test.tsx | 21 | 256 | 235 | 2.5 | 4 |
| client/tests/unit/voice/inworldSubtitleTrack.test.ts | 23 | 252 | 3 | 1.6 | 2 |
| client/tests/unit/meetingSetup.test.ts | 10 | 246 | 8 | 3.2 | 7 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 | 24 | 1.4 | 2 |
| client/tests/unit/components/RouterLogic.test.tsx | 8 | 238 | 350 | 1.9 | 18 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 16 | 235 | 44 | 1.3 | 3 |
| client/tests/unit/components/MeetingSetupReset.test.tsx | 3 | 214 | 95 | 2.7 | 5 |
| client/tests/unit/components/settings/SelectFoods.test.jsx | 8 | 204 | 406 | 3.3 | 16 |
| client/tests/unit/AutoButton.test.tsx | 7 | 203 | 295 | 2.4 | 1 |
| client/tests/foods/Main.test.jsx | 4 | 201 | 202 | 1.5 | 3 |
| client/tests/unit/components/ConversationControls.test.jsx | 12 | 180 | 367 | 2.4 | 2 |
| client/tests/unit/components/HumanInput.test.tsx | 16 | 179 | 4 | 1.9 | 7 |
| client/tests/unit/main/overlay/Reconnecting.test.tsx | 7 | 177 | 116 | 1.1 | 4 |
| client/tests/unit/voice/MeetingVoiceGuide.ptt.test.tsx | 7 | 173 | 39 | 1.4 | 12 |
| client/tests/unit/components/FoodAnimation.test.tsx | 6 | 169 | 124 | 2 | 7 |
| client/tests/unit/components/FoodItem.test.jsx | 7 | 161 | 199 | 2.1 | 2 |
| client/tests/unit/museum/button/museumButton.test.tsx | 9 | 156 | 270 | 2 | 3 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 8 | 150 | 85 | 1.1 | 11 |
| client/tests/unit/main/overlay/CouncilError.test.tsx | 4 | 148 | 242 | 2 | 2 |
| client/tests/unit/components/NewMeeting.creatorKey.test.tsx | 1 | 146 | 39 | 4 | 16 |
| client/tests/unit/components/AudioOutputMessage.test.tsx | 5 | 145 | 25 | 2.2 | 5 |
| client/tests/unit/components/Main.test.jsx | 3 | 145 | 68 | 1.3 | 21 |
| client/tests/unit/museum/useMuseumCursorHide.test.ts | 7 | 138 | 39 | 2 | 1 |
| client/tests/unit/components/TextOutput.test.tsx | 6 | 137 | 75 | 2.7 | 5 |
| client/tests/unit/components/MainOverlays.test.tsx | 10 | 135 | 372 | 1.6 | 11 |
| client/tests/unit/museum/button/buttonIntentIntegration.test.tsx | 5 | 132 | 19 | 2.8 | 4 |
| client/tests/unit/navigation/reloadApp.test.ts | 5 | 131 | 7 | 2.8 | 2 |
| client/tests/unit/voice/captionScheduler.test.ts | 3 | 129 | 3 | 3.3 | 2 |
| client/tests/unit/components/settings/Landing.test.tsx | 5 | 128 | 105 | 2 | 11 |
| client/tests/unit/realtime/RealtimeCaptionOverlay.test.tsx | 7 | 119 | 205 | 2 | 7 |
| client/tests/unit/api/http.test.ts | 5 | 115 | 9 | 1.8 | 2 |
| client/tests/unit/components/Navbar.test.tsx | 5 | 115 | 290 | 2.4 | 10 |
| client/tests/unit/logger.test.ts | 7 | 115 | 24 | 2 | 5 |
| client/tests/unit/museum/metaAgent/metaAgentTools.test.ts | 8 | 115 | 5 | 2.9 | 10 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 | 45 | 1.4 | 2 |
| client/tests/unit/components/FoodsCouncilScene.test.tsx | 2 | 113 | 168 | 3 | 8 |
| client/tests/unit/ValidateFoodData.test.ts | 2 | 110 | 5 | 9 | 6 |
| client/tests/unit/voice/useVoiceGuide.test.ts | 4 | 110 | 45 | 1.5 | 3 |
| client/tests/unit/components/AudioOutput.test.tsx | 4 | 101 | 21 | 1.5 | 4 |
| client/tests/unit/components/Output.test.tsx | 5 | 101 | 28 | 2.4 | 6 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 | 10 | 1.1 | 1 |
| client/tests/unit/components/FullscreenButton.test.tsx | 3 | 96 | 55 | 1.3 | 2 |
| client/tests/unit/ValidateTopicsData.test.ts | 2 | 93 | 5 | 11 | 4 |
| client/tests/unit/autoplay/autoplayStore.test.ts | 7 | 91 | 6 | 2.3 | 8 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 | 4 | 1 | 6 |
| client/tests/unit/museum/button/ButtonBanner.test.tsx | 4 | 86 | 106 | 1.5 | 4 |
| client/tests/unit/components/overlays/Name.test.jsx | 7 | 83 | 359 | 1.4 | 3 |
| client/tests/unit/utils.test.js | 11 | 83 | 2 | 1.8 | 1 |
| client/tests/unit/components/Overlay.test.tsx | 6 | 82 | 246 | 1.5 | 1 |
| client/tests/unit/museum/button/useButton.test.ts | 3 | 82 | 33 | 3.3 | 3 |
| client/tests/unit/api/resumeMeeting.test.ts | 2 (+1 each) | 81 | 17 | 4.5 | 4 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 | 6 | 1.3 | 1 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 | 1 | 1.2 | 1 |
| client/tests/unit/locales.test.ts | 4 | 67 | 19 | 1.5 | 1 |
| client/tests/unit/components/overlays/Contact.test.tsx | 3 | 66 | 398 | 3.3 | 1 |
| client/tests/unit/routing.multilanguage.test.ts | 6 | 66 | 20 | 1.7 | 3 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 | 82 | 1 | 3 |
| client/tests/unit/museum/metaAgent/useMetaAgent.test.ts | 1 | 62 | 13 | 1 | 4 |
| client/tests/unit/components/Background.test.jsx | 3 | 61 | 242 | 2 | 3 |
| client/tests/unit/components/ConversationControlIcon.test.jsx | 4 | 59 | 237 | 2 | 1 |
| client/tests/unit/FoodVideoIntegrity.test.ts | 1 | 58 | 4 | 6 | 5 |
| client/tests/unit/agendaPointInjection.test.ts | 6 | 57 | 4 | 1.5 | 1 |
| client/tests/unit/museum/MuseumSwitchButton.test.tsx | 4 | 57 | 222 | 1.5 | 2 |
| client/tests/unit/audio/audioContext.test.ts | 5 | 55 | 11 | 0.8 | 1 |
| client/tests/unit/topicPrompt.test.ts | 5 | 54 | 5 | 2.8 | 3 |
| client/tests/unit/museum/button/useBridgeHealth.test.ts | 2 | 49 | 5 | 1 | 3 |
| client/tests/unit/api/getMeeting.test.ts | 2 | 48 | 16 | 1 | 4 |
| client/tests/unit/autoplay/AutoplayWarning.test.tsx | 2 | 48 | 60 | 2 | 2 |
| client/tests/unit/realtime/realtimeProtocol.test.ts | 2 | 47 | 1 | 2.5 | 2 |
| client/tests/e2e/src/meeting_flow.spec.ts | 2 | 46 |  | 6 | 6 |
| client/tests/unit/routing.singleLanguage.test.ts | 2 | 45 | 29 | 2.5 | 4 |
| client/tests/unit/museum/button/bridgeHealth.test.ts | 2 | 43 | 5 | 1 | 3 |
| client/tests/unit/museum/button/ButtonLedDebugOverlay.test.tsx | 3 | 42 | 109 | 2.3 | 5 |
| client/tests/unit/voice/VoiceGuideOverlay.test.tsx | 2 | 41 | 78 | 1 | 1 |
| client/tests/unit/shared/devPorts.test.ts | 5 | 39 | 2 | 1.6 | 1 |
| client/tests/unit/components/VideoPreloader.test.tsx | 2 | 38 | 145 | 5.5 | 3 |
| client/tests/unit/museum/button/buttonLedDebug.test.ts | 3 | 38 | 10 | 2 | 2 |
| client/tests/unit/voice/guidePrompt.test.ts | 5 | 38 | 3 | 1.6 | 7 |
| client/tests/unit/components/overlays/Incomplete.test.tsx | 2 | 36 | 69 | 1 | 4 |
| client/tests/unit/museum/button/protocol.test.ts | 4 | 35 | 3 | 2.3 | 1 |
| client/tests/unit/newMeeting/meetingSetupStore.test.ts | 1 | 29 | 2 | 6 | 1 |
| client/tests/unit/IconIntegrity.test.ts | 1 | 28 | 1146 | 2 | 1 |
| client/tests/unit/components/overlays/About.test.tsx | 1 | 28 | 263 | 3 | 1 |
| client/tests/unit/FoodImageIntegrity.test.ts | 1 | 26 | 1 | 3 | 6 |
| client/tests/unit/routing.test.ts | 1 | 22 | 22 | 1 | 6 |
| client/tests/unit/characterSetupMetadata.test.ts | 2 | 20 | 3 | 1.5 | 1 |

### Server
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| server/tests/DialogGenerator.test.js | 25 | 513 | 94 | 2.1 | 10 |
| server/tests/AudioSystemInworld.test.js | 8 | 424 | 55 | 2 | 10 |
| server/tests/meetingsHttpAndSocket.integration.test.js | 8 | 369 | 239 | 3 | 10 |
| server/tests/realtimeSessionApi.integration.test.ts | 13 | 352 | 124 | 2.6 | 5 |
| server/tests/SpeakerSelection.test.js | 27 | 349 | 184 | 1 | 8 |
| server/tests/ConversationFlow.test.js | 9 | 339 | 194 | 4.7 | 19 |
| server/tests/AsyncErrorPropagation.test.js | 5 | 326 | 137 | 3.4 | 13 |
| server/tests/realtimeProviders.test.ts | 8 (+1 each) | 325 | 48 | 3.3 | 11 |
| server/tests/AudioSystemElevenLabs.test.js | 8 | 317 | 75 | 2.3 | 4 |
| server/tests/meetingsHttp.integration.test.js | 12 | 316 | 160 | 3.1 | 14 |
| server/tests/MeetingLifecycleHandler.test.js | 13 | 314 | 9 | 3.1 | 16 |
| server/tests/replayManifest.test.ts | 22 | 305 | 9 | 1.4 | 14 |
| server/tests/HumanInput.test.js | 10 | 258 | 16 | 5.2 | 12 |
| server/tests/AudioSystem.test.js | 8 | 240 | 1062 | 1.8 | 6 |
| server/tests/SpeakerTargetClassifier.test.ts | 9 | 239 | 20 | 2.8 | 7 |
| server/tests/MeetingLoopHardening.test.js | 6 | 234 | 71 | 4 | 2 |
| server/tests/ConversationService.test.ts | 9 | 233 | 8 | 2.1 | 6 |
| server/tests/SummaryGeneration.test.ts | 2 | 219 | 103 | 6 | 5 |
| server/tests/SummaryPendingConclude.test.js | 9 | 218 | 27 | 2.6 | 2 |
| server/tests/PronunciationUtils.test.ts | 17 | 208 | 51 | 2.1 | 3 |
| server/tests/ConnectionHandler.test.js | 8 | 207 | 12 | 2.9 | 9 |
| server/tests/DecisionLogic.test.js | 0 | 186 | 17 | 0 | 12 |
| server/tests/characterSetupBundle.test.ts | 11 | 186 | 6 | 1.6 | 3 |
| server/tests/textUtils.test.js | 15 | 172 | 8 | 1.4 | 3 |
| server/tests/AudioUtils.test.ts | 14 | 160 | 165 | 1.4 | 3 |
| server/tests/Concurrency.test.js | 2 | 154 | 119 | 7 | 5 |
| server/tests/spaShell.test.ts | 15 | 153 | 11 | 4.7 | 1 |
| server/tests/LoggingAndReporting.test.js | 9 | 152 | 12 | 1.7 | 7 |
| server/tests/resumeMeeting.test.ts | 6 | 142 | 31 | 3.7 | 6 |
| server/tests/voiceGuideSession.test.ts | 7 | 134 | 57 | 1.7 | 3 |
| server/tests/SocketManager.reconnectRace.test.js | 2 | 123 | 8 | 3 | 1 |
| server/tests/NetworkUtils.test.ts | 9 | 111 | 19 | 1.8 | 1 |
| server/tests/SubtitleTimingValidation.test.ts | 6 | 109 | 6 | 1.5 | 2 |
| server/tests/SummaryMarkdownHandling.test.ts | 1 | 108 | 5 | 11 | 15 |
| server/tests/reportMaximumPlayedIndex.test.ts | 4 | 107 | 29 | 2.8 | 5 |
| server/tests/AudioDrain.test.js | 1 | 106 | 217 | 4 | 7 |
| server/tests/HandRaising.test.js | 2 | 101 | 11 | 6.5 | 4 |
| server/tests/directedHandoff.test.ts | 5 | 100 | 3 | 1.6 | 1 |
| server/tests/MeetingManagerTransition.test.js | 2 | 97 | 64 | 3.5 | 6 |
| server/tests/ReconnectionRace.test.js | 3 | 97 | 39 | 1.7 | 6 |
| server/tests/SpeakerClassifierBase.test.ts | 11 | 93 | 8 | 1.5 | 1 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 | 2 | 1 | 6 |
| server/tests/EstimatedSubtitles.test.ts | 6 | 84 | 7 | 3 | 1 |
| server/tests/SocketManager.startOptions.test.js | 2 | 79 | 11 | 3 | 2 |
| server/tests/audioHttp.integration.test.js | 3 | 79 | 83 | 4.3 | 2 |
| server/tests/ConfigurationAndDbErrors.test.js | 4 | 74 | 16 | 1.8 | 4 |
| server/tests/CouncilError.test.js | 6 | 74 | 6 | 2.2 | 1 |
| server/tests/getAutoplayMeeting.test.ts | 5 | 70 | 7 | 1.6 | 4 |
| server/tests/LoggerStaleEvent.test.ts | 4 | 63 | 9 | 2 | 1 |
| server/tests/liveSessionRegistry.test.ts | 7 | 59 | 2 | 1.9 | 4 |
| server/tests/ErrorbotTestRoute.test.js | 3 | 55 | 32 | 3 | 1 |
| server/tests/ValidationSchemas.test.js | 3 | 53 | 73 | 2.7 | 2 |
| server/tests/MarkdownStripping.test.ts | 6 | 51 | 4 | 2.5 | 1 |
| server/tests/ElevenLabsAlignmentUtils.test.ts | 2 | 26 | 4 | 1 | 1 |

## Review slices

Verdicts per slice (keep / merge / rewrite / delete), each reviewed in its own session
against TESTING.md, each producing one small PR:

- [ ] 1. Meeting lifecycle + resume/replay (server)
- [ ] 2. Audio pipeline (server)
- [ ] 3. Realtime voice (client + server protocol together)
- [x] 4. Council playback machine + overlays (incl. useCouncilMachine table-drive) — see [test-review-slice-4.md](test-review-slice-4.md); applied, suite 844 → 838
- [ ] 5. Museum / button / kiosk
- [ ] 6. Routing, i18n, setup flow
- [ ] 7. Components sweep (client/tests/unit/components)
