import { onMessage } from "webext-bridge/background";

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });

  // onMessage("redeem", async (message) => {
  //   // browser.tabs.create({ url: 'https://www.google.com' });
  // });
});
