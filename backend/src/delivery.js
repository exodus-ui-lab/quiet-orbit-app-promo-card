/**
 * Default delivery: records the send instead of calling an SMS or email provider. Swap it for a real
 * provider via buildApp({ deliver }). The full destination is deliberately left out of the log line.
 */
export function logDelivery({ channel, platform, maskedDestination, ip }, log) {
  log.info({ channel, platform, maskedDestination, ip }, 'app link delivered');
}
