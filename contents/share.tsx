import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.nytimes.com/crosswords/game/*"],
  all_frames: true
}

const ShareButton = () => {
  return <button>Share</button>
}

export default ShareButton

export const getInlineAnchor: PlasmoGetInlineAnchor = async () =>
  document.querySelector(".xwd__toolbar--expandedMenu")