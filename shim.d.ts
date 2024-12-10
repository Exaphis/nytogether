import { ProtocolWithReturn } from 'webext-bridge'
import { RoomState } from './lib/nyt-interfaces'

declare module 'webext-bridge' {
    export interface ProtocolMap {
        'room-state': RoomState | null
        'query-room-state': ProtocolWithReturn<null, RoomState | null>
        'game-state': NYTStoreState | null
        'query-game-state': ProtocolWithReturn<null, NYTStoreState | null>
        'set-board': RoomGuesses | null
        'join-room': ProtocolWithReturn<
            { roomName: string; username: string },
            { success: boolean; error?: string }
        >
        'leave-room': ProtocolWithReturn<null, void>
    }
}
