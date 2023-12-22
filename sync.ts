import { joinRoom } from "trystero"

export function setupSync() {
    const config = { appId: "nytogether" }
    const room = joinRoom(config, "testroom1")
    return room;
}
