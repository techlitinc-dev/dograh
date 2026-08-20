"use client";

import { useEffect, useRef, useState } from "react";

import { listContactsApiV1ContactsGet } from "@/client/sdk.gen";
import type { ContactResponse } from "@/client/types.gen";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

interface ContactPickerProps {
  value: number | null;
  onChange: (contactId: number | null) => void;
  placeholder?: string;
}

export function ContactPicker({
  value,
  onChange,
  placeholder = "Select contact",
}: ContactPickerProps) {
  const { user, loading: authLoading } = useAuth();
  const hasFetched = useRef(false);
  const [contacts, setContacts] = useState<ContactResponse[]>([]);

  useEffect(() => {
    if (authLoading || !user || hasFetched.current) return;
    hasFetched.current = true;
    listContactsApiV1ContactsGet({ query: { limit: 100 } }).then((res) => {
      if (!res.error) setContacts(res.data?.items ?? []);
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
        <SelectItem value="none">No contact</SelectItem>
        {contacts.map((c) => {
          const name =
            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            c.phone ||
            `Contact #${c.id}`;
          return (
            <SelectItem key={c.id} value={String(c.id)}>
              {name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
