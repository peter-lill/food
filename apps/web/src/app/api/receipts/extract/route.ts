import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maximumImageBytes = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

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

function cleanReceipt(receipt: ReceiptExtraction): ReceiptExtraction {
  const retailer = typeof receipt.retailer === "string" ? receipt.retailer.trim().slice(0, 100) : null;
  const purchasedAt = typeof receipt.purchasedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(receipt.purchasedAt)
    ? receipt.purchasedAt
    : null;
  const total = typeof receipt.total === "number" && Number.isFinite(receipt.total) && receipt.total >= 0
    ? receipt.total
    : null;

  return {
    retailer: retailer || null,
    purchasedAt,
    total,
    lines: receipt.lines
      .map((line) => ({
        description: line.description.replace(/\s+/g, " ").trim().slice(0, 300),
        quantity: typeof line.quantity === "number" && Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : null,
        price: typeof line.price === "number" && Number.isFinite(line.price) && line.price >= 0 ? line.price : null,
      }))
      .filter((line) => line.description.length > 0)
      .slice(0, 100),
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
              text: "Read this Australian retail receipt. Extract the retailer, purchase date, final total, and purchased product lines. Exclude headers, addresses, ABNs, payment details, subtotal, GST, savings, discounts as standalone lines, loyalty messages, and change. Keep discounts reflected in the relevant line price where clear. Use YYYY-MM-DD for the date. For each product return its plain description, quantity when visible (otherwise 1), and the final line price in AUD when visible. Do not invent unreadable values.",
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
      return NextResponse.json({ error: "No product lines were detected. Try a clearer or closer photo." }, { status: 422 });
    }

    return NextResponse.json({ receipt });
  } catch (error) {
    console.error("Unable to extract receipt", error);
    return NextResponse.json({ error: "The receipt could not be read. Try again or enter it manually." }, { status: 500 });
  }
}
