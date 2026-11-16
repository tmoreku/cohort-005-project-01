// PROTOTYPE (throwaway): Notification Preferences screen — wayfinder ticket #20.
// Pure data: which Notification kinds exist, who sees a preference row for each,
// and their default Notification Preferences (from ticket #10).
//
// "Refund request received" (ticket #18) is mandatory email only, with no
// Feed entry and no preference row, so it is deliberately absent here.

export type Channel = "email" | "push";

export type Audience = "buyer" | "teamAdmin" | "instructor" | "platformAdmin" | "questionAuthor";

export interface NotificationKind {
  key: string;
  name: string; // the Notification's name, as in the catalogue
  sentence: string; // plain-language "when..." sentence
  group: string;
  audience: Audience;
  email: "on" | "off" | "mandatory";
  push: "on" | "off" | "unavailable";
  why?: string; // shown next to a locked or missing switch
}

export const KINDS: NotificationKind[] = [
  {
    key: "refund-opened",
    name: "Refund Request opened",
    sentence: "A buyer asks for a refund",
    group: "Platform admin",
    audience: "platformAdmin",
    email: "on",
    push: "on",
  },
  {
    key: "refund-approved",
    name: "Refund Request approved",
    sentence: "Your refund request is approved",
    group: "Your refunds",
    audience: "buyer",
    email: "mandatory",
    push: "on",
    why: "Always emailed: it's about your money.",
  },
  {
    key: "refund-declined",
    name: "Refund Request declined",
    sentence: "Your refund request is declined",
    group: "Your refunds",
    audience: "buyer",
    email: "mandatory",
    push: "on",
    why: "Always emailed: it's about your money.",
  },
  {
    key: "seat-claimed",
    name: "Seat claimed",
    sentence: "Someone claims a seat on your Team Licence",
    group: "Your team",
    audience: "teamAdmin",
    email: "off",
    push: "unavailable",
    why: "No browser notifications: seats are often claimed in bursts.",
  },
  {
    key: "question-asked",
    name: "Discussion Question asked",
    sentence: "A student asks a question on one of your lessons",
    group: "Your courses",
    audience: "instructor",
    email: "on",
    push: "on",
  },
  {
    key: "reply",
    name: "Discussion Reply",
    sentence: "Someone replies to a question you asked",
    group: "Discussions",
    audience: "questionAuthor",
    email: "on",
    push: "on",
  },
];

export type Persona = "student" | "teamAdmin" | "instructor" | "admin";

export const PERSONA_LABELS: Record<Persona, string> = {
  student: "Student",
  teamAdmin: "Student + Team Admin",
  instructor: "Instructor",
  admin: "Platform Admin",
};

// Assumption for the prototype (flag it in the resolution): only Students buy
// courses and ask Discussion Questions, so only they see the buyer and
// question-author rows.
export function kindsFor(persona: Persona): NotificationKind[] {
  return KINDS.filter((k) => {
    switch (k.audience) {
      case "buyer":
      case "questionAuthor":
        return persona === "student" || persona === "teamAdmin";
      case "teamAdmin":
        return persona === "teamAdmin";
      case "instructor":
        return persona === "instructor";
      case "platformAdmin":
        return persona === "admin";
    }
  });
}

export type Prefs = Record<string, { email: boolean; push: boolean }>;

export function defaultPrefs(): Prefs {
  return Object.fromEntries(
    KINDS.map((k) => [k.key, { email: k.email !== "off", push: k.push === "on" }])
  );
}

// Browser push state, simplified from ticket #16 ("token gone" re-registers
// silently, so it isn't a visible state here; "off" is Turn off for this browser).
export type PushState = "not-asked" | "on" | "off" | "denied" | "ios-tab" | "unsupported";

export const PUSH_STATES: PushState[] = ["not-asked", "on", "off", "denied", "ios-tab", "unsupported"];

export const PUSH_STATE_LABELS: Record<PushState, string> = {
  "not-asked": "Not yet asked",
  on: "On for this browser",
  off: "Turned off for this browser",
  denied: "Blocked",
  "ios-tab": "iPhone/iPad tab",
  unsupported: "Can't do push",
};

// One short line describing what the browser state means for the push switches.
export const PUSH_STATE_HINT: Record<PushState, string> = {
  "not-asked": "Browser notifications aren't on for this browser yet.",
  on: "Browser notifications are on for this browser.",
  off: "You turned browser notifications off for this browser.",
  denied: "This browser is blocking notifications from Cadence.",
  "ios-tab": "On iPhone and iPad, add Cadence to your Home Screen first.",
  unsupported: "This browser can't show notifications.",
};
