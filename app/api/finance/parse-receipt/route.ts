import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { parseReceiptFile } from "@/lib/receiptParser";
import { isRoiCost } from "@/lib/finance";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Drop a receipt" autofill: accepts one receipt file (PDF/image), runs Gemini
// extraction, and returns the suggested expense fields for the admin to review
// before saving. Does NOT write to the DB — the review + save happens through
// /api/finance/add (which also uploads the file to the receipts bucket).
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No receipt file provided." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Receipt file must be under 10 MB." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const x = await parseReceiptFile(bytes, file.type || "application/octet-stream");
    return NextResponse.json({
      ok: true,
      extracted: {
        ...x,
        roi_impacting: isRoiCost(x.vendor, x.category, x.description),
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Extraction failed" }, { status: 500 });
  }
}
