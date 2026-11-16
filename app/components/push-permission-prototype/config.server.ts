// PROTOTYPE (throwaway): browser push permission — wayfinder ticket #16.
try {
  process.loadEnvFile?.(".env");
} catch {}

export function getPrototypePushConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.FIREBASE_APP_ID ?? "",
    vapidKey: process.env.FIREBASE_VAPID_PUBLIC_KEY ?? "",
  };
}

export type PrototypePushConfig = ReturnType<typeof getPrototypePushConfig>;
