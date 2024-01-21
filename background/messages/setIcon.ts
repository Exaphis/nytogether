import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { path } = req.body
  chrome.action.setIcon({
    path
  })
  res.send(true)
}

export default handler
