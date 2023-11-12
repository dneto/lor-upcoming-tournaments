import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utc from "dayjs/plugin/utc.js";

import { load } from "cheerio";
import { google } from "googleapis";
import axios from "axios";

const version = "v3";

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SERVICE_ACCOUNT = process.env.SERVICE_ACCOUNT;
const CALENDAR_ID = process.env.CALENDAR_ID;

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const USERNAME = process.env.USERNAME;
const AVATAR_URL = process.env.AVATAR_URL;

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

async function send_webhook({ url, opts }) {
  const resp = await axios.post(url, {
    ...opts,
  });

  return resp;
}

export async function listEvents({
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

  const cal = google.calendar({ version: version, auth: jwt });
  const res = await cal.events.list({
    calendarId: calendarId,
    timeMin: timeMin,
    timeMax: timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items;
}

function tournamentLine(tournament) {
  return `> - [<t:${tournament.startDate}:f> ${tournament.title}](<${tournament.registrationLink}>)`;
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY must be set");
    return;
  }
  if (!SERVICE_ACCOUNT) {
    console.error("SERVICE_ACCOUNT must be set");
    return;
  }
  if (!CALENDAR_ID) {
    console.error("CALENDAR_ID must be set");
    return;
  }

  if (!WEBHOOK_URL) {
    console.error("WEBHOOK_URL must be set");
    return;
  }

  console.info("loading events");
  const now = dayjs().utc();
  const events = await listEvents({
    calendarId: CALENDAR_ID,
    privateKey: PRIVATE_KEY,
    serviceAccount: SERVICE_ACCOUNT,
    timeMin: now.startOf("day").toISOString(),
    timeMax: now.endOf("day").toISOString(),
  });

  console.info("loading tournaments");
  const tournaments = events.map(extractTournamentInfo);

  const content = tournaments.map(tournamentLine).join("\n");
  send_webhook({
    url: WEBHOOK_URL,
    opts: {
      username: USERNAME,
      avatar_url: AVATAR_URL,
      content: content,
    },
  });
}

main();
