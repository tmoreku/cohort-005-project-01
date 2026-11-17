import type {
  ChannelTypePreferences,
  SetPreferencesProperties,
} from "@knocklabs/client";
import { UserRole } from "~/db/schema";
import type { NotificationKind } from "~/lib/notifier.server";

// ─── Notification Preferences ───
// Which Notifications a person can choose about on Settings, their default
// Notification Preferences, and how a switch maps onto the person's Knock
// preference set (one workflow per kind; email → Knock's `email` channel
// type, browser → `push`). The Feed has no Notification Preference.
//
// The defaults here must match the Knock environment's default preference
// set: Knock applies those to anyone who hasn't flipped a switch, and this
// shows them.

export type PreferenceChannel = "email" | "browser";

export type PreferenceRow = {
  kind: NotificationKind;
  name: string;
  description: string;
  // "mandatory": always emailed; shown locked on and never written to Knock.
  email: "on" | "off" | "mandatory";
  // "none": the kind has no web push step; shown as "—".
  browser: "on" | "off" | "none";
};

type Audience =
  "buyer" | "questionAuthor" | "teamAdmin" | "instructor" | "platformAdmin";

const ROWS: (PreferenceRow & { audience: Audience })[] = [
  {
    kind: "refund-request-opened",
    name: "Refund Request opened",
    description: "A buyer asks for a refund",
    audience: "platformAdmin",
    email: "on",
    browser: "on",
  },
  {
    kind: "refund-request-approved",
    name: "Refund Request approved",
    description: "Your refund request is approved",
    audience: "buyer",
    email: "mandatory",
    browser: "on",
  },
  {
    kind: "refund-request-declined",
    name: "Refund Request declined",
    description: "Your refund request is declined",
    audience: "buyer",
    email: "mandatory",
    browser: "on",
  },
  {
    kind: "discussion-reply",
    name: "Discussion Reply",
    description: "Someone replies to a question you asked",
    audience: "questionAuthor",
    email: "on",
    browser: "on",
  },
  {
    kind: "seat-claimed",
    name: "Seat claimed",
    description: "Someone claims a Seat on your Team Licence",
    audience: "teamAdmin",
    email: "off",
    browser: "none",
  },
  {
    kind: "discussion-question-asked",
    name: "Discussion Question asked",
    description: "A Student asks a question on one of your lessons",
    audience: "instructor",
    email: "on",
    browser: "on",
  },
];

export type PreferencePerson = { role: UserRole; isTeamAdmin: boolean };

function receives(person: PreferencePerson, audience: Audience): boolean {
  switch (audience) {
    // Only Students buy courses and ask Discussion Questions.
    case "buyer":
    case "questionAuthor":
      return person.role === UserRole.Student;
    // Whoever bought a Team Licence hears about its Seats.
    case "teamAdmin":
      return person.isTeamAdmin;
    case "instructor":
      return person.role === UserRole.Instructor;
    case "platformAdmin":
      return person.role === UserRole.Admin;
  }
}

// One row per Notification this person can receive. Refund request received
// has no row: it's a mandatory email with nothing to choose.
export function preferenceRowsFor(person: PreferencePerson): PreferenceRow[] {
  return ROWS.filter((row) => receives(person, row.audience)).map(
    ({ audience: _audience, ...row }) => row
  );
}

// ─── Knock preference sets ───

// A Knock preference set, as loaded (missing parts are null) or as saved.
export type KnockPreferences = {
  [K in keyof SetPreferencesProperties]?: SetPreferencesProperties[K] | null;
};

export type SavedPreferences = Partial<
  Record<NotificationKind, Record<PreferenceChannel, boolean>>
>;

const KNOCK_CHANNEL_TYPE = {
  email: "email",
  browser: "push",
} as const satisfies Record<PreferenceChannel, keyof ChannelTypePreferences>;

// What one switch currently says: the person's saved choice, else the default.
// Knock conditions aren't something this card writes, so they read as the
// default too.
function savedValue(
  row: PreferenceRow,
  channel: PreferenceChannel,
  preferences: KnockPreferences | null
): boolean {
  const fallback =
    channel === "email" ? row.email !== "off" : row.browser === "on";
  if (channel === "email" && row.email === "mandatory") return true;

  const setting = preferences?.workflows?.[row.kind];
  if (typeof setting === "boolean") return setting;
  if (setting && "channel_types" in setting) {
    const value = setting.channel_types[KNOCK_CHANNEL_TYPE[channel]];
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

// The whole preference set to save after flipping one switch. Knock replaces
// the set on save, so everything else the person has saved is carried over.
// Mandatory emails are never written: Knock's defaults keep them on.
export function withPreference(
  current: KnockPreferences | null,
  row: PreferenceRow,
  channel: PreferenceChannel,
  value: boolean
): SetPreferencesProperties {
  if (channel === "email" && row.email === "mandatory") {
    throw new Error(`${row.name} emails can't be turned off.`);
  }
  if (channel === "browser" && row.browser === "none") {
    throw new Error(`${row.name} has no browser notifications.`);
  }

  const next: SetPreferencesProperties = {};
  if (current?.categories) next.categories = current.categories;
  if (current?.channel_types) next.channel_types = current.channel_types;
  if (current?.channels) next.channels = current.channels;

  const existing = current?.workflows?.[row.kind];
  let channelTypes: ChannelTypePreferences = {};
  if (typeof existing === "boolean") {
    channelTypes = { email: existing, push: existing };
  } else if (existing && "channel_types" in existing) {
    channelTypes = existing.channel_types;
  }

  next.workflows = {
    ...current?.workflows,
    [row.kind]: {
      channel_types: { ...channelTypes, [KNOCK_CHANNEL_TYPE[channel]]: value },
    },
  };
  return next;
}

export function readPreferences(
  rows: PreferenceRow[],
  preferences: KnockPreferences | null
): SavedPreferences {
  const saved: SavedPreferences = {};
  for (const row of rows) {
    saved[row.kind] = {
      email: savedValue(row, "email", preferences),
      browser: savedValue(row, "browser", preferences),
    };
  }
  return saved;
}
