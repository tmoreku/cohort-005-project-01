// PROTOTYPE (throwaway): Notification emails, wayfinder ticket #18.
import type { Route } from "./+types/prototype.notification-emails";
import { getEmailSeed } from "~/components/notification-emails-prototype/data.server";
import { NotificationEmailsPrototype } from "~/components/notification-emails-prototype";

export function meta() {
  return [{ title: "PROTOTYPE: Notification emails — Cadence" }];
}

export function loader(_: Route.LoaderArgs) {
  return { seed: getEmailSeed() };
}

export default function NotificationEmailsPrototypeRoute({ loaderData }: Route.ComponentProps) {
  return <NotificationEmailsPrototype seed={loaderData.seed} />;
}
