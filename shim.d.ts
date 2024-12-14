import { ProtocolWithReturn } from 'webext-bridge'
import { RoomState, NYTStoreState, NYTCell } from './lib/nyt-interfaces'

declare module 'webext-bridge' {
    export interface ProtocolMap {
        'room-state': RoomState | null
        'query-room-state': ProtocolWithReturn<null, void>
        'game-state': NYTStoreState | null
        'query-game-state': ProtocolWithReturn<null, void>
        'set-cell': { cellId: number; cell: NYTCell }
        'join-room': ProtocolWithReturn<
            { roomName: string; username: string },
            { success: boolean; error?: string }
        >
        'leave-room': ProtocolWithReturn<null, void>
        'cell-update': { [cell: number]: NYTCell }
    }
}
