import { tenantStatus } from "@/lib/format";
import type { Tenant } from "@/lib/types";

export default function StatusTag({ tenant }: { tenant: Tenant }) {
  const s = tenantStatus(tenant);
  return <span className={`status-tag ${s.key}`}>{s.label}</span>;
}
