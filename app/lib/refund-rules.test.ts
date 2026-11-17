import { describe, it, expect } from "vitest";
import { RefundStatus } from "~/db/schema";
import { alreadyDecidedNotice } from "./refund-rules";

const onDay = (iso: string) => iso.slice(0, 10);

describe("the notice on a Refund Request someone already decided", () => {
  it("names who approved it and when", () => {
    expect(
      alreadyDecidedNotice(
        {
          status: RefundStatus.Approved,
          decidedByName: "Sam Admin",
          resolvedAt: "2026-11-16T09:30:00.000Z",
        },
        onDay
      )
    ).toBe("Already approved by Sam Admin on 2026-11-16");
  });

  it("names who declined it and when", () => {
    expect(
      alreadyDecidedNotice(
        {
          status: RefundStatus.Declined,
          decidedByName: "Pat Admin",
          resolvedAt: "2026-11-15T12:00:00.000Z",
        },
        onDay
      )
    ).toBe("Already declined by Pat Admin on 2026-11-15");
  });

  it("has nothing to say about an Open Refund Request", () => {
    expect(
      alreadyDecidedNotice(
        { status: RefundStatus.Open, decidedByName: null, resolvedAt: null },
        onDay
      )
    ).toBeNull();
  });
});
