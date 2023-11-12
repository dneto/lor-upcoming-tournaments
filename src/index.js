import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utc from "dayjs/plugin/utc.js";

import { load } from "cheerio";
import { calendar_v3, google } from "googleapis";
import axios, { AxiosResponse } from "axios";

dayjs.extend(customParseFormat);
dayjs.extend(utc);

/**
 * Private key to access google calendar API. Required
 */
const PRIVATE_KEY = process.env.PRIVATE_KEY;

/**
 * Service account to access google calendar API. Required
 */
const SERVICE_ACCOUNT = process.env.SERVICE_ACCOUNT;

/**
 * The calendar id from which the events will be retrieved. Required
 */
const CALENDAR_ID = process.env.CALENDAR_ID;

/**
 * Discord webhook URL. Required
 */
const WEBHOOK_URL = process.env.WEBHOOK_URL;

/**
 * Username to be used by discord in webhook message. Optional
 * If not set, discord will use the default username for the webhook
 */
const USERNAME = process.env.USERNAME;

/**
 * Avatar URL to be used by discord. Optional
 * If not set, discord will use the default avatar url for the webhook
 */
const AVATAR_URL = process.env.AVATAR_URL;

/**
 * Extract tournament info from a google calendar event
 * @param {calendar_v3.Schema$Event} event
 * @returns {{title: string, registrationLink: string, startDate:string}}
 */
function extractTournamentInfo(event) {
  const start = event.start?.dateTime || event.start?.date;
  const $ = load(event.description?.split("<br>")[0] || "");
  const link = $("a").text() || event.description?.split("<br>")[0];
  return {
    title: event.summary || "",
    registrationLink: link || "",
    startDate: dayjs(start).unix().toString(),
  };
}

/**
 * Creates a webhook executor
 * @constructor
 * @param {{url: string, avatar_url: string, username: string}} params Parameters:
 *    - `url` Webhook URL
 *    - `avatar_url` Override the default avatar url of the webhook
 *    - `username` Override the default username of the webhook
 */
function discord_webhook({ url, avatar_url, username }) {
  return {
    /**
     *  Sends a request to the webhook
     *
     * See: https://discord.com/developers/docs/resources/webhook#execute-webhook
     * @param {string} content The message contents (up to 2000 characters)
     * @returns {Promise<AxiosResponse<any,any>>}
     */
    send: async function (content) {
      return await axios.post(url, {
        avatar_url: avatar_url,
        username: username,
        content: content,
      });
    },
  };
}

/**
 * Retrieve events happening in the next 24 hours from google calendar
 * @param {*} params
 * @param {string} params.calendarId
 * @returns
 */
async function listEvents({
  calendarId,
  timeMin,
  timeMax,
  privateKey,
  serviceAccount,
}) {
  const jwt = new google.auth.JWT({
    email: serviceAccount,
    key: privateKey?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  const { events } = google.calendar({ version: "v3", auth: jwt });
  const { data } = await events.list({
    calendarId: calendarId,
    timeMin: timeMin,
    timeMax: timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return data.items;
}

function tournamentLine({ startDate, title, registrationLink }) {
  return `> - [<t:${startDate}:f> ${title}](<${registrationLink}>)`;
}

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY must be set");
  }

  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT must be set");
  }

  if (!CALENDAR_ID) {
    throw new Error("CALENDAR_ID must be set");
  }

  if (!WEBHOOK_URL) {
    throw new Error("WEBHOOK_URL must be set");
  }

  if (!AVATAR_URL) {
    throw new Error("WEBHOOK_URL must be set");
  }

  const now = dayjs().utc();
  const events = await listEvents({
    calendarId: CALENDAR_ID,
    privateKey: PRIVATE_KEY,
    serviceAccount: SERVICE_ACCOUNT,
    timeMin: now.toISOString(),
    timeMax: now.add(1, "day").toISOString(),
  });

  const webhook = discord_webhook({
    url: WEBHOOK_URL,
    avatar_url: AVATAR_URL,
    username: USERNAME,
  });

  if (events.length == 0) {
    webhook.send("No tournaments found!");
    return;
  }

  webhook.send(
    events.map(extractTournamentInfo).map(tournamentLine).join("\n")
  );
}

main().catch((reason) => {
  console.error(reason);
  process.exit(1);
});
