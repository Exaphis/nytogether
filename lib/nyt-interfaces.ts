import { z } from 'zod'

export const NYTUserSchema = z.object({
    entitlement: z.string(),
    hasDigi: z.boolean(),
    hasHd: z.boolean(),
    hasXwd: z.boolean(),
    inShortzMode: z.boolean(),
    isFreeTrial: z.boolean(),
    isLoggedIn: z.boolean(),
    regiId: z.string(),
})

export const NYTCellSchema = z.object({
    answer: z.string().optional(),
    checked: z.boolean(), // checked but may or not be correct
    clues: z.array(z.number()),
    confirmed: z.boolean(), // confirmed correct, cannot be changed
    guess: z.string(),
    index: z.number(),
    modified: z.boolean(),
    penciled: z.boolean(),
    revealed: z.boolean(), // revealed manually
    type: z.number(),
})

export const NYTClueSchema = z.object({
    alternativeAriaLabelText: z.string(),
    cells: z.array(z.number()),
    direction: z.enum(['Across', 'Down']),
    index: z.number(),
    isImageClue: z.boolean(),
    label: z.string(),
    list: z.number(),
    next: z.number(),
    prev: z.number(),
    text: z.string(),
    unfilledCount: z.number(),
})

export const NYTStoreStateSchema = z.object({
    cells: z.array(NYTCellSchema),
    clues: z.array(NYTClueSchema),
    puzzle: z.object({
        data: z.object({
            meta: z.object({
                copyright: z.string(),
                editor: z.string().optional(),
                id: z.number(),
                publicationDate: z.string(),
                publishStream: z.string(),
            }),
        }),
        error: z.any(),
        hasLoaded: z.boolean(),
    }),
    toolbar: z.object({
        inPencilMode: z.boolean(),
        inRebusMode: z.boolean(),
        rebusValue: z.string(),
    }),
    status: z.object({
        autocheckEnabled: z.boolean(),
        blankCells: z.number(),
        currentProgress: z.number(),
        incorrectCells: z.number(),
        isFilled: z.boolean(),
        isSolved: z.boolean(),
    }),
    selection: z.object({
        cell: z.number().nullable(),
    }),
    user: z.object({
        settings: z.object({
            nyTogetherDiffVersion: z.number().optional(),
        }),
    }),
    transient: z.object({
        doEscape: z.boolean(),
        isReady: z.boolean(),
        isSynced: z.boolean(),
    }),
    nytogetherUpdating: z.boolean(),
})

// Type inference from the schemas
export type NYTUser = z.infer<typeof NYTUserSchema>
export type NYTStoreState = z.infer<typeof NYTStoreStateSchema>

export interface Member {
    userId: string
    selection: number | null
}

export interface RoomState {
    roomName: string
    requestedRoomName: string
    gameId: string // puzzle ID
    username: string
    userId: string
    members: Record<string, Member>
    guesses: Record<number, Cell>
}

export interface NYTCell {
    guess: string
    penciled: boolean
}

export interface Cell {
    letter: string
    userId: string
    timestamp: number
    penciled: boolean
}

export interface AutoJoinState {
    roomName: string
    displayName: string
}
