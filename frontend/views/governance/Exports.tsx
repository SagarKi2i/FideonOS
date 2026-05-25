'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileJson, FileDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ExportRow {
  id: string;
  decision_record_id: string;
  exported_by: string;
  format: "pdf" | "json";
  created_at: string;
  decision_records?: { title: string; domain: string };
}

export default function Exports() {
  const router = useRouter();
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("decision_exports")
      .select("*, decision_records(title, domain)")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data as unknown as ExportRow[]) || []);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Download className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Audit Exports</h1>
          <Badge variant="outline" className="text-[10px] h-5">Chain of custody</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Every audit report exported from the system. Each entry is linked to a Decision Record.
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-wider">Decision</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider w-[110px]">Format</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider w-[180px]">Exported At</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-sm text-muted-foreground">No exports yet. Use the PDF or JSON button on any Decision Record.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/governance/decisions/${r.decision_record_id}`)}>
                    <TableCell>
                      <div className="text-sm font-medium truncate">{r.decision_records?.title || r.decision_record_id.slice(0, 8)}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">{r.decision_records?.domain}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        {r.format === "pdf" ? <FileDown className="h-3 w-3" /> : <FileJson className="h-3 w-3" />}
                        {r.format.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
