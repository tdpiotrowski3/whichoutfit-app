import { describe, expect, it } from "vitest";
import { isNoSalesResponse } from "../appstore";

// Apple answers 404 for both a zero-sales day and a report that isn't out yet;
// only the first may be stored as zeros.
describe("isNoSalesResponse", () => {
  it("recognises Apple's no-sales 404", () => {
    const body = JSON.stringify({ errors: [{ status: "404", code: "NOT_FOUND", title: "The specified resource does not exist", detail: "There were no sales for the date specified." }] });
    expect(isNoSalesResponse(body)).toBe(true);
  });
  it("leaves a not-yet-published report alone", () => {
    const body = JSON.stringify({ errors: [{ status: "404", code: "NOT_FOUND", title: "The specified resource does not exist", detail: "Report is not available yet. Daily reports for the Americas are available by 5 am Pacific Time." }] });
    expect(isNoSalesResponse(body)).toBe(false);
    expect(isNoSalesResponse("")).toBe(false);
  });
});
