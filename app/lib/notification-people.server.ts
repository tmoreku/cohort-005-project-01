import { eq } from "drizzle-orm";
import type { Queryable } from "~/db";
import { users } from "~/db/schema";
import type {
  NotificationActor,
  RecipientUser,
} from "~/lib/notifier.server";

// ─── People on a Notification ───
// The one way domain modules turn Cadence users into a Notification's
// recipients and actor.

type User = typeof users.$inferSelect;

export function getUser(db: Queryable, userId: number): User | undefined {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

export function toRecipient(user: User): RecipientUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    locale: user.locale,
  };
}

export function toActor(user: User): NotificationActor {
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
}
