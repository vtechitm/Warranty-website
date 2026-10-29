import { Download, Search } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { searchCodes } from "@/server/services/warranty-codes";
import { listBrands, listProducts } from "@/server/services/catalog";
import { prisma } from "@/server/db";
import { warrantySearchSchema } from "@/server/validation";
import { can } from "@/server/auth/permissions";
import { parseParams } from "@/lib/params";
import { PageHeader, Pager, hrefWith } from "@/components/ui/misc";
import { WarrantyTable } from "@/components/warranty-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

export const metadata = { title: "Mã bảo hành" };

export default async function AdminWarranties({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const sp = await searchParams;
  const q = parseParams(warrantySearchSchema, sp, { pageSize: 50 });
  const [result, brands, products, labs] = await Promise.all([
    searchCodes(actor, q),
    listBrands(actor),
    listProducts(actor),
    prisma.laboratory.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const showPatient = actor.role === "SUPER_ADMIN";
  return (
    <div>
      <PageHeader
        title="Mã bảo hành"
        description="Tìm kiếm toàn bộ mã trong phạm vi quyền. Tìm theo tên/SĐT bệnh nhân chỉ dành cho quản trị Vtech."
        actions={can(actor.role, "report:export") && <a href={hrefWith("/api/v1/warranties/export", sp, { page: undefined })}><Button variant="outline"><Download /> Xuất Excel</Button></a>}
      />
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto]">
        <div className="relative md:col-span-3 xl:col-span-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder={showPatient ? "Mã, phòng khám, tên/SĐT bệnh nhân" : "Mã, phòng khám"} className="field pl-10" />
        </div>
        <Select name="status" defaultValue={sp.status ?? ""}>
          <option value="">Mọi trạng thái</option>
          <option value="CREATED">Chưa dùng</option>
          <option value="ACTIVATED">Đã kích hoạt</option>
          <option value="REVOKED">Đã thu hồi</option>
        </Select>
        <Select name="brandId" defaultValue={sp.brandId ?? ""}>
          <option value="">Mọi thương hiệu</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select name="productId" defaultValue={sp.productId ?? ""}>
          <option value="">Mọi sản phẩm</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select name="laboratoryId" defaultValue={sp.laboratoryId ?? ""}>
          <option value="">Mọi labo</option>
          {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <div className="flex gap-2 md:col-span-3 xl:col-span-1">
          <input type="date" name="activatedFrom" defaultValue={sp.activatedFrom} className="field" title="Kích hoạt từ" />
          <input type="date" name="activatedTo" defaultValue={sp.activatedTo} className="field" title="Kích hoạt đến" />
          <Button type="submit">Lọc</Button>
        </div>
      </form>
      <div className="card overflow-hidden">
        <WarrantyTable rows={result.items} hrefBase="/admin/warranties" showLab showPatient={showPatient} />
        <Pager page={q.page} totalPages={Math.max(1, Math.ceil(result.total / q.pageSize))} total={result.total} makeHref={(p) => hrefWith("/admin/warranties", sp, { page: p })} />
      </div>
    </div>
  );
}
