// Script eval: run the real writer and critic over a fixed set of clips for
// both brands and print what would reach the Studio, so a prompt or example
// change can be judged by reading the scripts.
//
//   GEMINI_API_KEY=... npx tsx scripts/script-eval.ts
//   GEMINI_API_KEY=... npx tsx scripts/script-eval.ts --only trip      (clips whose name contains "trip")
//   GEMINI_API_KEY=... npx tsx scripts/script-eval.ts --drafts         (also print every draft the writer offered)
//   GEMINI_API_KEY=... npx tsx scripts/script-eval.ts --json > out.json
//
// No database: nothing is read from or written to Supabase, and nothing is
// saved anywhere. The key is read from the environment only. Each run makes
// about 14 model calls (a writer and a critic call per WhichOutfit clip, one of
// each for Comeback).

import { writeIdeas, templateBrief } from "../lib/contentEngine/writer";
import { getTemplate, countSyllables, speechSeconds, CTA_LINE } from "../lib/contentEngine/templates";
import { lintSpoken, meanScore, type Scores, type ScriptCase } from "../lib/contentEngine/scriptRules";
import { llmProvider } from "../lib/contentEngine/llm";
import { PLAYBOOKS } from "../lib/contentEngine/strategy";
import { getSlot, seriesSlotKey, slotBrief, ctaFor } from "../lib/comeback/runway";
import { settle, writePieces, openingsFor } from "../lib/comeback/writer";

type Result = {
  name: string;
  brand: "whichoutfit" | "comeback";
  footage: number;
  cta: string;
  drafts: { hook?: string; lines: string[]; lint: string[] }[];
  final: { lines: string[]; direction: string; hook: string; scores: Scores | null; note: string; edited: boolean; reviewed: boolean } | null;
  dropped: string[];
};

const WHICHOUTFIT: { template: string; inputs: Record<string, string>; closet: string; about: string }[] = [
  { template: "recut:01_rate_outfit", inputs: {}, closet: "original", about: "" },
  { template: "recut:08_closet_insights", inputs: {}, closet: "original", about: "" },
  { template: "recut:12_scan_item", inputs: {}, closet: "original", about: "" },
  { template: "flow:trip_packing", inputs: { city: "Aspen, CO" }, closet: "menswear", about: "A lived-in menswear closet with a ski jacket and pants, base layers, beanie, gloves and flannel pajamas." },
  { template: "flow:dress_for_event", inputs: { occasion: "office holiday party" }, closet: "polished", about: "Polished workwear: a tailored blazer, silk blouse, midi skirt, wrap dress, a satin slip dress and gold heels." },
  { template: "flow:no_closet", inputs: {}, closet: "fresh", about: "A brand-new account whose closet hasn't been added yet; looks are built from suggested pieces with real product photos." },
];

const COMEBACK: [string, string][] = [["week_one_back", "the_trap"], ["scratch_day_n", "day_1"], ["push_steady_easy", "bad_night"]];

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const only = args.includes("--only") ? (args[args.indexOf("--only") + 1] ?? "").toLowerCase() : "";

function draftsOf(sc: ScriptCase | undefined): Result["drafts"] {
  return (sc?.candidates ?? []).map((c) => ({ hook: c.hook, lines: c.voiceover, lint: lintSpoken(c.voiceover, sc!.brand) }));
}

async function whichoutfit(): Promise<Result[]> {
  const out: Result[] = [];
  for (const c of WHICHOUTFIT.filter((x) => x.template.toLowerCase().includes(only))) {
    const t = getTemplate(c.template)!;
    const inputs = Object.entries(c.inputs).map(([k, v]) => `${k} = "${v}"`).join(", ");
    const prompt = `Draft exactly 1 clip idea, for this request from the owner.\nTemplate: ${t.key}${inputs ? `\nInputs (use exactly these): ${inputs}` : ""}\nCloset: ${c.closet}${c.about ? ` — ${c.about}` : ""}\n\nTEMPLATE:\n${templateBrief(t)}`;
    const res: Result = { name: `${t.key}${inputs ? ` (${Object.values(c.inputs).join(", ")})` : ""}`, brand: "whichoutfit", footage: t.beats[t.beats.length - 1].end - t.beats[0].start, cta: CTA_LINE, drafts: [], final: null, dropped: [] };
    try {
      const r = await writeIdeas(prompt, [c.closet, "original"], {
        pin: (raw) => { raw.template = t.key; raw.closet = c.closet; raw.inputs = Object.entries(c.inputs).map(([name, value]) => ({ name, value })); },
      });
      res.drafts = draftsOf(r.cases[0]);
      res.dropped = r.dropped;
      const w = r.written[0];
      if (w) res.final = { lines: w.fields.voiceover, direction: w.fields.inputs._direction ?? "", hook: w.fields.inputs._hook ?? "", scores: w.scores, note: w.note, edited: w.edited, reviewed: w.reviewed };
    } catch (e) {
      res.dropped = [`call failed: ${e instanceof Error ? e.message : String(e)}`];
    }
    out.push(res);
    progress(res);
  }
  return out;
}

async function comeback(): Promise<Result[]> {
  const keys = COMEBACK.map(([s, e]) => seriesSlotKey(s, e)).filter((k) => k.toLowerCase().includes(only));
  if (!keys.length) return [];
  const results = new Map<string, Result>(
    keys.map((k) => {
      const slot = getSlot(k)!;
      return [k, { name: k, brand: "comeback" as const, footage: (slot.beats ?? []).reduce((a, b) => a + b, 0), cta: ctaFor(slot.phase), drafts: [], final: null, dropped: [] }];
    })
  );
  const prompt = `Now writing: episodes of Comeback's always-on series. Set "slot" to the key given.\n\nSLOTS TO WRITE:\n${keys.map((k) => slotBrief(getSlot(k)!)).join("\n\n")}${openingsFor(keys)}`;
  try {
    const r = await writePieces(prompt);
    const { rows, misses, cases, room } = await settle(r.pieces ?? [], (k) => results.has(k));
    for (const sc of cases) results.get(sc.id)!.drafts = draftsOf(sc);
    for (const m of misses) results.get(m.split(": ")[0])?.dropped.push(m);
    for (const v of rows) {
      const k = v.template.slice(3);
      const pick = room?.chosen.get(k);
      results.get(k)!.final = { lines: v.voiceover, direction: v.inputs._direction ?? "", hook: v.inputs._hook ?? "", scores: pick?.scores ?? null, note: pick?.note ?? "", edited: !!pick?.edited, reviewed: !!room?.reviewed };
    }
  } catch (e) {
    for (const res of results.values()) res.dropped = [`call failed: ${e instanceof Error ? e.message : String(e)}`];
  }
  for (const res of results.values()) progress(res);
  return [...results.values()];
}

const say = (s = "") => process.stdout.write(`${s}\n`);
const secs = (lines: string[]) => lines.reduce((a, l) => a + speechSeconds(l), 0);

function progress(r: Result) {
  if (flag("--json")) return;
  say(`\n${"=".repeat(78)}\n${r.brand.toUpperCase()}  ${r.name}`);
  if (flag("--drafts") || !r.final) {
    r.drafts.forEach((d, i) => {
      say(`  draft ${i + 1}${d.hook ? ` [${d.hook}]` : ""}${d.lint.length ? `  LINT: ${d.lint.join("; ")}` : ""}`);
      d.lines.forEach((l) => say(`      ${l}`));
    });
  } else {
    const hit = r.drafts.filter((d) => d.lint.length);
    say(`  drafts: ${r.drafts.length} written, ${hit.length} stopped by the lint${hit.length ? ` (${hit.map((d) => d.lint[0]).join("; ")})` : ""}`);
  }
  if (!r.final) return say(`  DROPPED — nothing would reach the Studio: ${r.dropped.join(" | ") || "no reason given"}`);
  const f = r.final;
  say(`  FINAL${f.edited ? " (tightened by the critic)" : ""}${f.reviewed ? "" : " (NOT reviewed: critic unavailable)"}  hook: ${f.hook || "?"}`);
  f.lines.forEach((l, i) => say(`    ${i + 1}. ${l}   (${countSyllables(l)} syl)`));
  say(`  direction: ${f.direction || "(none)"}`);
  if (f.scores) say(`  critic: spoken ${f.scores.spoken} · hook ${f.scores.hook} · sync ${f.scores.sync} · specific ${f.scores.specific} · payoff ${f.scores.payoff} · brand ${f.scores.brand}  → ${meanScore(f.scores).toFixed(1)}/5`);
  if (f.note) say(`  critic's note: ${f.note}`);
  const lint = lintSpoken(f.lines, r.brand);
  say(`  lint on final: ${lint.length ? lint.join("; ") : "clean"}`);
  const spoken = secs(f.lines), withCta = spoken + speechSeconds(r.cta);
  say(`  speech: ${spoken.toFixed(1)}s script, ${withCta.toFixed(1)}s with the end card, over ${r.footage.toFixed(1)}s of footage (${Math.round((spoken / r.footage) * 100)}% of it)`);
}

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim() && !process.env.ANTHROPIC_API_KEY?.trim()) {
    process.stderr.write("Set GEMINI_API_KEY in the environment first:\n  GEMINI_API_KEY=... npx tsx scripts/script-eval.ts\n");
    process.exit(1);
  }
  const p = llmProvider();
  if (!flag("--json")) say(`Script eval — writer and critic on ${p.provider} (${p.model}); ${PLAYBOOKS.whichoutfit.hooks.length} hook archetypes; no database.`);
  const results = [...(await whichoutfit()), ...(await comeback())];
  if (flag("--json")) return say(JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.final);
  const scored = passed.filter((r) => r.final!.scores);
  const avg = (k: keyof Scores) => (scored.reduce((a, r) => a + r.final!.scores![k], 0) / Math.max(1, scored.length)).toFixed(1);
  say(`\n${"=".repeat(78)}\n${passed.length} of ${results.length} clips produced a script that would reach the Studio.`);
  if (scored.length) say(`Critic averages — spoken ${avg("spoken")}, hook ${avg("hook")}, sync ${avg("sync")}, specific ${avg("specific")}, payoff ${avg("payoff")}, brand ${avg("brand")}.`);
  const stopped = results.reduce((a, r) => a + r.drafts.filter((d) => d.lint.length).length, 0);
  const total = results.reduce((a, r) => a + r.drafts.length, 0);
  say(`Lint stopped ${stopped} of ${total} drafts before the critic. Read the scripts aloud: the scores are a guide, your ear is the test.`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
