"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { updateOrganizationApiV1OrganizationsPatch } from "@/client/sdk.gen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgConfig } from "@/context/OrgConfigContext";
import { detailFromError } from "@/lib/apiError";

export function OrganizationSection() {
  const { role, orgName, loading, refreshConfig } = useOrgConfig();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(orgName ?? "");
  }, [orgName]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  const isOwner = role === "owner";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Organization name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const result = await updateOrganizationApiV1OrganizationsPatch({
        body: { name: trimmed },
      });

      if (result.error) {
        toast.error(
          detailFromError(result.error, "Failed to rename organization"),
        );
        return;
      }

      await refreshConfig();
      toast.success("Organization renamed");
    } catch {
      toast.error("Failed to rename organization");
    } finally {
      setSaving(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="space-y-2">
        <Label>Workspace name</Label>
        <p className="text-sm font-medium">{orgName || "Unnamed workspace"}</p>
        <p className="text-xs text-muted-foreground">
          Contact your workspace owner to rename
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="settings-org-name">Workspace name</Label>
        <Input
          id="settings-org-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Inc."
        />
      </div>
      <Button type="submit" disabled={saving}>
        <Save className="mr-2 h-4 w-4" />
        {saving ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
