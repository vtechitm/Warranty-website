"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { InviteLink } from "@/components/staff-manager";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "color" | "url" | "textarea" | "select" | "checkbox" | "checkboxes";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string | number | boolean | string[];
  options?: { value: string; label: string }[];
  full?: boolean;
  min?: number;
  max?: number;
};

type Values = Record<string, unknown>;

/** Reads the form into a body. Dotted names ("admin.email") become nested objects; empty optional values are omitted. */
function collect(form: HTMLFormElement, fields: FieldSpec[], keepNulls: boolean): Values {
  const fd = new FormData(form);
  const out: Values = {};
  const put = (path: string, value: unknown) => {
    const keys = path.split(".");
    let o = out as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[keys.at(-1)!] = value;
  };
  for (const f of fields) {
    let v: unknown;
    if (f.type === "checkboxes") v = fd.getAll(f.name).map(String);
    else if (f.type === "checkbox") v = fd.get(f.name) === "on";
    else {
      const raw = String(fd.get(f.name) ?? "").trim();
      v = raw === "" ? null : f.type === "number" ? Number(raw) : raw;
    }
    if (v === null && !keepNulls) continue;
    put(f.name, v);
  }
  return out;
}

function getPath(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);
}

export function FormDialog({
  trigger,
  triggerVariant = "primary",
  triggerSize,
  title,
  description,
  fields,
  endpoint,
  method = "POST",
  extraBody,
  keepNulls = false,
  submitLabel = "Lưu",
  wide,
  invitePath,
  redirectTemplate,
}: {
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  title: string;
  description?: string;
  fields: FieldSpec[];
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT";
  /** Static values merged into the body. */
  extraBody?: Values;
  /** Send empty fields as null (edit forms that may clear values). */
  keepNulls?: boolean;
  submitLabel?: string;
  wide?: boolean;
  /** Dot path in the response holding an invitation path to display (e.g. "invitation.path"). */
  invitePath?: string;
  /** Navigate after success, "{id}" is replaced by data.id. */
  redirectTemplate?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
    setInvite(null);
  };

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>{trigger}</Button>
      <Dialog open={open} onClose={close} title={title} description={description} wide={wide}>
        {invite ? (
          <div className="space-y-4">
            <InviteLink path={invite} />
            <Button className="w-full" onClick={close}>Xong</Button>
          </div>
        ) : (
          <form
            className={cn("grid gap-4", wide && "sm:grid-cols-2")}
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              try {
                const data = await apiFetch(endpoint, { method, body: { ...collect(e.currentTarget, fields, keepNulls), ...extraBody } });
                if (redirectTemplate) {
                  router.push(redirectTemplate.replace("{id}", String(getPath(data, "id") ?? "")));
                  return;
                }
                router.refresh();
                const link = invitePath ? getPath(data, invitePath) : null;
                if (typeof link === "string") setInvite(link);
                else close();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {error && <div className={cn(wide && "sm:col-span-2")}><Alert>{error}</Alert></div>}
            {fields.map((f) => (
              <FieldInput key={f.name} f={f} wide={wide} />
            ))}
            <Button type="submit" className={cn(wide && "sm:col-span-2")} loading={loading}>{submitLabel}</Button>
          </form>
        )}
      </Dialog>
    </>
  );
}

function FieldInput({ f, wide }: { f: FieldSpec; wide?: boolean }) {
  const span = cn(wide && (f.full || f.type === "textarea" || f.type === "checkboxes") && "sm:col-span-2");
  if (f.type === "checkbox") {
    return (
      <label className={cn("flex items-center gap-2 text-sm", span)}>
        <input type="checkbox" name={f.name} defaultChecked={Boolean(f.defaultValue)} className="size-4 accent-navy-900" /> {f.label}
      </label>
    );
  }
  if (f.type === "checkboxes") {
    const def = new Set((f.defaultValue as string[]) ?? []);
    return (
      <fieldset className={span}>
        <legend className="label">{f.label}</legend>
        <div className="flex flex-wrap gap-2">
          {f.options?.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-navy-900 has-[:checked]:bg-navy-900/5">
              <input type="checkbox" name={f.name} value={o.value} defaultChecked={def.has(o.value)} className="size-4 accent-navy-900" /> {o.label}
            </label>
          ))}
        </div>
        {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
      </fieldset>
    );
  }
  const common = { name: f.name, required: f.required, placeholder: f.placeholder, defaultValue: f.defaultValue as string | number | undefined };
  return (
    <Field label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint} className={span}>
      {f.type === "textarea" ? (
        <Textarea {...common} rows={3} />
      ) : f.type === "select" ? (
        <Select {...common}>
          {!f.required && <option value="">—</option>}
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : f.type === "color" ? (
        <div className="flex items-center gap-2">
          <input type="color" name={f.name} defaultValue={f.defaultValue as string} className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-white p-1" />
        </div>
      ) : (
        <Input {...common} type={f.type ?? "text"} min={f.min} max={f.max} />
      )}
    </Field>
  );
}
