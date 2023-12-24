import { nanoid } from "nanoid"
import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo"

import { initialize } from "./content"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true,
  world: "MAIN" // required to set window hash
}

const ShareButton = () => {
  return (
    <button
      onClick={() => {
        if (!window.location.hash) {
          window.location.hash = nanoid(7)
          initialize()
        }
      }}>
      Share
    </button>
  )
}

export default ShareButton

export const getInlineAnchor: PlasmoGetInlineAnchor = async () =>
  document.querySelector(".xwd__toolbar--expandedMenu")
