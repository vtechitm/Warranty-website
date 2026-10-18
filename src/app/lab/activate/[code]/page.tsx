import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { checkCodeForActivation } from "@/server/services/activation";
import { AppError } from "@/server/errors";
import { RESTORATION_TYPES } from "@/server/validation";
import { Button } from "@/components/ui/button";
import { ActivationForm } from "./activation-form";

export const metadata = { title: "Kích hoạt bảo hành" };

export default async function ActivateCodePage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor(["LAB_ADMIN", "LAB_STAFF"]);
  const { code } = await params;
  let checked;
  try {
    checked = await checkCodeForActivation(actor, decodeURIComponent(code));
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6 text-center">
          <AlertTriangle className="mx-auto size-10 text-amber-500" />
          <h1 className="mt-3 text-lg font-bold">Không thể kích hoạt mã này</h1>
          <p className="mono mt-1 text-sm text-muted">{decodeURIComponent(code).toUpperCase()}</p>
          <p className="mt-4 text-sm">{e.message}</p>
          <div className="mt-6 flex flex-col gap-2">
            {e.reason === "ALREADY_ACTIVATED" && (
              <Link href={`/lab/warranties/${encodeURIComponent(decodeURIComponent(code).toUpperCase())}`}><Button variant="outline" className="w-full">Xem hồ sơ bảo hành</Button></Link>
            )}
            <Link href="/lab/activate"><Button className="w-full">Quét / nhập mã khác</Button></Link>
          </div>
        </div>
      </div>
    );
  }
  return <ActivationForm checked={JSON.parse(JSON.stringify(checked))} restorationTypes={[...RESTORATION_TYPES]} />;
}
