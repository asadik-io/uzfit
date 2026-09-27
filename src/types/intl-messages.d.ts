import type messages from "../messages/en.json";

declare global {
  // Global alias for message-key typing in helpers.
  type IntlMessages = typeof messages;
}
