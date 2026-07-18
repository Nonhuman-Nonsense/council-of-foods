# Test-suite inventory (generated 2026-07-18)

Working document for the test-coverage review — see [TESTING.md](../TESTING.md) for the
rubric. Regenerate with `node docs/generate-test-inventory.mjs` (see the header of that
script) rather than hand-editing the tables; verdicts go in the review-slice section at the
bottom.

**Totals:** 156 test files, ~1237 cases
(client 102 files / 816 cases, server 54 files / 421 cases).

Columns: **ms** = wall time for the file in the profiling run (blank if no report; Playwright
e2e specs always run outside vitest). **asserts/case** = expect() calls per test — very low
values can flag weak tests, very high values flag multi-behavior tests. **churn** = commits
touching the file in the last 6 months (high churn = high-maintenance).

## Review flags (mechanical, no judgment applied)

### Large files (>400 lines) — table-driven / consolidation candidates
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 53 (+3 each) | 1760 | 504 | 2.7 | 43 |
| client/tests/unit/components/HumanInput.render.test.tsx | 47 | 1257 | 4735 | 1.8 | 2 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 23 | 551 | 54 | 1.9 | 23 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2528 | 2.8 | 6 |
| server/tests/DialogGenerator.test.js | 25 | 513 | 46 | 2.1 | 10 |
| client/tests/unit/voice/realtimeEventLoop.test.ts | 11 | 456 | 28 | 3.8 | 10 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 15 | 445 | 736 | 2.7 | 10 |
| server/tests/AudioSystemInworld.test.js | 8 | 424 | 86 | 2 | 9 |
| client/tests/unit/components/settings/SelectTopic.test.tsx | 10 | 409 | 457 | 3.7 | 3 |
| client/tests/unit/voice/guideTools.test.ts | 41 | 406 | 13 | 1.5 | 19 |

### Slowest files (>2s)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/components/HumanInput.render.test.tsx | 47 | 1257 | 4735 | 1.8 | 2 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2528 | 2.8 | 6 |

### Weak assertion density (<1.5 expect/case, excluding .each tables)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/audio/audioContext.test.ts | 5 | 56 | 2 | 0.8 | 2 |
| server/tests/SpeakerSelection.test.js | 27 | 349 | 11 | 1 | 8 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 | 2 | 1 | 6 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 | 5 | 1 | 5 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 | 47 | 1 | 3 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 8 | 157 | 54 | 1.1 | 12 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 | 7 | 1.1 | 1 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 17 | 260 | 35 | 1.2 | 3 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 | 3 | 1.2 | 1 |
| server/tests/AudioUtils.test.ts | 16 | 193 | 201 | 1.3 | 5 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 | 11 | 1.3 | 1 |
| server/tests/replayManifest.test.ts | 22 | 305 | 8 | 1.4 | 14 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 | 17 | 1.4 | 3 |
| client/tests/unit/voice/MeetingVoiceGuide.ptt.test.tsx | 7 | 180 | 22 | 1.4 | 14 |
| server/tests/textUtils.test.js | 15 | 172 | 58 | 1.4 | 3 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 | 7 | 1.4 | 2 |

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
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 53 (+3 each) | 1760 | 504 | 2.7 | 43 |
| client/tests/unit/components/HumanInput.render.test.tsx | 47 | 1257 | 4735 | 1.8 | 2 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 23 | 551 | 54 | 1.9 | 23 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2528 | 2.8 | 6 |
| client/tests/unit/voice/realtimeEventLoop.test.ts | 11 | 456 | 28 | 3.8 | 10 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 15 | 445 | 736 | 2.7 | 10 |
| client/tests/unit/components/settings/SelectTopic.test.tsx | 10 | 409 | 457 | 3.7 | 3 |
| client/tests/unit/voice/guideTools.test.ts | 41 | 406 | 13 | 1.5 | 19 |
| client/tests/unit/components/Staff.test.tsx | 25 | 390 | 1418 | 2.6 | 2 |
| client/tests/unit/museum/button/bridgeTransport.test.ts | 11 | 387 | 23 | 3.1 | 3 |
| client/tests/unit/museum/button/buttonStore.test.ts | 25 | 354 | 20 | 2.3 | 11 |
| client/tests/unit/components/overlays/Summary.test.tsx | 10 | 349 | 832 | 2.6 | 12 |
| client/tests/unit/autoplay/AutoplayCoordinator.test.tsx | 13 (+1 each) | 333 | 247 | 2.1 | 8 |
| client/tests/unit/components/Council.test.tsx | 10 | 329 | 121 | 1.6 | 36 |
| client/tests/unit/components/LiveAudioVisualizer.test.tsx | 7 | 268 | 82 | 3.7 | 4 |
| client/tests/unit/museum/metaAgent/metaAgentPrompt.test.ts | 25 | 265 | 4 | 2.2 | 8 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 17 | 260 | 35 | 1.2 | 3 |
| client/tests/unit/settings/councilSettings.test.tsx | 21 | 256 | 253 | 2.5 | 4 |
| client/tests/unit/voice/inworldSubtitleTrack.test.ts | 23 | 252 | 16 | 1.6 | 2 |
| client/tests/unit/meetingSetup.test.ts | 10 | 247 | 8 | 3.2 | 8 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 | 17 | 1.4 | 3 |
| client/tests/unit/components/RouterLogic.test.tsx | 8 | 238 | 327 | 1.9 | 18 |
| client/tests/unit/components/MeetingSetupReset.test.tsx | 3 | 214 | 127 | 2.7 | 5 |
| client/tests/unit/components/settings/SelectFoods.test.tsx | 8 | 206 | 910 | 3.3 | 2 |
| client/tests/foods/Main.test.tsx | 4 | 204 | 168 | 1.5 | 2 |
| client/tests/unit/AutoButton.test.tsx | 7 | 203 | 129 | 2.4 | 1 |
| client/tests/unit/components/ConversationControls.test.tsx | 12 | 180 | 369 | 2.4 | 2 |
| client/tests/unit/voice/MeetingVoiceGuide.ptt.test.tsx | 7 | 180 | 22 | 1.4 | 14 |
| client/tests/unit/components/HumanInput.test.tsx | 16 | 179 | 8 | 1.9 | 7 |
| client/tests/unit/main/overlay/Reconnecting.test.tsx | 5 | 169 | 85 | 1.6 | 5 |
| client/tests/unit/components/FoodAnimation.test.tsx | 6 | 168 | 120 | 2 | 8 |
| client/tests/unit/components/FoodItem.test.tsx | 7 | 168 | 188 | 2.1 | 3 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 8 | 157 | 54 | 1.1 | 12 |
| client/tests/unit/museum/button/museumButton.test.tsx | 9 | 156 | 252 | 2 | 3 |
| client/tests/unit/main/overlay/CouncilError.test.tsx | 4 | 148 | 197 | 2 | 2 |
| client/tests/unit/components/AudioOutputMessage.test.tsx | 5 | 147 | 26 | 2.2 | 6 |
| client/tests/unit/components/Main.test.tsx | 3 | 147 | 101 | 1.3 | 2 |
| client/tests/unit/components/NewMeeting.creatorKey.test.tsx | 1 | 146 | 55 | 4 | 16 |
| client/tests/unit/museum/useMuseumCursorHide.test.ts | 7 | 138 | 34 | 2 | 1 |
| client/tests/unit/components/TextOutput.test.tsx | 6 | 137 | 53 | 2.7 | 5 |
| client/tests/unit/components/settings/Landing.test.tsx | 5 | 137 | 57 | 2 | 12 |
| client/tests/unit/components/MainOverlays.test.tsx | 10 | 135 | 472 | 1.6 | 11 |
| client/tests/unit/museum/button/buttonIntentIntegration.test.tsx | 5 | 132 | 35 | 2.8 | 4 |
| client/tests/unit/navigation/reloadApp.test.ts | 5 | 132 | 10 | 2.8 | 3 |
| client/tests/unit/voice/captionScheduler.test.ts | 3 | 129 | 6 | 3.3 | 2 |
| client/tests/unit/realtime/RealtimeCaptionOverlay.test.tsx | 7 | 119 | 200 | 2 | 7 |
| client/tests/unit/api/http.test.ts | 5 | 115 | 18 | 1.8 | 2 |
| client/tests/unit/components/Navbar.test.tsx | 5 | 115 | 259 | 2.4 | 10 |
| client/tests/unit/logger.test.ts | 7 | 115 | 11 | 2 | 6 |
| client/tests/unit/museum/metaAgent/metaAgentTools.test.ts | 8 | 115 | 5 | 2.9 | 10 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 | 7 | 1.4 | 2 |
| client/tests/unit/components/FoodsCouncilScene.test.tsx | 2 | 113 | 84 | 3 | 9 |
| client/tests/unit/ValidateFoodData.test.ts | 2 | 110 | 4 | 9 | 6 |
| client/tests/unit/voice/useVoiceGuide.test.ts | 4 | 110 | 31 | 1.5 | 3 |
| client/tests/unit/components/AudioOutput.test.tsx | 4 | 101 | 25 | 1.5 | 4 |
| client/tests/unit/components/Output.test.tsx | 5 | 101 | 49 | 2.4 | 7 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 | 7 | 1.1 | 1 |
| client/tests/unit/components/FullscreenButton.test.tsx | 3 | 96 | 55 | 1.3 | 2 |
| client/tests/unit/ValidateTopicsData.test.ts | 2 | 93 | 2 | 11 | 4 |
| client/tests/unit/autoplay/autoplayStore.test.ts | 7 | 91 | 6 | 2.3 | 8 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 | 2 | 1 | 6 |
| client/tests/unit/components/overlays/Name.test.tsx | 5 (+1 each) | 88 | 423 | 2 | 3 |
| client/tests/unit/museum/button/ButtonBanner.test.tsx | 4 | 86 | 82 | 1.5 | 4 |
| client/tests/unit/utils.test.ts | 11 | 84 | 4 | 1.8 | 2 |
| client/tests/unit/components/Overlay.test.tsx | 6 | 82 | 184 | 1.5 | 1 |
| client/tests/unit/museum/button/useButton.test.ts | 3 | 82 | 19 | 3.3 | 3 |
| client/tests/unit/api/resumeMeeting.test.ts | 2 (+1 each) | 81 | 8 | 4.5 | 4 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 | 11 | 1.3 | 1 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 | 3 | 1.2 | 1 |
| client/tests/unit/locales.test.ts | 4 | 67 | 9 | 1.5 | 1 |
| client/tests/unit/routing.multilanguage.test.ts | 6 | 66 | 20 | 1.7 | 3 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 | 47 | 1 | 3 |
| client/tests/unit/museum/metaAgent/useMetaAgent.test.ts | 1 | 62 | 27 | 1 | 4 |
| client/tests/unit/components/Background.test.tsx | 3 | 61 | 105 | 2 | 1 |
| client/tests/unit/components/ConversationControlIcon.test.tsx | 4 | 59 | 506 | 2 | 2 |
| client/tests/unit/FoodVideoIntegrity.test.ts | 1 | 58 | 4 | 6 | 5 |
| client/tests/unit/components/overlays/Contact.test.tsx | 1 | 58 | 219 | 10 | 2 |
| client/tests/unit/agendaPointInjection.test.ts | 6 | 57 | 3 | 1.5 | 1 |
| client/tests/unit/museum/MuseumSwitchButton.test.tsx | 4 | 57 | 364 | 1.5 | 2 |
| client/tests/unit/audio/audioContext.test.ts | 5 | 56 | 2 | 0.8 | 2 |
| client/tests/unit/topicPrompt.test.ts | 5 | 54 | 5 | 2.8 | 3 |
| client/tests/unit/api/getMeeting.test.ts | 2 | 48 | 22 | 1 | 4 |
| client/tests/unit/autoplay/AutoplayWarning.test.tsx | 2 | 48 | 150 | 2 | 2 |
| client/tests/unit/realtime/realtimeProtocol.test.ts | 2 | 47 | 2 | 2.5 | 2 |
| client/tests/e2e/src/meeting_flow.spec.ts | 2 | 46 |  | 6 | 6 |
| client/tests/unit/routing.singleLanguage.test.ts | 2 | 45 | 12 | 2.5 | 4 |
| client/tests/unit/museum/button/bridgeHealth.test.ts | 2 | 43 | 2 | 1 | 3 |
| client/tests/unit/museum/button/ButtonLedDebugOverlay.test.tsx | 3 | 42 | 111 | 2.3 | 5 |
| client/tests/unit/voice/VoiceGuideOverlay.test.tsx | 2 | 41 | 69 | 1 | 1 |
| client/tests/unit/shared/devPorts.test.ts | 5 | 39 | 2 | 1.6 | 2 |
| client/tests/unit/components/VideoPreloader.test.tsx | 2 | 38 | 164 | 5.5 | 3 |
| client/tests/unit/museum/button/buttonLedDebug.test.ts | 3 | 38 | 7 | 2 | 2 |
| client/tests/unit/voice/guidePrompt.test.ts | 5 | 38 | 3 | 1.6 | 7 |
| client/tests/unit/components/overlays/Incomplete.test.tsx | 2 | 36 | 33 | 1 | 4 |
| client/tests/unit/museum/button/protocol.test.ts | 4 | 35 | 2 | 2.3 | 1 |
| client/tests/unit/newMeeting/meetingSetupStore.test.ts | 1 | 29 | 2 | 6 | 1 |
| client/tests/unit/IconIntegrity.test.ts | 1 | 28 | 816 | 2 | 1 |
| client/tests/unit/components/overlays/About.test.tsx | 1 | 28 | 152 | 3 | 1 |
| client/tests/unit/FoodImageIntegrity.test.ts | 1 | 26 | 1 | 3 | 6 |
| client/tests/unit/routing.test.ts | 1 | 22 | 14 | 1 | 6 |
| client/tests/unit/characterSetupMetadata.test.ts | 2 | 20 | 3 | 1.5 | 1 |

### Server
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| server/tests/DialogGenerator.test.js | 25 | 513 | 46 | 2.1 | 10 |
| server/tests/AudioSystemInworld.test.js | 8 | 424 | 86 | 2 | 9 |
| server/tests/meetingsHttpAndSocket.integration.test.js | 8 | 369 | 511 | 3 | 10 |
| server/tests/realtimeSessionApi.integration.test.ts | 13 | 352 | 307 | 2.6 | 5 |
| server/tests/SpeakerSelection.test.js | 27 | 349 | 11 | 1 | 8 |
| server/tests/ConversationFlow.test.js | 9 | 339 | 216 | 4.7 | 19 |
| server/tests/AsyncErrorPropagation.test.js | 5 | 326 | 50 | 3.4 | 13 |
| server/tests/realtimeProviders.test.ts | 8 (+1 each) | 325 | 40 | 3.3 | 11 |
| server/tests/AudioSystemElevenLabs.test.js | 8 | 317 | 264 | 2.3 | 5 |
| server/tests/meetingsHttp.integration.test.js | 12 | 316 | 354 | 3.1 | 14 |
| server/tests/MeetingLifecycleHandler.test.js | 13 | 314 | 12 | 3.1 | 16 |
| server/tests/replayManifest.test.ts | 22 | 305 | 8 | 1.4 | 14 |
| server/tests/HumanInput.test.js | 10 | 258 | 8 | 5.2 | 12 |
| server/tests/AudioSystem.test.js | 8 | 240 | 1070 | 1.8 | 6 |
| server/tests/SpeakerTargetClassifier.test.ts | 9 | 239 | 9 | 2.8 | 7 |
| server/tests/MeetingLoopHardening.test.js | 6 | 234 | 86 | 4 | 3 |
| server/tests/ConversationService.test.ts | 9 | 233 | 7 | 2.1 | 6 |
| server/tests/SummaryGeneration.test.ts | 2 | 219 | 225 | 6 | 5 |
| server/tests/SummaryPendingConclude.test.js | 9 | 218 | 103 | 2.6 | 2 |
| server/tests/PronunciationUtils.test.ts | 17 | 208 | 23 | 2.1 | 3 |
| server/tests/ConnectionHandler.test.js | 8 | 207 | 13 | 2.9 | 9 |
| server/tests/AudioUtils.test.ts | 16 | 193 | 201 | 1.3 | 5 |
| server/tests/DecisionLogic.test.js | 0 | 186 | 16 | 0 | 12 |
| server/tests/characterSetupBundle.test.ts | 11 | 186 | 7 | 1.6 | 3 |
| server/tests/LoggingAndReporting.test.js | 12 | 174 | 74 | 1.6 | 8 |
| server/tests/textUtils.test.js | 15 | 172 | 58 | 1.4 | 3 |
| server/tests/Concurrency.test.js | 2 | 154 | 127 | 7 | 5 |
| server/tests/spaShell.test.ts | 15 | 153 | 4 | 4.7 | 1 |
| server/tests/resumeMeeting.test.ts | 6 | 142 | 68 | 3.7 | 6 |
| server/tests/voiceGuideSession.test.ts | 7 | 134 | 122 | 1.7 | 3 |
| server/tests/SocketManager.reconnectRace.test.js | 2 | 123 | 88 | 3 | 1 |
| server/tests/NetworkUtils.test.ts | 9 | 111 | 35 | 1.8 | 1 |
| server/tests/SubtitleTimingValidation.test.ts | 6 | 109 | 3 | 1.5 | 2 |
| server/tests/SummaryMarkdownHandling.test.ts | 1 | 108 | 4 | 11 | 15 |
| server/tests/reportMaximumPlayedIndex.test.ts | 4 | 107 | 30 | 2.8 | 5 |
| server/tests/AudioDrain.test.js | 1 | 106 | 224 | 4 | 7 |
| server/tests/HandRaising.test.js | 2 | 101 | 78 | 6.5 | 4 |
| server/tests/directedHandoff.test.ts | 5 | 100 | 7 | 1.6 | 1 |
| server/tests/MeetingManagerTransition.test.js | 2 | 97 | 81 | 3.5 | 6 |
| server/tests/ReconnectionRace.test.js | 3 | 97 | 7 | 1.7 | 6 |
| server/tests/SpeakerClassifierBase.test.ts | 11 | 93 | 5 | 1.5 | 1 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 | 5 | 1 | 5 |
| server/tests/EstimatedSubtitles.test.ts | 6 | 84 | 2 | 3 | 1 |
| server/tests/SocketManager.startOptions.test.js | 2 | 79 | 11 | 3 | 2 |
| server/tests/audioHttp.integration.test.js | 3 | 79 | 148 | 4.3 | 2 |
| server/tests/ConfigurationAndDbErrors.test.js | 4 | 74 | 24 | 1.8 | 3 |
| server/tests/CouncilError.test.js | 6 | 74 | 10 | 2.2 | 1 |
| server/tests/getAutoplayMeeting.test.ts | 5 | 70 | 8 | 1.6 | 4 |
| server/tests/LoggerStaleEvent.test.ts | 4 | 64 | 8 | 2 | 2 |
| server/tests/liveSessionRegistry.test.ts | 7 | 59 | 7 | 1.9 | 4 |
| server/tests/ErrorbotTestRoute.test.js | 3 | 55 | 21 | 3 | 1 |
| server/tests/ValidationSchemas.test.js | 3 | 53 | 129 | 2.7 | 2 |
| server/tests/MarkdownStripping.test.ts | 6 | 51 | 2 | 2.5 | 1 |
| server/tests/ElevenLabsAlignmentUtils.test.ts | 2 | 26 | 2 | 1 | 1 |

## Review slices

Verdicts per slice (keep / merge / rewrite / delete), each reviewed in its own session
against TESTING.md, each producing one small PR:

- [ ] 1. Meeting lifecycle + resume/replay (server)
- [ ] 2. Audio pipeline (server)
- [ ] 3. Realtime voice (client + server protocol together)
- [x] 4. Council playback machine + overlays (incl. useCouncilMachine table-drive) — see [test-review-slice-4.md](test-review-slice-4.md); applied, suite 844 → 838
- [x] 5. Museum / button / kiosk — see [test-review-slice-5.md](test-review-slice-5.md); applied, suite 838 → 836
- [ ] 6. Routing, i18n, setup flow
- [ ] 7. Components sweep (client/tests/unit/components)
