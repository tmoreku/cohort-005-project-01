// The seven kinds of Notification and the Notification Channels each one uses
// (spec #21, "Notification catalogue"). One Knock workflow per kind; the
// workflow files live in knock/workflows/<workflowKey>/.

export type EmailDefault = "on" | "off" | "mandatory";

export type NotificationKind = {
  workflowKey: string;
  name: string;
  feed: boolean;
  email: EmailDefault;
  push: boolean;
};

export const NOTIFICATION_CATALOGUE = [
  {
    workflowKey: "refund-request-received",
    name: "Refund request received",
    feed: false,
    email: "mandatory",
    push: false,
  },
  {
    workflowKey: "refund-request-opened",
    name: "Refund Request opened",
    feed: true,
    email: "on",
    push: true,
  },
  {
    workflowKey: "refund-request-approved",
    name: "Refund Request approved",
    feed: true,
    email: "mandatory",
    push: true,
  },
  {
    workflowKey: "refund-request-declined",
    name: "Refund Request declined",
    feed: true,
    email: "mandatory",
    push: true,
  },
  {
    workflowKey: "seat-claimed",
    name: "Seat claimed",
    feed: true,
    email: "off",
    push: false,
  },
  {
    workflowKey: "discussion-question-asked",
    name: "Discussion Question asked",
    feed: true,
    email: "on",
    push: true,
  },
  {
    workflowKey: "discussion-reply",
    name: "Discussion Reply",
    feed: true,
    email: "on",
    push: true,
  },
] as const satisfies readonly NotificationKind[];

type ChannelTypeDefaults = { email: boolean; push?: boolean };

export type KnockPreferenceSet = {
  workflows: Record<string, { channel_types: ChannelTypeDefaults }>;
};

// The Knock environment default preference set: the baseline for every
// recipient who hasn't saved a Notification Preference of their own. The Feed
// has no preference, so in_app_feed is left out (Knock treats unset as on).
export function knockEnvironmentDefaults(): KnockPreferenceSet {
  const workflows: KnockPreferenceSet["workflows"] = {};
  for (const kind of NOTIFICATION_CATALOGUE) {
    const channelTypes: ChannelTypeDefaults = { email: kind.email !== "off" };
    if (kind.push) channelTypes.push = true;
    workflows[kind.workflowKey] = { channel_types: channelTypes };
  }
  return { workflows };
}
