const wordEngine      = require("../services/wordEngine");
const notificationSvc = require("../services/notificationService");
const logger          = require("../utils/logger");

const APP_URL = () => process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz";

function getManifest(req, res) {
  res.json({
    accountAssociation: {
      header:    process.env.FC_ACCOUNT_HEADER    || "eyJmaWQiOjEsInR5cGUiOiJjdXN0b2R5IiwiY3VzdG9keUFkZHJlc3MiOiIweDAwMCJ9",
      payload:   process.env.FC_ACCOUNT_PAYLOAD   || "eyJkb21haW4iOiJjcnlwdG93b3JkcGxheS54eXoifQ",
      signature: process.env.FC_ACCOUNT_SIGNATURE || "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    },
    frame: {
      version:               "1",
      name:                  "Crypto Wordplay",
      iconUrl:               `${APP_URL()}/icon.png`,
      homeUrl:               APP_URL(),
      imageUrl:              `${APP_URL()}/api/og/daily`,
      buttonTitle:           "Play Now ⚡",
      splashImageUrl:        `${APP_URL()}/splash.png`,
      splashBackgroundColor: "#060608",
      webhookUrl:            `${APP_URL()}/api/farcaster/webhook`,
    },
  });
}

function getFrame(req, res) {
  const today = wordEngine.getTodayString();
  const url   = APP_URL();
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="fc:frame" content='{"version":"next","imageUrl":"${url}/api/og/daily?date=${today}","button":{"title":"Play Now ⚡","action":{"type":"launch_frame","name":"Crypto Wordplay","url":"${url}","splashImageUrl":"${url}/splash.png","splashBackgroundColor":"#060608"}}}'/>
<meta property="og:title" content="Crypto Wordplay"/><meta property="og:image" content="${url}/api/og/daily?date=${today}"/>
<meta http-equiv="refresh" content="0;url=${url}"/></head><body>Redirecting...</body></html>`);
}

async function handleWebhook(req, res) {
  try {
    const { event, data } = req.body || {};
    logger.info("Farcaster webhook", { event });
    const { fid, notificationDetails } = data || {};
    if (fid && notificationDetails?.token) {
      if (event === "frame_added" || event === "notifications_enabled") {
        await notificationSvc.saveNotificationToken({ farcasterFid: fid, token: notificationDetails.token, url: notificationDetails.url });
      } else if (event === "frame_removed" || event === "notifications_disabled") {
        await notificationSvc.removeNotificationToken({ farcasterFid: fid, token: notificationDetails.token });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error("Webhook error", { error: err.message });
    res.json({ ok: true });
  }
}

module.exports = { getManifest, getFrame, handleWebhook };
