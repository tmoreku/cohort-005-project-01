// PROTOTYPE (throwaway): Notification emails, wayfinder ticket #18
// "What does each Notification's email say?"
//
// Plan: three structurally different email layouts (A Plain note, B Branded
// card, C Fact sheet), switchable via ?variant=, on a throwaway route
// /prototype/notification-emails. A fake inbox on the left lists all six
// v1 Notification emails (?email=) so subject lines and preview text can be
// judged side by side. The *copy* is shared across variants; the variants
// disagree about structure, hierarchy and the footer.
//
// Nothing is sent. Links are placeholders until "Where does each
// Notification link to?" (#19) decides them.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import type { EmailSeed } from "./data.server";

// ─── Shared copy model ───

type Kind =
  | "refund_received"
  | "refund_opened"
  | "refund_approved"
  | "refund_declined"
  | "seat_claimed"
  | "question_asked"
  | "reply_posted";

interface Quote {
  label: string;
  author?: string;
  text: string;
  muted?: boolean;
}

interface EmailCopy {
  kind: Kind;
  kindLabel: string; // eyebrow, also the Notification Preferences row name
  to: string;
  subject: string;
  feedTitle: string; // the Notification title in the Feed / push; also the email headline
  preheader: string;
  greetingName: string;
  lead: string[];
  quotes: Quote[];
  after: string[];
  facts: [string, string][];
  cta: { label: string; href: string };
  mandatory: boolean;
  why: string; // "You're getting this because…"
  defaultOff?: boolean;
  channelsUndecided?: boolean;
}

interface Options {
  tzKnown: boolean;
  approvedNote: boolean;
  lastSeat: boolean;
}

// Titles can end in their own punctuation ("What is TypeScript?"): don't add
// a full stop after one.
const end = (s: string) => (/[?!.…]$/.test(s) ? s : s + ".");

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Times are in the recipient's timezone; UTC (written out) when unknown.
function when(iso: string, tzKnown: boolean) {
  const timeZone = tzKnown ? "Africa/Johannesburg" : "UTC";
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
  return tzKnown ? parts : parts.replace(/GMT|UTC/, "UTC");
}

const excerpt = (s: string, n: number) => {
  const flat = s.replace(/```[\s\S]*?```/g, "[code]").replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1).trimEnd() + "…" : flat;
};

const QUOTE_LIMIT = 600;
const clip = (s: string) =>
  s.length > QUOTE_LIMIT ? s.slice(0, QUOTE_LIMIT).trimEnd() + "…" : s;

function buildEmails(seed: EmailSeed, o: Options): EmailCopy[] {
  const { course, lesson } = seed;
  const paid = money(course.price);
  const t = (minsAgo: number) =>
    when(new Date(Date.now() - minsAgo * 60_000).toISOString(), o.tzKnown);
  const reason =
    "The course moves a lot faster than the sales page suggested. I got through module 1 but I'm lost from module 2 on.";
  const declineNote =
    "You've finished 14 of the 18 lessons, which is past the point where we can refund. If module 2 is the sticking point, ask a question on the lesson: the Instructor answers them.";
  const approveNote = "Sorry it wasn't the right fit, hope to see you back.";
  const total = 10;
  const used = o.lastSeat ? 10 : 4;

  return [
    {
      kind: "refund_received",
      kindLabel: "Refund request received",
      to: "the buyer",
      subject: `Refund request received: ${course.title}`,
      feedTitle: `We've got your refund request for ${course.title}`,
      preheader: `A Platform Admin will look at it and email you the decision.`,
      greetingName: seed.buyer.name.split(" ")[0],
      lead: [
        end(`We've got your refund request for ${course.title}`),
        `If it's approved, you'll get back ${paid}, the full amount you paid. A Platform Admin reviews every request by hand and we'll email you the decision. You don't need to do anything else.`,
      ],
      quotes: [{ label: "Your reason", text: reason, muted: true }],
      after: ["You keep access to the course while we look at it."],
      facts: [
        ["Course", course.title],
        ["Refund if approved", `${paid} (the full amount)`],
        ["Requested", t(1)],
      ],
      cta: { label: `Go to ${course.title}`, href: `/courses/${course.slug}` },
      mandatory: true,
      channelsUndecided: true,
      why: "You're getting this because you asked for a refund.",
    },
    {
      kind: "refund_opened",
      kindLabel: "Refund request opened",
      to: "Platform Admins",
      subject: `Refund request: ${course.title} (${paid})`,
      feedTitle: `${seed.buyer.name} asked for a refund on ${course.title}`,
      preheader: `${paid} · "${excerpt(reason, 70)}"`,
      greetingName: seed.admin.name.split(" ")[0],
      lead: [
        end(`${seed.buyer.name} asked for a refund of ${paid} on ${course.title}`),
      ],
      quotes: [{ label: "Their reason", author: seed.buyer.name, text: reason }],
      after: [],
      facts: [
        ["Buyer", `${seed.buyer.name} (${seed.buyer.email})`],
        ["Course", course.title],
        ["Purchase", `Individual Purchase, ${paid}`],
        ["Bought", t(60 * 24 * 9)],
        ["Requested", t(3)],
      ],
      cta: { label: "Review the refund request", href: "/admin/refunds" },
      mandatory: false,
      why: "You're getting this because you're a Platform Admin.",
    },
    {
      kind: "refund_approved",
      kindLabel: "Refund request approved",
      to: "the buyer",
      subject: `Refund request approved: ${course.title}`,
      feedTitle: `Your refund request for ${course.title} was approved`,
      preheader: `${paid}, the full amount you paid, is on its way back to you.`,
      greetingName: seed.buyer.name.split(" ")[0],
      lead: [
        end(`We've approved your refund request for ${course.title}`),
        `${paid}, the full amount you paid, is on its way back to you. Depending on your bank, it can take a few days to show.`,
      ],
      quotes: o.approvedNote
        ? [{ label: "Platform Admin", author: seed.admin.name, text: approveNote }]
        : [],
      after: [end(`You no longer have access to ${course.title}`)],
      facts: [
        ["Course", course.title],
        ["Refund", `${paid} (the full amount)`],
        ["Decided", t(2)],
      ],
      cta: { label: "Browse courses", href: "/courses" },
      mandatory: true,
      why: "You're getting this because you asked for a refund.",
    },
    {
      kind: "refund_declined",
      kindLabel: "Refund request declined",
      to: "the buyer",
      subject: `Refund request declined: ${course.title}`,
      feedTitle: `Your refund request for ${course.title} was declined`,
      preheader: excerpt(declineNote, 90),
      greetingName: seed.buyer.name.split(" ")[0],
      lead: [
        `We've looked at your refund request for ${course.title} and decided not to refund it.`,
      ],
      quotes: [{ label: "Platform Admin", author: seed.admin.name, text: declineNote }],
      after: [
        "You still have everything you bought. If something changes, you can ask again from the course page.",
      ],
      facts: [
        ["Course", course.title],
        ["Decided", t(2)],
      ],
      cta: { label: `Go to ${course.title}`, href: `/courses/${course.slug}` },
      mandatory: true,
      why: "You're getting this because you asked for a refund.",
    },
    {
      kind: "seat_claimed",
      kindLabel: "Seat claimed",
      to: "the Team Admin",
      subject: `Seat claimed on ${course.title} (${used} of ${total})`,
      feedTitle: `${seed.student.name} claimed a seat on ${course.title} (${used} of ${total} used)`,
      preheader:
        used === total
          ? "That was the last Seat on this Team Licence."
          : `${total - used} Seats are still unclaimed.`,
      greetingName: seed.teamAdmin.name.split(" ")[0],
      lead: [
        end(`${seed.student.name} (${seed.student.email}) claimed a Seat on your Team Licence for ${course.title}`),
        used === total
          ? `That was the last one: all ${total} Seats are now claimed.`
          : `${used} of ${total} Seats are now claimed, ${total - used} are still free.`,
      ],
      quotes: [],
      after: [],
      facts: [
        ["Student", `${seed.student.name} (${seed.student.email})`],
        ["Course", course.title],
        ["Seats", `${used} of ${total} claimed`],
        ["Claimed", t(1)],
      ],
      cta: { label: "See your team", href: "/team" },
      mandatory: false,
      defaultOff: true,
      why: "You're getting this because you turned on Seat claimed emails.",
    },
    {
      kind: "question_asked",
      kindLabel: "Discussion Question asked",
      to: "the Instructor",
      subject: `Question from ${seed.student.name} on ${lesson.title}`,
      feedTitle: `${seed.student.name} asked a question on ${lesson.title}`,
      preheader: excerpt(seed.question, 90),
      greetingName: seed.instructor.name.split(" ")[0],
      lead: [end(`${seed.student.name} asked a question on ${lesson.title} in ${course.title}`)],
      quotes: [
        { label: "Their question", author: seed.student.name, text: clip(seed.question) },
      ],
      after: [],
      facts: [
        ["From", seed.student.name],
        ["Lesson", lesson.title],
        ["Course", course.title],
        ["Asked", t(4)],
      ],
      cta: {
        label: "Answer the question",
        href: `/courses/${course.slug}/lessons/${lesson.id}`,
      },
      mandatory: false,
      why: `You're getting this because you teach ${course.title}.`,
    },
    {
      kind: "reply_posted",
      kindLabel: "Discussion Reply posted",
      to: "the question's author",
      subject: `New reply to your question on ${lesson.title}`,
      feedTitle: `${seed.replier.name} replied to your question on ${lesson.title}`,
      preheader: excerpt(seed.reply, 90),
      greetingName: seed.student.name.split(" ")[0],
      lead: [end(`${seed.replier.name} replied to your question on ${lesson.title}`)],
      quotes: [
        { label: "Your question", text: excerpt(seed.question, 160), muted: true },
        { label: "Their reply", author: seed.replier.name, text: clip(seed.reply) },
      ],
      after: [],
      facts: [
        ["From", seed.replier.name],
        ["Lesson", lesson.title],
        ["Course", course.title],
        ["Replied", t(6)],
      ],
      cta: {
        label: "Read the reply",
        href: `/courses/${course.slug}/lessons/${lesson.id}`,
      },
      mandatory: false,
      why: "You're getting this because you asked this question.",
    },
  ];
}

// Very rough markdown: fenced code → <pre>, blank lines → paragraphs.
function Md({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/```\w*\n?([\s\S]*?)```/g);
  return (
    <div className={className}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="my-2 overflow-x-auto rounded bg-zinc-100 p-2 font-mono text-[12px] text-zinc-800">
            {p.trim()}
          </pre>
        ) : (
          p
            .split(/\n{2,}/)
            .filter((x) => x.trim())
            .map((para, j) => (
              <p key={`${i}-${j}`} className="my-1.5 whitespace-pre-line">
                {para.replace(/`([^`]+)`/g, "$1")}
              </p>
            ))
        )
      )}
    </div>
  );
}

const PREFS_HREF = "/settings#notification-preferences";

// ─── Variant A: Plain note ───
// Reads like a person wrote it. No logo bar, no button, inline link. Footer
// is one grey line with a one-click "turn off" link.
function VariantA({ e }: { e: EmailCopy }) {
  return (
    <div className="mx-auto max-w-[560px] px-6 py-8 font-sans text-[15px] leading-relaxed text-zinc-800">
      <p>Hi {e.greetingName},</p>
      {e.lead.map((l) => (
        <p key={l} className="mt-3">{l}</p>
      ))}
      {e.quotes.map((q) => (
        <div key={q.label} className={`mt-3 border-l-2 pl-3 ${q.muted ? "border-zinc-200 text-zinc-500" : "border-zinc-300"}`}>
          <Md text={q.text} />
        </div>
      ))}
      {e.after.map((l) => (
        <p key={l} className="mt-3">{l}</p>
      ))}
      <p className="mt-4">
        <a href={e.cta.href} className="text-blue-700 underline">
          {e.cta.label} →
        </a>
      </p>
      <p className="mt-6">— Cadence</p>
      <p className="mt-8 border-t pt-3 text-[12px] text-zinc-500">
        {e.mandatory ? (
          <>{e.why} Emails about your refund requests can't be turned off.</>
        ) : (
          <>
            {e.why}{" "}
            <a className="underline" href="#unsubscribe">
              Turn off {e.kindLabel} emails
            </a>{" "}
            ·{" "}
            <a className="underline" href={PREFS_HREF}>
              All Notification Preferences
            </a>
          </>
        )}
      </p>
    </div>
  );
}

// ─── Variant B: Branded card ───
// Cadence header bar, eyebrow with the Notification kind, headline = the Feed
// title, quotes with the actor's name, one big button, a boxed footer.
function VariantB({ e }: { e: EmailCopy }) {
  return (
    <div className="bg-zinc-100 px-4 py-8 font-sans">
      <div className="mx-auto max-w-[600px]">
        <div className="flex items-center gap-2 px-2 pb-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-semibold text-zinc-900">Cadence</span>
        </div>
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <div className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">
            {e.kindLabel}
          </div>
          <h1 className="mt-2 text-[22px] leading-snug font-semibold text-zinc-900">{e.feedTitle}</h1>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-zinc-700">
            <p>Hi {e.greetingName},</p>
            {e.lead.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          {e.quotes.map((q) => (
            <div
              key={q.label}
              className={`mt-5 rounded-lg p-4 ${q.muted ? "bg-zinc-50 text-zinc-500" : "bg-indigo-50/60 text-zinc-800"}`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
                {q.author && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-indigo-200 text-[10px] font-bold text-indigo-800">
                    {q.author[0]}
                  </span>
                )}
                {q.author ?? q.label}
                {q.author && <span className="text-zinc-400">· {q.label}</span>}
              </div>
              <Md text={q.text} className="text-[14px] leading-relaxed" />
            </div>
          ))}
          {e.after.length > 0 && (
            <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-zinc-700">
              {e.after.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          )}
          <a
            href={e.cta.href}
            className="mt-7 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white"
          >
            {e.cta.label}
          </a>
        </div>
        <div className="mt-4 rounded-xl px-6 py-4 text-center text-[12px] leading-relaxed text-zinc-500">
          <p>{e.why}</p>
          {e.mandatory ? (
            <p className="mt-1">
              This is a required email about your money, so it can't be turned off.
            </p>
          ) : (
            <p className="mt-1">
              <a className="underline" href={PREFS_HREF}>
                Manage your Notification Preferences
              </a>{" "}
              to choose which emails Cadence sends you.
            </p>
          )}
          <p className="mt-3 text-zinc-400">Cadence · Replies to this email aren't read.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Variant C: Fact sheet ───
// Scannable first: one-line summary, a key/value table, then the quoted text
// below the fold, outline button. Footer splits "why" and "control".
function VariantC({ e }: { e: EmailCopy }) {
  return (
    <div className="mx-auto max-w-[600px] px-6 py-8 font-sans text-zinc-800">
      <div className="flex items-baseline justify-between border-b-2 border-zinc-900 pb-2">
        <span className="font-mono text-sm font-bold tracking-tight">CADENCE</span>
        <span className="text-xs text-zinc-500">{e.kindLabel}</span>
      </div>
      <p className="mt-5 text-[17px] leading-snug font-medium">{e.lead[0]}</p>
      <table className="mt-5 w-full border-collapse text-[14px]">
        <tbody>
          {e.facts.map(([k, v]) => (
            <tr key={k} className="border-b border-zinc-200">
              <td className="w-32 py-2 pr-4 align-top text-zinc-500">{k}</td>
              <td className="py-2 align-top">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {e.lead.slice(1).concat(e.after).map((l) => (
        <p key={l} className="mt-4 text-[14px] leading-relaxed text-zinc-700">{l}</p>
      ))}
      {e.quotes.map((q) => (
        <div key={q.label} className="mt-5">
          <div className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{q.label}</div>
          <Md
            text={q.text}
            className={`mt-1 text-[14px] leading-relaxed ${q.muted ? "text-zinc-500" : ""}`}
          />
        </div>
      ))}
      <a
        href={e.cta.href}
        className="mt-6 inline-block rounded border-2 border-zinc-900 px-4 py-2 text-sm font-semibold"
      >
        {e.cta.label}
      </a>
      <div className="mt-10 grid grid-cols-2 gap-4 border-t pt-4 text-[11px] leading-relaxed text-zinc-500">
        <div>
          <div className="font-semibold text-zinc-600">Why you got this</div>
          {e.why}
        </div>
        <div>
          <div className="font-semibold text-zinc-600">Your emails</div>
          {e.mandatory ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="size-3" /> Emails about your refund requests always reach you.
            </span>
          ) : (
            <a className="underline" href={PREFS_HREF}>
              Notification Preferences
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Variant D: B's header + C's facts table + C's footer ───
// Feedback round 1: B's branded header and card, C's key/value table, C's
// split footer (Notification Preferences link only; lock for mandatory).
// Refund decision notes are signed by the deciding Platform Admin.
function VariantD({ e }: { e: EmailCopy }) {
  return (
    <div className="bg-zinc-100 px-4 py-8 font-sans">
      <div className="mx-auto max-w-[600px]">
        <div className="flex items-center gap-2 px-2 pb-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-semibold text-zinc-900">Cadence</span>
        </div>
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <div className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">
            {e.kindLabel}
          </div>
          <h1 className="mt-2 text-[22px] leading-snug font-semibold text-zinc-900">{e.feedTitle}</h1>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-zinc-700">
            <p>Hi {e.greetingName},</p>
            {e.lead.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          <table className="mt-5 w-full border-collapse text-[14px]">
            <tbody>
              {e.facts.map(([k, v]) => (
                <tr key={k} className="border-b border-zinc-200">
                  <td className="w-36 py-2 pr-4 align-top text-zinc-500">{k}</td>
                  <td className="py-2 align-top text-zinc-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.quotes.map((q) => (
            <div
              key={q.label}
              className={`mt-5 rounded-lg p-4 ${q.muted ? "bg-zinc-50 text-zinc-500" : "bg-indigo-50/60 text-zinc-800"}`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
                {q.author && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-indigo-200 text-[10px] font-bold text-indigo-800">
                    {q.author[0]}
                  </span>
                )}
                {q.author ?? q.label}
                {q.author && <span className="text-zinc-400">· {q.label}</span>}
              </div>
              <Md text={q.text} className="text-[14px] leading-relaxed" />
            </div>
          ))}
          {e.after.length > 0 && (
            <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-zinc-700">
              {e.after.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          )}
          <a
            href={e.cta.href}
            className="mt-7 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white"
          >
            {e.cta.label}
          </a>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 px-6 text-[11px] leading-relaxed text-zinc-500">
          <div>
            <div className="font-semibold text-zinc-600">Why you got this</div>
            {e.why}
          </div>
          <div>
            <div className="font-semibold text-zinc-600">Your emails</div>
            {e.mandatory ? (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" /> Emails about your refund requests always reach you.
              </span>
            ) : (
              <a className="underline" href={PREFS_HREF}>
                Notification Preferences
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shell: fake inbox + switcher ───

const VARIANTS = [
  { key: "D", name: "B header + C facts", C: VariantD },
  { key: "A", name: "Plain note", C: VariantA },
  { key: "B", name: "Branded card", C: VariantB },
  { key: "C", name: "Fact sheet", C: VariantC },
] as const;

export function NotificationEmailsPrototype({ seed }: { seed: EmailSeed }) {
  const [params, setParams] = useSearchParams();
  const variant = VARIANTS.find((v) => v.key === params.get("variant")) ?? VARIANTS[0];
  const [opts, setOpts] = useState<Options>({ tzKnown: true, approvedNote: true, lastSeat: false });
  const emails = useMemo(() => buildEmails(seed, opts), [seed, opts]);
  const current = emails.find((e) => e.kind === params.get("email")) ?? emails[0];

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  return (
    <div className="flex h-screen bg-white text-zinc-900">
      <aside className="flex w-96 shrink-0 flex-col border-r bg-zinc-50">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">Inbox (prototype)</div>
          <div className="text-xs text-zinc-500">
            From: Cadence &lt;notifications@mail.&lt;cadence-domain&gt;&gt;
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {emails.map((e) => (
            <li key={e.kind}>
              <button
                onClick={() => set("email", e.kind)}
                className={`w-full border-b px-4 py-3 text-left ${e.kind === current.kind ? "bg-white ring-2 ring-indigo-500 ring-inset" : "hover:bg-white"}`}
              >
                <div className="flex justify-between text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-800">Cadence</span>
                  <span>to {e.to}</span>
                </div>
                <div className="mt-0.5 truncate text-sm font-medium">{e.subject}</div>
                <div className="truncate text-xs text-zinc-500">{e.preheader}</div>
                <div className="mt-1 flex gap-1 text-[10px]">
                  {e.mandatory && <span className="rounded bg-amber-100 px-1 text-amber-800">mandatory</span>}
                  {e.channelsUndecided && <span className="rounded bg-rose-100 px-1 text-rose-800">new · channels undecided</span>}
                  {e.defaultOff && <span className="rounded bg-zinc-200 px-1 text-zinc-700">off by default</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5 border-t p-4 text-xs">
          <div className="font-semibold text-zinc-600">Cases</div>
          <Toggle label="Recipient timezone known (else UTC)" on={opts.tzKnown} set={(v) => setOpts({ ...opts, tzKnown: v })} />
          <Toggle label="Approval has a decision note" on={opts.approvedNote} set={(v) => setOpts({ ...opts, approvedNote: v })} />
          <Toggle label="Seat claimed was the last Seat" on={opts.lastSeat} set={(v) => setOpts({ ...opts, lastSeat: v })} />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="border-b px-6 py-3 text-sm">
          <div className="font-semibold">{current.subject}</div>
          <div className="text-xs text-zinc-500">
            Cadence &lt;notifications@mail.&lt;cadence-domain&gt;&gt; · to {current.to}
          </div>
        </div>
        <variant.C e={current} />
      </main>
      <Switcher current={variant.key} onGo={(k) => set("variant", k)} />
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
}

function Switcher({ current, onGo }: { current: string; onGo: (k: string) => void }) {
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const go = (d: number) => onGo(VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-3 py-2 text-xs text-white shadow-2xl ring-1 ring-white/10">
      <span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-zinc-900">PROTOTYPE</span>
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 text-center font-medium">
        {VARIANTS[idx].key} ({VARIANTS[idx].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
