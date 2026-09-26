import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseGeminiReceipt } from "@/lib/gemini-receipt";

export const runtime = "nodejs";

const MODEL = "gemini-3.5-flash-lite";
const IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const schema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Merchant or restaurant name, or Receipt if unreadable" },
    total: { type: "string", description: "Final charged total in decimal major currency units; empty if unreadable" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Purchased item name" },
          amount: { type: "string", description: "Price for this line in decimal major currency units" },
        },
        required: ["name", "amount"],
      },
    },
  },
  required: ["title", "total", "items"],
};

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) return NextResponse.json({ error: "Gemini is not configured. Add GEMINI_API_KEY to the server environment." }, { status: 503 });
  if (!url || !publishableKey) return NextResponse.json({ error: "Group sign-in is not configured." }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 10_000_000) {
    return NextResponse.json({ error: "The receipt photo is too large." }, { status: 413 });
  }

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in to scan a receipt." }, { status: 401 });
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Your session expired. Reload and try again." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid receipt request." }, { status: 400 }); }
  const input = body as { groupId?: unknown; currency?: unknown; image?: unknown };
  if (!input || typeof input.groupId !== "string" || typeof input.currency !== "string" ||
      typeof input.image !== "string" || input.image.length > 9_000_000) {
    return NextResponse.json({ error: "Invalid receipt request." }, { status: 400 });
  }
  const match = input.image.match(IMAGE);
  if (!match || !/^[A-Z]{3}$/.test(input.currency)) {
    return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP receipt photo." }, { status: 400 });
  }
  const { data: group, error: groupError } = await supabase.from("cost_groups")
    .select("id").eq("id", input.groupId).maybeSingle();
  if (groupError || !group) return NextResponse.json({ error: "You cannot scan for this group." }, { status: 403 });

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const result = await ai.interactions.create({
      model: MODEL,
      store: false,
      input: [
        { type: "text", text: `Read this receipt for a shared expense. The expected currency is ${input.currency}. Return every purchased line item, including repeated items as separate lines. Use each line's charged price after any item-specific discount. Exclude subtotal, tax, tip, service charge, payment method, change, and general discounts from items. Put the final amount charged, including tax and tip, in total. Use plain decimal strings without currency symbols or thousands separators. Never invent unreadable names or prices; omit uncertain items and use an empty total when it cannot be read.` },
        { type: "image", data: match[2], mime_type: match[1] },
      ],
      response_format: { type: "text", mime_type: "application/json", schema },
    });
    if (!result.output_text) throw new Error("The scanner could not read this photo.");
    return NextResponse.json(parseGeminiReceipt(JSON.parse(result.output_text), input.currency));
  } catch (cause) {
    const status = typeof cause === "object" && cause && "status" in cause ? Number(cause.status) : 0;
    if (status === 429) return NextResponse.json({ error: "Gemini's free-tier limit was reached. Try again later or enter the items manually." }, { status: 429 });
    console.error("Receipt scan failed", cause);
    return NextResponse.json({ error: "Gemini could not read this receipt. You can enter the items manually." }, { status: 502 });
  }
}
