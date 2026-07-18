# Test-suite inventory (generated 2026-07-18)

Working document for the test-coverage review — see [TESTING.md](../TESTING.md) for the
rubric. Regenerate with `node docs/generate-test-inventory.mjs` (see the header of that
script) rather than hand-editing the tables; verdicts go in the review-slice section at the
bottom.

**Totals:** 157 test files, ~1247 cases
(client 104 files / 826 cases, server 53 files / 421 cases).

Columns: **ms** = wall time for the file in the profiling run (blank if no report; Playwright
e2e specs always run outside vitest). **asserts/case** = expect() calls per test — very low
values can flag weak tests, very high values flag multi-behavior tests. **churn** = commits
touching the file in the last 6 months (high churn = high-maintenance).

## Review flags (mechanical, no judgment applied)

### Large files (>400 lines) — table-driven / consolidation candidates
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 53 (+3 each) | 1760 | 340 | 2.7 | 43 |
| client/tests/unit/components/HumanInput.render.test.tsx | 47 | 1257 | 7225 | 1.8 | 2 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 23 | 551 | 171 | 1.9 | 24 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2544 | 2.8 | 6 |
| server/tests/DialogGenerator.test.js | 25 | 513 | 16 | 2.1 | 10 |
| client/tests/unit/voice/realtimeEventLoop.test.ts | 11 | 456 | 31 | 3.8 | 10 |
| server/tests/realtimeProviders.test.ts | 15 (+1 each) | 449 | 304 | 2.5 | 12 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 15 | 445 | 732 | 2.7 | 10 |
| client/tests/unit/components/settings/SelectTopic.test.tsx | 10 | 409 | 1039 | 3.7 | 3 |
| client/tests/unit/voice/guideTools.test.ts | 41 | 406 | 20 | 1.5 | 19 |

### Slowest files (>2s)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/components/HumanInput.render.test.tsx | 47 | 1257 | 7225 | 1.8 | 2 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2544 | 2.8 | 6 |
| client/tests/unit/components/Staff.test.tsx | 25 | 390 | 2511 | 2.6 | 2 |

### Weak assertion density (<1.5 expect/case, excluding .each tables)
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| client/tests/unit/audio/audioContext.test.ts | 5 | 56 | 3 | 0.8 | 2 |
| server/tests/SpeakerSelection.test.js | 27 | 349 | 111 | 1 | 8 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 | 2 | 1 | 6 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 | 10 | 1 | 5 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 | 77 | 1 | 3 |
| client/tests/unit/api/httpErrorMessage.test.ts | 7 | 40 | 8 | 1 | 0 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 8 | 157 | 89 | 1.1 | 12 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 | 8 | 1.1 | 1 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 17 | 260 | 38 | 1.2 | 4 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 | 3 | 1.2 | 1 |
| server/tests/AudioUtils.test.ts | 16 | 191 | 271 | 1.3 | 6 |
| client/tests/unit/api/createMeeting.test.ts | 4 | 81 | 20 | 1.3 | 0 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 | 26 | 1.3 | 1 |
| server/tests/replayManifest.test.ts | 22 | 305 | 7 | 1.4 | 14 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 | 28 | 1.4 | 3 |
| client/tests/unit/voice/MeetingVoiceGuide.ptt.test.tsx | 7 | 180 | 47 | 1.4 | 14 |
| server/tests/textUtils.test.js | 15 | 172 | 9 | 1.4 | 3 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 | 14 | 1.4 | 2 |

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
| client/tests/unit/hooks/useCouncilMachine.test.tsx | 53 (+3 each) | 1760 | 340 | 2.7 | 43 |
| client/tests/unit/components/HumanInput.render.test.tsx | 47 | 1257 | 7225 | 1.8 | 2 |
| client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx | 23 | 551 | 171 | 1.9 | 24 |
| client/tests/unit/realtime/realtimeConnection.test.ts | 21 | 517 | 2544 | 2.8 | 6 |
| client/tests/unit/voice/realtimeEventLoop.test.ts | 11 | 456 | 31 | 3.8 | 10 |
| client/tests/unit/realtime/useRealtimeVoiceSession.test.ts | 15 | 445 | 732 | 2.7 | 10 |
| client/tests/unit/components/settings/SelectTopic.test.tsx | 10 | 409 | 1039 | 3.7 | 3 |
| client/tests/unit/voice/guideTools.test.ts | 41 | 406 | 20 | 1.5 | 19 |
| client/tests/unit/components/Staff.test.tsx | 25 | 390 | 2511 | 2.6 | 2 |
| client/tests/unit/museum/button/bridgeTransport.test.ts | 11 | 387 | 46 | 3.1 | 4 |
| client/tests/unit/museum/button/buttonStore.test.ts | 25 | 354 | 17 | 2.3 | 11 |
| client/tests/unit/components/overlays/Summary.test.tsx | 10 | 349 | 1201 | 2.6 | 12 |
| client/tests/unit/autoplay/AutoplayCoordinator.test.tsx | 13 (+1 each) | 333 | 167 | 2.1 | 8 |
| client/tests/unit/components/Council.test.tsx | 10 | 329 | 143 | 1.6 | 36 |
| client/tests/unit/components/LiveAudioVisualizer.test.tsx | 7 | 268 | 61 | 3.7 | 4 |
| client/tests/unit/museum/metaAgent/metaAgentPrompt.test.ts | 25 | 265 | 15 | 2.2 | 8 |
| client/tests/unit/museum/button/buttonBanner.test.ts | 17 | 260 | 38 | 1.2 | 4 |
| client/tests/unit/settings/councilSettings.test.tsx | 21 | 256 | 294 | 2.5 | 4 |
| client/tests/unit/voice/inworldSubtitleTrack.test.ts | 23 | 252 | 5 | 1.6 | 2 |
| client/tests/unit/meetingSetup.test.ts | 10 | 247 | 9 | 3.2 | 8 |
| client/tests/unit/council/summaryScrollSync.test.ts | 14 | 241 | 28 | 1.4 | 3 |
| client/tests/unit/components/RouterLogic.test.tsx | 8 | 238 | 878 | 1.9 | 18 |
| client/tests/unit/components/MeetingSetupReset.test.tsx | 3 | 214 | 138 | 2.7 | 5 |
| client/tests/unit/components/settings/SelectFoods.test.tsx | 8 | 206 | 1544 | 3.3 | 2 |
| client/tests/foods/Main.test.tsx | 4 | 204 | 178 | 1.5 | 2 |
| client/tests/unit/AutoButton.test.tsx | 7 | 203 | 833 | 2.4 | 1 |
| client/tests/unit/voice/MeetingVoiceGuide.ptt.test.tsx | 7 | 180 | 47 | 1.4 | 14 |
| client/tests/unit/components/HumanInput.test.tsx | 16 | 179 | 6 | 1.9 | 7 |
| client/tests/unit/components/FoodItem.test.tsx | 7 | 178 | 217 | 1.9 | 4 |
| client/tests/unit/main/overlay/Reconnecting.test.tsx | 5 | 169 | 89 | 1.6 | 5 |
| client/tests/unit/components/FoodAnimation.test.tsx | 6 | 168 | 206 | 2 | 8 |
| client/tests/unit/components/ConversationControls.test.tsx | 12 | 166 | 625 | 2.3 | 3 |
| client/tests/unit/components/CouncilOverlays.test.tsx | 8 | 157 | 89 | 1.1 | 12 |
| client/tests/unit/museum/button/museumButton.test.tsx | 9 | 156 | 264 | 2 | 3 |
| client/tests/unit/main/overlay/CouncilError.test.tsx | 4 | 148 | 523 | 2 | 2 |
| client/tests/unit/components/AudioOutputMessage.test.tsx | 5 | 147 | 54 | 2.2 | 6 |
| client/tests/unit/components/Main.test.tsx | 3 | 147 | 77 | 1.3 | 2 |
| client/tests/unit/components/NewMeeting.creatorKey.test.tsx | 1 | 146 | 56 | 4 | 16 |
| client/tests/unit/museum/useMuseumCursorHide.test.ts | 7 | 138 | 53 | 2 | 1 |
| client/tests/unit/components/TextOutput.test.tsx | 6 | 137 | 64 | 2.7 | 5 |
| client/tests/unit/components/MainOverlays.test.tsx | 10 | 135 | 377 | 1.6 | 11 |
| client/tests/unit/museum/button/buttonIntentIntegration.test.tsx | 5 | 132 | 30 | 2.8 | 4 |
| client/tests/unit/navigation/reloadApp.test.ts | 5 | 132 | 17 | 2.8 | 3 |
| client/tests/unit/voice/captionScheduler.test.ts | 3 | 129 | 5 | 3.3 | 2 |
| client/tests/unit/components/settings/Landing.test.tsx | 4 | 128 | 79 | 2.5 | 13 |
| client/tests/unit/realtime/RealtimeCaptionOverlay.test.tsx | 7 | 119 | 163 | 2 | 7 |
| client/tests/unit/api/http.test.ts | 5 | 115 | 17 | 1.8 | 2 |
| client/tests/unit/components/Navbar.test.tsx | 5 | 115 | 899 | 2.4 | 10 |
| client/tests/unit/logger.test.ts | 7 | 115 | 17 | 2 | 6 |
| client/tests/unit/museum/metaAgent/metaAgentTools.test.ts | 8 | 115 | 5 | 2.9 | 10 |
| client/tests/unit/api/realtimeSession.test.ts | 5 | 113 | 14 | 1.4 | 2 |
| client/tests/unit/components/FoodsCouncilScene.test.tsx | 2 | 113 | 199 | 3 | 9 |
| client/tests/unit/ValidateFoodData.test.ts | 2 | 110 | 3 | 9 | 6 |
| client/tests/unit/voice/useVoiceGuide.test.ts | 4 | 110 | 37 | 1.5 | 3 |
| client/tests/unit/components/AudioOutput.test.tsx | 4 | 101 | 18 | 1.5 | 4 |
| client/tests/unit/components/Output.test.tsx | 5 | 101 | 39 | 2.4 | 7 |
| client/tests/e2e/src/button_setup.spec.ts | 4 | 99 |  | 1 | 9 |
| client/tests/unit/main/overlay/errorStore.test.ts | 12 | 99 | 8 | 1.1 | 1 |
| client/tests/unit/ValidateTopicsData.test.ts | 2 | 93 | 2 | 11 | 4 |
| client/tests/unit/autoplay/autoplayStore.test.ts | 7 | 91 | 5 | 2.3 | 8 |
| client/tests/unit/museum/button/buttonIntent.test.ts | 13 | 91 | 2 | 1 | 6 |
| client/tests/unit/components/overlays/Name.test.tsx | 5 (+1 each) | 88 | 716 | 2 | 3 |
| client/tests/unit/museum/button/ButtonBanner.test.tsx | 4 | 86 | 104 | 1.5 | 4 |
| client/tests/unit/utils.test.ts | 11 | 84 | 3 | 1.8 | 2 |
| client/tests/unit/components/Overlay.test.tsx | 6 | 82 | 230 | 1.5 | 1 |
| client/tests/unit/museum/button/useButton.test.ts | 3 | 82 | 27 | 3.3 | 3 |
| client/tests/unit/api/createMeeting.test.ts | 4 | 81 | 20 | 1.3 | 0 |
| client/tests/unit/api/resumeMeeting.test.ts | 2 (+1 each) | 81 | 13 | 4.5 | 4 |
| client/tests/unit/components/FullscreenButton.test.tsx | 3 | 79 | 57 | 1.3 | 3 |
| client/tests/unit/navigation/probeOriginHealth.test.ts | 4 | 75 | 26 | 1.3 | 1 |
| client/tests/unit/council/participationPhase.test.ts | 11 | 70 | 3 | 1.2 | 1 |
| client/tests/unit/locales.test.ts | 4 | 67 | 14 | 1.5 | 1 |
| client/tests/unit/routing.multilanguage.test.ts | 6 | 66 | 17 | 1.7 | 3 |
| client/tests/unit/components/OverlayWrapper.test.tsx | 4 | 65 | 77 | 1 | 3 |
| client/tests/unit/museum/metaAgent/useMetaAgent.test.ts | 1 | 62 | 34 | 1 | 4 |
| client/tests/unit/components/Background.test.tsx | 3 | 61 | 268 | 2 | 1 |
| client/tests/unit/FoodVideoIntegrity.test.ts | 1 | 58 | 3 | 6 | 5 |
| client/tests/unit/components/overlays/Contact.test.tsx | 1 | 58 | 227 | 10 | 2 |
| client/tests/unit/agendaPointInjection.test.ts | 6 | 57 | 5 | 1.5 | 1 |
| client/tests/unit/components/ConversationControlIcon.test.tsx | 4 | 57 | 199 | 1.8 | 3 |
| client/tests/unit/museum/MuseumSwitchButton.test.tsx | 4 | 57 | 609 | 1.5 | 2 |
| client/tests/unit/audio/audioContext.test.ts | 5 | 56 | 3 | 0.8 | 2 |
| client/tests/unit/topicPrompt.test.ts | 5 | 54 | 5 | 2.8 | 3 |
| client/tests/unit/api/getMeeting.test.ts | 2 | 48 | 23 | 1 | 4 |
| client/tests/unit/autoplay/AutoplayWarning.test.tsx | 2 | 48 | 91 | 2 | 2 |
| client/tests/unit/realtime/realtimeProtocol.test.ts | 2 | 47 | 3 | 2.5 | 2 |
| client/tests/e2e/src/meeting_flow.spec.ts | 2 | 46 |  | 6 | 6 |
| client/tests/unit/routing.singleLanguage.test.ts | 2 | 45 | 41 | 2.5 | 4 |
| client/tests/unit/museum/button/bridgeHealth.test.ts | 2 | 43 | 5 | 1 | 3 |
| client/tests/unit/museum/button/ButtonLedDebugOverlay.test.tsx | 3 | 42 | 132 | 2.3 | 5 |
| client/tests/unit/voice/VoiceGuideOverlay.test.tsx | 2 | 41 | 49 | 1 | 1 |
| client/tests/unit/api/httpErrorMessage.test.ts | 7 | 40 | 8 | 1 | 0 |
| client/tests/unit/shared/devPorts.test.ts | 5 | 39 | 3 | 1.6 | 2 |
| client/tests/unit/components/VideoPreloader.test.tsx | 2 | 38 | 182 | 5.5 | 3 |
| client/tests/unit/museum/button/buttonLedDebug.test.ts | 3 | 38 | 9 | 2 | 2 |
| client/tests/unit/voice/guidePrompt.test.ts | 5 | 38 | 5 | 1.6 | 7 |
| client/tests/unit/components/overlays/Incomplete.test.tsx | 2 | 36 | 76 | 1 | 4 |
| client/tests/unit/museum/button/protocol.test.ts | 4 | 35 | 4 | 2.3 | 1 |
| client/tests/unit/newMeeting/meetingSetupStore.test.ts | 1 | 29 | 3 | 6 | 1 |
| client/tests/unit/IconIntegrity.test.ts | 1 | 28 | 1153 | 2 | 1 |
| client/tests/unit/components/overlays/About.test.tsx | 1 | 28 | 325 | 3 | 1 |
| client/tests/unit/FoodImageIntegrity.test.ts | 1 | 26 | 2 | 3 | 6 |
| client/tests/unit/routing.test.ts | 1 | 22 | 15 | 1 | 6 |
| client/tests/unit/characterSetupMetadata.test.ts | 2 | 20 | 3 | 1.5 | 1 |

### Server
| test file | cases | lines | ms | asserts/case | churn |
|---|---|---|---|---|---|
| server/tests/DialogGenerator.test.js | 25 | 513 | 16 | 2.1 | 10 |
| server/tests/realtimeProviders.test.ts | 15 (+1 each) | 449 | 304 | 2.5 | 12 |
| server/tests/AudioSystemInworld.test.js | 8 | 395 | 137 | 2 | 10 |
| server/tests/realtimeSessionApi.integration.test.ts | 13 | 352 | 342 | 2.6 | 5 |
| server/tests/SpeakerSelection.test.js | 27 | 349 | 111 | 1 | 8 |
| server/tests/ConversationFlow.test.js | 9 | 339 | 330 | 4.7 | 19 |
| server/tests/meetingsHttpAndSocket.integration.test.js | 8 | 330 | 632 | 3 | 11 |
| server/tests/AsyncErrorPropagation.test.js | 5 | 326 | 115 | 3.4 | 13 |
| server/tests/AudioSystemElevenLabs.test.js | 8 | 317 | 277 | 2.3 | 5 |
| server/tests/meetingsHttp.integration.test.js | 12 | 316 | 367 | 3.1 | 14 |
| server/tests/MeetingLifecycleHandler.test.js | 13 | 314 | 12 | 3.1 | 16 |
| server/tests/replayManifest.test.ts | 22 | 305 | 7 | 1.4 | 14 |
| server/tests/HumanInput.test.js | 10 | 258 | 13 | 5.2 | 12 |
| server/tests/AudioSystem.test.js | 8 | 240 | 1067 | 1.8 | 6 |
| server/tests/SpeakerTargetClassifier.test.ts | 9 | 239 | 12 | 2.8 | 7 |
| server/tests/MeetingLoopHardening.test.js | 6 | 234 | 104 | 4 | 3 |
| server/tests/ConversationService.test.ts | 9 | 233 | 24 | 2.1 | 6 |
| server/tests/SummaryGeneration.test.ts | 2 | 219 | 262 | 6 | 5 |
| server/tests/SummaryPendingConclude.test.js | 9 | 218 | 125 | 2.6 | 2 |
| server/tests/PronunciationUtils.test.ts | 17 | 208 | 9 | 2.1 | 3 |
| server/tests/ConnectionHandler.test.js | 8 | 207 | 11 | 2.9 | 9 |
| server/tests/AudioUtils.test.ts | 16 | 191 | 271 | 1.3 | 6 |
| server/tests/DecisionLogic.test.js | 0 | 186 | 218 | 0 | 12 |
| server/tests/characterSetupBundle.test.ts | 11 | 186 | 5 | 1.6 | 3 |
| server/tests/LoggingAndReporting.test.js | 12 | 174 | 64 | 1.6 | 8 |
| server/tests/textUtils.test.js | 15 | 172 | 9 | 1.4 | 3 |
| server/tests/Concurrency.test.js | 2 | 154 | 134 | 7 | 5 |
| server/tests/spaShell.test.ts | 15 | 153 | 7 | 4.7 | 1 |
| server/tests/resumeMeeting.test.ts | 6 | 142 | 123 | 3.7 | 6 |
| server/tests/SocketManager.reconnectRace.test.js | 2 | 123 | 66 | 3 | 1 |
| server/tests/NetworkUtils.test.ts | 9 | 111 | 76 | 1.8 | 1 |
| server/tests/SubtitleTimingValidation.test.ts | 6 | 109 | 4 | 1.5 | 2 |
| server/tests/SummaryMarkdownHandling.test.ts | 1 | 108 | 8 | 11 | 15 |
| server/tests/reportMaximumPlayedIndex.test.ts | 4 | 107 | 37 | 2.8 | 5 |
| server/tests/HandRaising.test.js | 2 | 101 | 18 | 6.5 | 4 |
| server/tests/directedHandoff.test.ts | 5 | 100 | 50 | 1.6 | 1 |
| server/tests/MeetingManagerTransition.test.js | 2 | 97 | 88 | 3.5 | 6 |
| server/tests/ReconnectionRace.test.js | 3 | 97 | 7 | 1.7 | 6 |
| server/tests/SpeakerClassifierBase.test.ts | 11 | 93 | 33 | 1.5 | 1 |
| server/tests/ValidationCustomVoice.test.ts | 4 | 90 | 10 | 1 | 5 |
| server/tests/EstimatedSubtitles.test.ts | 6 | 84 | 8 | 3 | 1 |
| server/tests/SocketManager.startOptions.test.js | 2 | 79 | 6 | 3 | 2 |
| server/tests/audioHttp.integration.test.js | 3 | 79 | 197 | 4.3 | 2 |
| server/tests/AudioDrain.test.js | 1 | 77 | 223 | 4 | 8 |
| server/tests/ConfigurationAndDbErrors.test.js | 4 | 74 | 53 | 1.8 | 3 |
| server/tests/CouncilError.test.js | 6 | 74 | 17 | 2.2 | 1 |
| server/tests/getAutoplayMeeting.test.ts | 5 | 70 | 15 | 1.6 | 4 |
| server/tests/LoggerStaleEvent.test.ts | 4 | 64 | 13 | 2 | 2 |
| server/tests/liveSessionRegistry.test.ts | 7 | 59 | 4 | 1.9 | 4 |
| server/tests/ErrorbotTestRoute.test.js | 3 | 55 | 8 | 3 | 1 |
| server/tests/ValidationSchemas.test.js | 3 | 53 | 272 | 2.7 | 2 |
| server/tests/MarkdownStripping.test.ts | 6 | 51 | 2 | 2.5 | 1 |
| server/tests/ElevenLabsAlignmentUtils.test.ts | 2 | 26 | 2 | 1 | 1 |

## Review slices

Verdicts per slice (keep / merge / rewrite / delete), each reviewed in its own session
against TESTING.md, each producing one small PR:

- [x] 1. Meeting lifecycle + resume/replay (server) — see [test-review-slice-1.md](test-review-slice-1.md); applied, boilerplate only, 442 tests unchanged
- [x] 2. Audio pipeline (server) — see [test-review-slice-2.md](test-review-slice-2.md); applied, cleanup only, 442 tests unchanged
- [x] 3. Realtime voice (client + server protocol together) — see [test-review-slice-3.md](test-review-slice-3.md); dead voice-guide routes + their test deleted, coverage moved into realtimeProviders.test.ts
- [x] 4. Council playback machine + overlays (incl. useCouncilMachine table-drive) — see [test-review-slice-4.md](test-review-slice-4.md); applied, suite 844 → 838
- [x] 5. Museum / button / kiosk — see [test-review-slice-5.md](test-review-slice-5.md); applied, suite 838 → 836
- [x] 6. Routing, i18n, setup flow — see [test-review-slice-6.md](test-review-slice-6.md); applied, suite 836 → 835
- [x] 7. Components sweep (client/tests/unit/components) — see [test-review-slice-7.md](test-review-slice-7.md); applied, snapshot-to-real-assertion fixes, suite unchanged at 835
