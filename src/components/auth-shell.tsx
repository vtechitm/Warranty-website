import Link from "next/link";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_30%_20%,#1b4277_0%,transparent_70%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link href="/" className="text-lg font-bold tracking-[0.25em] text-gold-500">VTECH DENTAL</Link>
          <div>
            <h2 className="text-4xl font-bold leading-tight">Hệ thống bảo hành<br />răng sứ điện tử</h2>
            <p className="mt-4 max-w-md text-white/60">Sinh mã QR trước, kích hoạt tại labo, bệnh nhân tra cứu chứng nhận chính hãng ngay trên điện thoại.</p>
          </div>
          <p className="text-xs text-white/40">Digital Dental Passport · Origin · Elite Zirconia · Overneer</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 block text-center text-lg font-bold tracking-[0.25em] text-navy-900 lg:hidden">VTECH DENTAL</Link>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mb-8 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}
