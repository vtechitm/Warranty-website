"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, Keyboard, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";
import { apiFetch, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

function extractCode(text: string) {
  const fromUrl = text.match(/\/w\/([A-Za-z0-9-]+)/);
  return (fromUrl ? fromUrl[1] : text).trim().toUpperCase().replace(/\s+/g, "");
}

export function CodeEntry({ initialMode }: { initialMode: "scan" | "manual" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(
    async (raw: string) => {
      const c = extractCode(raw);
      if (!c) return;
      setChecking(true);
      setError(null);
      try {
        await apiFetch(`/warranties/${encodeURIComponent(c)}/check`);
        router.push(`/lab/activate/${encodeURIComponent(c)}`);
      } catch (e) {
        setError({ message: (e as Error).message, reason: e instanceof ApiError ? e.reason : undefined });
        setChecking(false);
        if (e instanceof ApiError && e.reason === "ALREADY_ACTIVATED") setCode(c);
      }
    },
    [router],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 ring-1 ring-line">
        {(
          [
            ["scan", "Quét QR", QrCode],
            ["manual", "Nhập mã", Keyboard],
          ] as const
        ).map(([m, label, Icon]) => (
          <button key={m} onClick={() => { setMode(m); setError(null); }} className={cn("flex h-11 items-center justify-center gap-2 rounded-xl font-semibold", mode === m ? "bg-navy-900 text-white" : "text-muted")}>
            <Icon className="size-5" /> {label}
          </button>
        ))}
      </div>

      {error && (
        <Alert tone={error.reason === "ALREADY_ACTIVATED" ? "amber" : "red"}>
          <div className="font-semibold">{error.message}</div>
          {error.reason === "ALREADY_ACTIVATED" && code && (
            <a className="mt-1 inline-block underline" href={`/lab/warranties/${encodeURIComponent(code)}`}>Xem hồ sơ bảo hành</a>
          )}
        </Alert>
      )}

      {mode === "scan" ? (
        <Scanner onResult={check} paused={checking} />
      ) : (
        <form
          className="card space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            check(code);
          }}
        >
          <label className="block">
            <span className="label">Mã bảo hành</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ORG26-K8M4P2X9"
              className="field mono h-14 text-center text-xl font-bold uppercase"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              required
            />
          </label>
          <Button type="submit" size="xl" className="w-full" loading={checking}>KIỂM TRA MÃ</Button>
        </form>
      )}
    </div>
  );
}

function Scanner({ onResult, paused }: { onResult: (text: string) => void; paused: boolean }) {
  const id = "qr-reader";
  const scannerRef = useRef<{ stop: () => Promise<void>; isScanning: boolean } | null>(null);
  const [state, setState] = useState<"starting" | "running" | "error">("starting");
  const [message, setMessage] = useState<string | null>(null);
  const lastRef = useRef<string>("");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(id, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
          (text) => {
            if (pausedRef.current || text === lastRef.current) return;
            lastRef.current = text;
            if (navigator.vibrate) navigator.vibrate(60);
            onResult(text);
            setTimeout(() => (lastRef.current = ""), 3000);
          },
          () => {},
        );
        if (!cancelled) setState("running");
      } catch (e) {
        setState("error");
        setMessage(
          window.isSecureContext
            ? "Không mở được camera. Hãy cho phép trình duyệt truy cập camera hoặc dùng chế độ Nhập mã."
            : "Camera chỉ hoạt động trên kết nối HTTPS. Vui lòng dùng chế độ Nhập mã.",
        );
        console.warn(e);
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s?.isScanning) s.stop().catch(() => {});
    };
  }, [onResult]);

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-square w-full bg-navy-950">
        <div id={id} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
        {state !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            {state === "starting" ? <Camera className="size-10 animate-pulse" /> : <CameraOff className="size-10" />}
            <p className="text-sm">{state === "starting" ? "Đang mở camera…" : message}</p>
          </div>
        )}
        {paused && <div className="absolute inset-0 flex items-center justify-center bg-navy-950/70 text-white">Đang kiểm tra mã…</div>}
      </div>
      <p className="px-5 py-3 text-center text-sm text-muted">Đưa mã QR trên thẻ bảo hành vào khung hình</p>
    </div>
  );
}
