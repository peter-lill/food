import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [products, knowledgeRecords, queuedJobs] = await Promise.all([
      prisma.product.count(),
      prisma.foodKnowledge.count(),
      prisma.productEnrichmentJob.count({
        where: {
          status: {
            in: ["QUEUED", "RUNNING", "RETRY_SCHEDULED"],
          },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      service: "product-intelligence",
      products,
      knowledgeRecords,
      activeJobs: queuedJobs,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Product Intelligence health check failed", error);
    return NextResponse.json(
      {
        ok: false,
        service: "product-intelligence",
        error: "Product Intelligence is not ready. Check the deployed migration and database connection.",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
