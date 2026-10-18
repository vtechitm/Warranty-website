import { requireActor } from "@/server/auth/session";
import { CodeEntry } from "./code-entry";

export const metadata = { title: "Kích hoạt bảo hành" };

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  await requireActor(["LAB_ADMIN", "LAB_STAFF"]);
  const { mode } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Kích hoạt bảo hành</h1>
      <p className="mt-1 text-sm text-muted">Quét QR trên thẻ bảo hành hoặc nhập mã thủ công.</p>
      <div className="mt-6">
        <CodeEntry initialMode={mode === "manual" ? "manual" : "scan"} />
      </div>
    </div>
  );
}
