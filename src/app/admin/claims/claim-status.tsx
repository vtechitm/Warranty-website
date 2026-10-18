"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CLAIM_STATUS_LABEL } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";

const NEXT: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED"],
  ADDITIONAL_INFO_REQUIRED: ["UNDER_REVIEW", "REJECTED"],
  APPROVED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
};

export function ClaimStatusControl({ claimId, status }: { claimId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = NEXT[status] ?? [];
  if (!options.length) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {options.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === "REJECTED" ? "outline" : s === "APPROVED" || s === "COMPLETED" ? "primary" : "outline"}
            loading={loading === s}
            onClick={async () => {
              const note = s === "REJECTED" || s === "ADDITIONAL_INFO_REQUIRED" ? prompt("Ghi chú / lý do:") : null;
              if ((s === "REJECTED" || s === "ADDITIONAL_INFO_REQUIRED") && !note) return;
              setLoading(s);
              setError(null);
              try {
                await apiFetch(`/claims/${claimId}/status`, { body: { status: s, note } });
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setLoading(null);
              }
            }}
          >
            {CLAIM_STATUS_LABEL[s]}
          </Button>
        ))}
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
