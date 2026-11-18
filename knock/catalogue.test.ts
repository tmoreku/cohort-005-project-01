import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BROWSER_PUSH_TEST_WORKFLOW } from "~/lib/browser-push.server";
import { NOTIFICATION_CATALOGUE } from "~/lib/notification-catalogue";

// The Knock workflows in this directory are pushed to Knock as they are, so
// they must route each kind to exactly the Notification Channels the
// catalogue gives it.

const workflowSchema = z.object({
  settings: z
    .object({ override_preferences: z.boolean() })
    .partial()
    .optional(),
  trigger_data_json_schema: z.object({ required: z.array(z.string()) }),
  steps: z.array(
    z.object({
      channel_type: z.string(),
      channel_key: z.string(),
      template: z
        .object({ settings: z.object({ layout_key: z.string() }).partial() })
        .partial(),
    })
  ),
});

const workflowsDir = new URL("./workflows/", import.meta.url);

function readWorkflow(key: string) {
  return workflowSchema.parse(
    JSON.parse(
      readFileSync(new URL(`${key}/workflow.json`, workflowsDir), "utf8")
    )
  );
}

// Sample trigger data the Knock CLI wizard sends to check the emails.
const samples = z
  .array(
    z.object({
      workflow: z.string(),
      data: z.record(z.unknown()),
    })
  )
  .parse(
    JSON.parse(
      readFileSync(
        new URL("../scripts/knock-samples.json", import.meta.url),
        "utf8"
      )
    )
  );

describe("Knock workflows", () => {
  it("has one workflow per Notification kind, plus the browser push test", () => {
    const dirs = readdirSync(workflowsDir).sort();
    const keys = [
      ...NOTIFICATION_CATALOGUE.map((k) => k.workflowKey),
      BROWSER_PUSH_TEST_WORKFLOW,
    ].sort();
    expect(dirs).toEqual(keys);
  });

  // "Send a test notification" on Settings: web push only, whatever the
  // person's Notification Preferences say.
  it("sends the browser push test by web push only, ignoring preferences", () => {
    const workflow = readWorkflow(BROWSER_PUSH_TEST_WORKFLOW);
    expect(
      workflow.steps.map((s) => [s.channel_type, s.channel_key])
    ).toEqual([["push", "web-push-fcm"]]);
    expect(workflow.settings?.override_preferences).toBe(true);
    expect(workflow.trigger_data_json_schema.required).toEqual(["url"]);
  });

  for (const kind of NOTIFICATION_CATALOGUE) {
    describe(kind.workflowKey, () => {
      const workflow = readWorkflow(kind.workflowKey);

      it("has a sample with every field its trigger data requires", () => {
        const sample = samples.find((s) => s.workflow === kind.workflowKey);
        const missing = workflow.trigger_data_json_schema.required.filter(
          (field) => !(field in (sample?.data ?? {}))
        );
        expect(missing).toEqual([]);
      });

      it("uses the catalogue's channels", () => {
        const expected = [
          ...(kind.feed ? [["in_app_feed", "in-app"]] : []),
          ["email", "email-resend"],
          ...(kind.push ? [["push", "web-push-fcm"]] : []),
        ];
        expect(
          workflow.steps.map((s) => [s.channel_type, s.channel_key])
        ).toEqual(expected);
      });

      it("wraps its email in the Cadence layout", () => {
        const email = workflow.steps.find((s) => s.channel_type === "email");
        expect(email?.template.settings?.layout_key).toBe("cadence");
      });

      // Knock can only ignore preferences for a whole workflow, so only a
      // kind whose every channel is mandatory overrides them.
      it("overrides recipient preferences only when it is email-only and mandatory", () => {
        const emailOnlyMandatory =
          kind.email === "mandatory" && !kind.feed && !kind.push;
        expect(workflow.settings?.override_preferences ?? false).toBe(
          emailOnlyMandatory
        );
      });
    });
  }
});
