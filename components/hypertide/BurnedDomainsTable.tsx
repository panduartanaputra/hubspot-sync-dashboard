"use client";

import { DomainOrder } from "@/lib/hypertide";

interface Props {
  domains: DomainOrder[];
}

export default function BurnedDomainsTable({ domains }: Props) {
  if (domains.length === 0) {
    return <div className="text-textdim text-xs label-eyebrow-dim">NO BURNED DOMAINS</div>;
  }

  return (
    <table className="w-full text-xs">
      <thead className="text-textdim2">
        <tr className="border-b border-border">
          <th className="text-left py-2 label-eyebrow-dim">DOMAIN</th>
          <th className="text-left py-2 label-eyebrow-dim">PLAN</th>
          <th className="text-left py-2 label-eyebrow-dim">STATUS</th>
          <th className="text-left py-2 label-eyebrow-dim">RETIRED</th>
          <th className="text-left py-2 label-eyebrow-dim">REASON</th>
        </tr>
      </thead>
      <tbody>
        {domains.map((d) => (
          <tr key={d.id} className="border-b border-border">
            <td className="py-2 text-textdim font-mono">{d.domain}</td>
            <td className="py-2 text-textdim uppercase">{d.plan}</td>
            <td className={`py-2 ${d.status === "failed" ? "text-red" : "text-textdim2"}`}>
              ● {d.status}
            </td>
            <td className="py-2 text-textdim2">
              {d.done_at ? new Date(d.done_at).toLocaleDateString() : "—"}
            </td>
            <td className="py-2 text-textdim2 truncate max-w-md">{d.failure_reason ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
