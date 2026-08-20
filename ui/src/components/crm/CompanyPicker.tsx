"use client";

import { useEffect, useRef, useState } from "react";

import { listCompaniesApiV1CompaniesGet } from "@/client/sdk.gen";
import type { CompanyResponse } from "@/client/types.gen";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

interface CompanyPickerProps {
  value: number | null;
  onChange: (companyId: number | null) => void;
  placeholder?: string;
}

export function CompanyPicker({
  value,
  onChange,
  placeholder = "Select company",
}: CompanyPickerProps) {
  const { user, loading: authLoading } = useAuth();
  const hasFetched = useRef(false);
  const [companies, setCompanies] = useState<CompanyResponse[]>([]);

  useEffect(() => {
    if (authLoading || !user || hasFetched.current) return;
    hasFetched.current = true;
    listCompaniesApiV1CompaniesGet().then((res) => {
      if (!res.error) setCompanies(res.data ?? []);
    });
  }, [authLoading, user]);

  return (
    <Select
      value={value !== null ? String(value) : "none"}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    >
      <SelectTrigger className="bg-background/50 border-white/10 rounded-xl">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No company</SelectItem>
        {companies.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
