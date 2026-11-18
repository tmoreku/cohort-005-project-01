// npm run knock:push [-- "commit message"]
//
// Validates the Knock email layout and workflows in knock/, pushes them to
// the Knock Development environment and commits them there. Then sets the
// Development settings that live outside workflows: the environment default
// Notification Preferences and the `app_url` variable the email layout uses.
//
// Development only. Promoting to Production is done in the Knock dashboard.
//
// Needs KNOCK_SERVICE_TOKEN (run scripts/knock-cli-wizard.sh). It is read
// from the environment, or from .env when one exists in the current directory.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { knockEnvironmentDefaults } from "../app/lib/notification-catalogue";

const ENVIRONMENT = "development";
const DEV_APP_URL = process.env.KNOCK_DEV_APP_URL ?? "http://localhost:5173";
const MANAGEMENT_API = "https://control.knock.app/v1";

if (existsSync(".env")) process.loadEnvFile(".env");
const token = process.env.KNOCK_SERVICE_TOKEN;
if (!token) {
  console.error(
    "KNOCK_SERVICE_TOKEN is not set. Run `bash scripts/knock-cli-wizard.sh` first."
  );
  process.exit(1);
}

const message = process.argv[2] ?? "Push Cadence notifications from the repo";

function knock(...args: string[]) {
  console.log(`\n$ knock ${args.join(" ")}`);
  execFileSync("npx", ["-y", "@knocklabs/cli@1.6.3", ...args], {
    stdio: "inherit",
  });
}

async function managementApi(path: string, body: unknown) {
  const response = await fetch(`${MANAGEMENT_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `PUT ${path} failed: ${response.status} ${await response.text()}`
    );
  }
}

const env = ["--environment", ENVIRONMENT];
knock("layout", "validate", "--all", "--layouts-dir", "knock/layouts", ...env);
knock(
  "workflow",
  "validate",
  "--all",
  "--workflows-dir",
  "knock/workflows",
  ...env
);
// The layout goes first: workflows that use it don't validate without it.
knock(
  "layout",
  "push",
  "--all",
  "--layouts-dir",
  "knock/layouts",
  ...env,
  "--commit",
  "-m",
  message
);
knock(
  "workflow",
  "push",
  "--all",
  "--workflows-dir",
  "knock/workflows",
  ...env,
  "--commit",
  "-m",
  message
);

console.log("\nSetting Development's default Notification Preferences");
await managementApi(`/environments/${ENVIRONMENT}/defaults`, {
  preference_set: knockEnvironmentDefaults(),
});

console.log(`Setting Development's app_url variable to ${DEV_APP_URL}`);
await managementApi("/variables/app_url", {
  type: "public",
  environment_values: { [ENVIRONMENT]: DEV_APP_URL },
});

console.log("\nDone: Knock Development matches knock/.");
