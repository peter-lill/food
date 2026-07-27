import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maximumImageBytes = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const nonProductLinePattern = new RegExp(
  [
    "\\b(?:eft|eftpos)\\b",
    "\\bcredit\\s+account\\b",
    "\\bdebit\\s+account\\b",
    "\\b(?:visa|mastercard|amex|american express)\\b",
    "\\b(?:nab|anz|westpac|commbank|commonwealth bank)\\b",
    "\\b(?:approved|declined)\\b",
    "\\b(?:auth|rrn|apsn|atc)\\b",
    "\\ba0{4,}\\d+\\b",
    "\\bcard\\s*(?:no|number)\\b",
    "\\bscanned\\s+card\\b",
    "\\bgst(?:\\s+included)?\\b",
    "\\b(?:tax invoice|abn)\\b",
    "\\b(?:store manager|served by|register|receipt)\\b",
    "\\b(?:total savings|savings|subtotal|change|cash out)\\b",
    "\\b(?:flybuys|everyday rewards|loyalty)\\b",
    "\\bno pin or signature required\\b",
  ].join("|"),
  "i",
);

type ReceiptExtraction = {
  retailer: string | null;
  purchasedAt: string | null;
  total: number | null;
  lines: Array<{
    description: string;
    quantity: number | null;
    price: number | null;
  }>;
};

function isReceiptExtraction(value: unknown): value is ReceiptExtraction {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<ReceiptExtraction>;
  if (!Array.isArray(receipt.lines)) return false;
  return receipt.lines.every((line) => {
    if (!line || typeof line !== "object") return false;
    const item = line as ReceiptExtraction["lines"][number];
    return typeof item.description === "string"
      && (item.quantity === null || typeof item.quantity === "number")
      && (item.price === null || typeof item.price === "number");
  });
}

function normaliseDescription(value: string) {
  return value
    .replace(/^[*%#•\-\s]+/, "")
    .replace(/^d\w{5,12}tion\b\s*/i, "")
    .replace(/^(?:[A-Z]\s+){1,4}(?=[A-Z]{3,})/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function looksLikeProduct(description: string) {
  if (description.length < 2 || nonProductLinePattern.test(description)) return false;
  if (/^[\d\s*#./:-]+$/.test(description)) return false;
  return /[a-z]/i.test(description);
}

function cleanReceipt(receipt: ReceiptExtraction): ReceiptExtraction {
  const retailer = typeof receipt.retailer === "string" ? receipt.retailer.trim().slice(0, 100) : null;
  const purchasedAt = typeof receipt.purchasedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(receipt.purchasedAt)
    ? receipt.purchasedAt
    : null;
  let total = typeof receipt.total === "number" && Number.isFinite(receipt.total) && receipt.total >= 0
    ? Number(receipt.total.toFixed(2))
    : null;

  const lines = receipt.lines
    .map((line) => ({
      description: normaliseDescription(line.description),
      quantity: typeof line.quantity === "number" && Number.isFinite(line.quantity) && line.quantity > 0
        ? line.quantity
        : 1,
      price: typeof line.price === "number" && Number.isFinite(line.price) && line.price >= 0
        ? Number(line.price.toFixed(2))
        : null,
    }))
    .filter((line) => looksLikeProduct(line.description))
    .slice(0, 100);

  const highestLinePrice = lines.reduce<number | null>((highest, line) => {
    if (line.price === null) return highest;
    return highest === null || line.price > highest ? line.price : highest;
  }, null);

  // GST is often printed immediately beneath the final total and can be mistaken
  // for the total. A receipt total cannot be lower than an individual line price.
  if (highestLinePrice !== null && (total === null || total < highestLinePrice)) {
    total = highestLinePrice;
  }

  // A one-product receipt must reconcile to its final total. This also corrects
  // payment-terminal amounts accidentally read as the product price.
  if (lines.length === 1 && total !== null) {
    lines[0] = { ...lines[0], quantity: lines[0].quantity || 1, price: total };
  }

  return {
    retailer: retailer || null,
    purchasedAt,
    total,
    lines,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Receipt scanning is not configured. Add OPENAI_API_KEY to apps/web/.env and restart the app." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "The receipt image could not be uploaded." }, { status: 400 });
  }

  const receiptFile = formData.get("receipt");
  if (!(receiptFile instanceof File)) {
    return NextResponse.json({ error: "Choose a receipt image first." }, { status: 400 });
  }

  if (!allowedImageTypes.has(receiptFile.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG, HEIC or WebP receipt image." }, { status: 415 });
  }

  if (receiptFile.size === 0 || receiptFile.size > maximumImageBytes) {
    return NextResponse.json({ error: "Receipt images must be smaller than 10 MB." }, { status: 413 });
  }

  const imageData = Buffer.from(await receiptFile.arrayBuffer()).toString("base64");
  const imageUrl = `data:${receiptFile.type};base64,${imageData}`;

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_RECEIPT_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Extract this Australian retail receipt into structured data.

PRODUCT BOUNDARY RULES:
- Purchased products normally appear beneath a heading such as DESCRIPTION, ITEM or PRODUCT.
- Read only actual merchandise lines from that product area.
- Stop before TOTAL, EFT, PAYMENT, CREDIT ACCOUNT, DEBIT ACCOUNT, GST INCLUDED or card-terminal details.
- Never return bank, card or payment lines as products.

ALWAYS IGNORE:
EFT/EFTPOS, VISA, MASTERCARD, NAB, ANZ, WESTPAC, COMMBANK, CREDIT ACCOUNT, DEBIT ACCOUNT, APPROVED, AUTH, RRN, APSN, ATC, card numbers, GST, ABN, receipt/register/store details, subtotal, savings, loyalty text and promotional messages.

FIELDS:
- retailer: trading retailer name only, for example Coles, Woolworths or ALDI.
- purchasedAt: YYYY-MM-DD.
- total: the FINAL AMOUNT PAID, not GST. On a receipt showing both "Total $4.50" and "GST $0.41", total is 4.50.
- lines: purchased merchandise only. Preserve useful product wording, remove leading receipt markers such as * or %, use quantity 1 when no quantity is shown, and return the final line price.
- Check that the product prices are plausible against the receipt total.
- Do not invent unreadable values. Return an empty lines array rather than returning payment information.`,
            },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "receipt_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                retailer: { type: ["string", "null"] },
                purchasedAt: { type: ["string", "null"] },
                total: { type: ["number", "null"] },
                lines: {
                  type: "array",
                  maxItems: 100,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      description: { type: "string" },
                      quantity: { type: ["number", "null"] },
                      price: { type: ["number", "null"] },
                    },
                    required: ["description", "quantity", "price"],
                  },
                },
              },
              required: ["retailer", "purchasedAt", "total", "lines"],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!openAiResponse.ok) {
      const errorBody = await openAiResponse.text();
      console.error("OpenAI receipt extraction failed", openAiResponse.status, errorBody.slice(0, 1000));
      return NextResponse.json({ error: "The receipt could not be read. Try a clearer, well-lit photo." }, { status: 502 });
    }

    const response = await openAiResponse.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const outputText = response.output_text
      ?? response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;

    if (!outputText) {
      return NextResponse.json({ error: "No receipt text was detected. Try a closer photo." }, { status: 422 });
    }

    const parsed: unknown = JSON.parse(outputText);
    if (!isReceiptExtraction(parsed)) {
      throw new Error("Receipt extraction returned an invalid shape.");
    }

    const receipt = cleanReceipt(parsed);
    if (receipt.lines.length === 0) {
      return NextResponse.json(
        { error: "No purchased products were detected. Retake the photo with the Description and Total sections visible." },
        { status: 422 },
      );
    }

    return NextResponse.json({ receipt });
  } catch (error) {
    console.error("Unable to extract receipt", error);
    return NextResponse.json({ error: "The receipt could not be read. Try again or enter it manually." }, { status: 500 });
  }
}
