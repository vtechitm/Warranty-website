"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarCheck, Download, ExternalLink, Pause, Pencil, Play, QrCode, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Field, Input, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

type Current = { patientName: string; patientPhone: string; clinicName: string; dentistName: string; notes: string };

export function WarrantyActions(props: {
  code: string;
  mode: "admin" | "lab";
  canCorrect: boolean;
  activated: boolean;
  revoked: boolean;
  suspended: boolean;
  pendingInstallation: boolean;
  current: Current | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "install" | "correct" | "revoke" | "reinstate" | "suspend">(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const enc = encodeURIComponent(props.code);

  async function run(path: string, body: unknown) {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/warranties/${enc}/${path}`, { body });
      setDialog(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const form = (path: string, build: (f: FormData) => unknown) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(path, build(new FormData(e.currentTarget)));
  };
  const close = () => { setDialog(null); setError(null); };

  return (
    <div className="flex flex-wrap gap-2">
      {props.activated && !props.revoked && (
        <a href={`/api/v1/warranties/${enc}/certificate`} target="_blank"><Button><Download /> Chứng nhận PDF</Button></a>
      )}
      <a href={`/w/${enc}`} target="_blank"><Button variant="outline"><ExternalLink /> Trang công khai</Button></a>
      {props.mode === "admin" && (
        <>
          <a href={`/api/v1/warranties/${enc}/qr?format=png&size=1200`}><Button variant="outline"><QrCode /> PNG</Button></a>
          <a href={`/api/v1/warranties/${enc}/qr?format=svg`}><Button variant="outline"><QrCode /> SVG</Button></a>
        </>
      )}
      {props.pendingInstallation && !props.revoked && <Button variant="gold" onClick={() => setDialog("install")}><CalendarCheck /> Xác nhận ngày lắp</Button>}
      {props.canCorrect && !props.revoked && <Button variant="outline" onClick={() => setDialog("correct")}><Pencil /> Điều chỉnh</Button>}
      {props.mode === "admin" && props.activated && !props.revoked && (
        <Button variant="outline" onClick={() => setDialog("suspend")}>{props.suspended ? <><Play /> Mở lại</> : <><Pause /> Tạm ngưng</>}</Button>
      )}
      {props.mode === "admin" && (props.revoked
        ? <Button variant="outline" onClick={() => setDialog("reinstate")}><RotateCcw /> Khôi phục</Button>
        : <Button variant="danger" onClick={() => setDialog("revoke")}><Ban /> Thu hồi</Button>)}

      <Dialog open={dialog === "install"} onClose={close} title="Xác nhận ngày lắp" description="Thời hạn bảo hành sẽ được tính từ ngày này theo chính sách đã lưu khi kích hoạt.">
        <form className="space-y-4" onSubmit={form("confirm-installation", (f) => ({ installationDate: f.get("date") }))}>
          {error && <Alert>{error}</Alert>}
          <Field label="Ngày lắp cho bệnh nhân"><Input type="date" name="date" required max={new Date().toISOString().slice(0, 10)} /></Field>
          <Button type="submit" className="w-full" loading={loading}>Xác nhận</Button>
        </form>
      </Dialog>

      <Dialog open={dialog === "correct"} onClose={close} title="Điều chỉnh hồ sơ" description="Mọi thay đổi được ghi vào nhật ký kiểm toán kèm lý do." wide>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form("correct", (f) => {
            const body: Record<string, unknown> = { reason: f.get("reason") };
            for (const k of ["patientName", "patientPhone", "clinicName", "dentistName", "notes"] as const) {
              const v = String(f.get(k) ?? "");
              if (props.current && v !== props.current[k]) body[k] = k === "patientName" ? v : v || null;
            }
            const date = String(f.get("installationDate") ?? "");
            if (date) body.installationDate = date;
            return body;
          })}
        >
          {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
          {props.current?.patientName !== undefined && props.current.patientName !== "" && (
            <>
              <Field label="Họ tên bệnh nhân"><Input name="patientName" defaultValue={props.current.patientName} required /></Field>
              <Field label="SĐT bệnh nhân"><Input name="patientPhone" defaultValue={props.current.patientPhone} /></Field>
            </>
          )}
          <Field label="Phòng khám"><Input name="clinicName" defaultValue={props.current?.clinicName} /></Field>
          <Field label="Bác sĩ"><Input name="dentistName" defaultValue={props.current?.dentistName} /></Field>
          <Field label="Sửa ngày lắp" hint="Để trống nếu không đổi"><Input type="date" name="installationDate" /></Field>
          <Field label="Ghi chú"><Input name="notes" defaultValue={props.current?.notes} /></Field>
          <Field label="Lý do điều chỉnh *" className="sm:col-span-2"><Textarea name="reason" required minLength={3} rows={2} className="min-h-0" /></Field>
          <Button type="submit" className="sm:col-span-2" loading={loading}>Lưu điều chỉnh</Button>
        </form>
      </Dialog>

      <Dialog open={dialog === "revoke"} onClose={close} title="Thu hồi mã bảo hành" description="Trang QR sẽ hiển thị cảnh báo thu hồi. Mã không thể kích hoạt cho đến khi được khôi phục.">
        <form className="space-y-4" onSubmit={form("revoke", (f) => ({ reason: f.get("reason") }))}>
          {error && <Alert>{error}</Alert>}
          <Field label="Lý do *"><Textarea name="reason" required minLength={3} rows={3} /></Field>
          <Button type="submit" variant="danger" className="w-full" loading={loading}>Thu hồi</Button>
        </form>
      </Dialog>

      <Dialog open={dialog === "reinstate"} onClose={close} title="Khôi phục mã">
        <form className="space-y-4" onSubmit={form("reinstate", (f) => ({ reason: f.get("reason") }))}>
          {error && <Alert>{error}</Alert>}
          <Field label="Ghi chú khôi phục *"><Textarea name="reason" required minLength={3} rows={3} /></Field>
          <Button type="submit" className="w-full" loading={loading}>Khôi phục</Button>
        </form>
      </Dialog>

      <Dialog open={dialog === "suspend"} onClose={close} title={props.suspended ? "Mở lại bảo hành" : "Tạm ngưng bảo hành"}>
        <form className="space-y-4" onSubmit={form("suspend", (f) => ({ suspended: !props.suspended, reason: f.get("reason") }))}>
          {error && <Alert>{error}</Alert>}
          <Field label="Lý do *"><Textarea name="reason" required minLength={3} rows={3} /></Field>
          <Button type="submit" className="w-full" loading={loading}>Xác nhận</Button>
        </form>
      </Dialog>
    </div>
  );
}
