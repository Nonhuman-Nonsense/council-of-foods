/// <reference types="vite-plugin-svgr/client" />

import VolumeOff from './volume_off.svg?react';
import VolumeOffFilled from './volume_off_filled.svg?react';
import VolumeOn from './volume_on.svg?react';
import VolumeOnFilled from './volume_on_filled.svg?react';
import Backward from './backward.svg?react';
import BackwardFilled from './backward_filled.svg?react';
import Play from './play.svg?react';
import PlayFilled from './play_filled.svg?react';
import Pause from './pause.svg?react';
import PauseFilled from './pause_filled.svg?react';
import Forward from './forward.svg?react';
import ForwardFilled from './forward_filled.svg?react';
import RaiseHand from './raise_hand.svg?react';
import RaiseHandFilled from './raise_hand_filled.svg?react';
import RecordVoiceOn from './record_voice_on.svg?react';
import RecordVoiceOnFilled from './record_voice_on_filled.svg?react';
import RecordVoiceOff from './record_voice_off.svg?react';
import RecordVoiceOffFilled from './record_voice_off_filled.svg?react';
import SendMessage from './send_message.svg?react';
import SendMessageFilled from './send_message_filled.svg?react';
import Close from './close.svg?react';
import CloseFullscreen from './close_fullscreen.svg?react';
import Fullscreen from './fullscreen.svg?react';
import Hamburger from './hamburger.svg?react';

export const Icons = {
    volume_off: VolumeOff,
    volume_off_filled: VolumeOffFilled,
    volume_on: VolumeOn,
    volume_on_filled: VolumeOnFilled,
    backward: Backward,
    backward_filled: BackwardFilled,
    play: Play,
    play_filled: PlayFilled,
    pause: Pause,
    pause_filled: PauseFilled,
    forward: Forward,
    forward_filled: ForwardFilled,
    raise_hand: RaiseHand,
    raise_hand_filled: RaiseHandFilled,
    record_voice_on: RecordVoiceOn,
    record_voice_on_filled: RecordVoiceOnFilled,
    record_voice_off: RecordVoiceOff,
    record_voice_off_filled: RecordVoiceOffFilled,
    send_message: SendMessage,
    send_message_filled: SendMessageFilled,
    close: Close,
    close_fullscreen: CloseFullscreen,
    fullscreen: Fullscreen,
    hamburger: Hamburger,
} as const;

export type IconName = keyof typeof Icons;
