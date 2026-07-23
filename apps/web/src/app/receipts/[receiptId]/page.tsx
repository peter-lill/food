import { notFound } from "next/navigation";
import { ReceiptReview } from "@/components/receipts/ReceiptReview";
import { getReceiptImport } from "@/lib/receipts/receipt.repository";

export const dynamic = "force-dynamic";

export default async function ReceiptReviewPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;

  try {
    const receipt = await getReceiptImport(receiptId);
    if (!receipt) notFound();
    return <ReceiptReview receipt={receipt} />;
  } catch (error) {
    console.error("Unable to load receipt review", error);
    return (
      <div className="card pantry-error" role="alert">
        <strong>Receipt review is unavailable.</strong>
        <p>Check the PostgreSQL connection and refresh this page.</p>
      </div>
    );
  }
}
