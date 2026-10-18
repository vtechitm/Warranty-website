"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { InviteLink } from "@/components/staff-manager";
import { apiFetch } from "@/lib/api-client";

export function UserRowActions({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <div className="flex justify-end gap-1">
      {status === "INVITED" && (
        <Button size="sm" variant="ghost" onClick={() => run(async () => setInvite((await apiFetch<{ path: string }>(`/users/${userId}/invitation`, { method: "POST" })).path))}>Link mời</Button>
      )}
      {status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => run(() => apiFetch(`/users/${userId}/status`, { body: { status: "SUSPENDED" } }))}>Khoá</Button>}
      {status === "SUSPENDED" && <Button size="sm" variant="ghost" onClick={() => run(() => apiFetch(`/users/${userId}/status`, { body: { status: "ACTIVE" } }))}>Mở khoá</Button>}
      <Dialog open={!!invite} onClose={() => setInvite(null)} title="Liên kết mời mới">{invite && <InviteLink path={invite} />}</Dialog>
    </div>
  );
}
