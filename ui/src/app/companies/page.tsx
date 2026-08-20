"use client";

import {
  Building2,
  Globe,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  createCompanyApiV1CompaniesPost,
  deleteCompanyApiV1CompaniesCompanyIdDelete,
  listCompaniesApiV1CompaniesGet,
  updateCompanyApiV1CompaniesCompanyIdPatch,
} from "@/client/sdk.gen";
import type { CompanyResponse } from "@/client/types.gen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

interface CompanyFormState {
  name: string;
  domain: string;
  industry: string;
  size: string;
}

const EMPTY_FORM: CompanyFormState = {
  name: "",
  domain: "",
  industry: "",
  size: "",
};

export default function CompaniesPage() {
  const { user, redirectToLogin, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<CompanyResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<CompanyResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyResponse | null>(null);

  // Form states
  const [form, setForm] = useState<CompanyFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      redirectToLogin();
    }
  }, [authLoading, user, redirectToLogin]);

  const fetchCompanies = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const res = await listCompaniesApiV1CompaniesGet();
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to load companies"));
        return;
      }
      setCompanies(res.data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchCompanies();
  }, [authLoading, user, fetchCompanies]);

  const openEditDialog = (company: CompanyResponse) => {
    setForm({
      name: company.name,
      domain: company.domain ?? "",
      industry: company.industry ?? "",
      size: company.size ?? "",
    });
    setFormError(null);
    setEditCompany(company);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setIsSubmitting(true);
      setFormError(null);
      const res = editCompany
        ? await updateCompanyApiV1CompaniesCompanyIdPatch({
            path: { company_id: editCompany.id },
            body: {
              name: form.name,
              domain: form.domain || null,
              industry: form.industry || null,
              size: form.size || null,
            },
          })
        : await createCompanyApiV1CompaniesPost({
            body: {
              name: form.name,
              domain: form.domain || null,
              industry: form.industry || null,
              size: form.size || null,
            },
          });

      if (res.error) {
        setFormError(
          detailFromError(
            res.error,
            editCompany ? "Failed to update company" : "Failed to create company"
          )
        );
        return;
      }
      setIsAddOpen(false);
      setEditCompany(null);
      setForm(EMPTY_FORM);
      fetchCompanies();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const res = await deleteCompanyApiV1CompaniesCompanyIdDelete({
        path: { company_id: deleteTarget.id },
      });
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to delete company"));
        return;
      }
      setDeleteTarget(null);
      fetchCompanies();
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = companies.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.domain && c.domain.toLowerCase().includes(q)) ||
      (c.industry && c.industry.toLowerCase().includes(q))
    );
  });

  if (authLoading || !user) {
    return (
      <div className="container mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Accounts and client organizations connected to voice agents and deals.
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormError(null);
            setIsAddOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Company
        </Button>
      </div>

      {/* Main Panel */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies by name, domain, industry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background/50 border-white/10 rounded-xl"
          />
        </div>

        {pageError && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
            {pageError}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground uppercase text-[11px] font-semibold tracking-wider border-b border-white/10">
              <tr>
                <th className="px-5 py-3.5">Company</th>
                <th className="px-5 py-3.5">Domain</th>
                <th className="px-5 py-3.5">Industry</th>
                <th className="px-5 py-3.5">Size</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    No companies found. Add an account to organize your contacts.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary/70" />
                        {c.name}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {c.domain ? (
                        <a
                          href={`https://${c.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary flex items-center gap-1"
                        >
                          <Globe className="h-3 w-3" />
                          {c.domain}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{c.industry || "—"}</td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{c.size || "—"}</td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => openEditDialog(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Company Dialog */}
      <Dialog
        open={isAddOpen || editCompany !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddOpen(false);
            setEditCompany(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="glass-panel max-w-md border-white/10">
          <DialogHeader>
            <DialogTitle>{editCompany ? "Edit Company" : "Add New Company"}</DialogTitle>
            <DialogDescription>
              {editCompany
                ? "Update this company profile."
                : "Create a company profile to associate with contacts and deals."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCompany} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cname">Company Name *</Label>
              <Input
                id="cname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domain / Website</Label>
              <Input
                id="domain"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="acme.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="Software / SaaS"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="size">Company Size</Label>
                <Input
                  id="size"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                  placeholder="50-200"
                />
              </div>
            </div>

            {formError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                {formError}
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsAddOpen(false);
                  setEditCompany(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !form.name.trim()}>
                {isSubmitting ? "Saving..." : editCompany ? "Save Changes" : "Save Company"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Company Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete company?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.name}. Contacts linked to this company
              will be kept but unlinked. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCompany}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
