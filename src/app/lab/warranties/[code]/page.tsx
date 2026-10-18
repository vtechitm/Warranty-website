import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getWarrantyDetail } from "@/server/services/activation";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/misc";
import { WarrantyDetailView } from "@/components/warranty-detail";

export const metadata = { title: "Hồ sơ bảo hành" };

export default async function LabWarrantyDetail({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor(["LAB_ADMIN", "LAB_STAFF"]);
  const { code } = await params;
  let d;
  try {
    d = await getWarrantyDetail(actor, decodeURIComponent(code));
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  return (
    <div>
      <PageHeader title="Hồ sơ bảo hành" back={{ href: "/lab/warranties", label: "Lịch sử" }} />
      <WarrantyDetailView d={d} mode="lab" canCorrect={actor.role === "LAB_ADMIN"} />
    </div>
  );
}
