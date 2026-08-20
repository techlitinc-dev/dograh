"use client";

import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  bulkImportContactsApiV1ContactsImportPost,
  createContactApiV1ContactsPost,
  deleteContactApiV1ContactsContactIdDelete,
  getContactStatsApiV1ContactsStatsGet,
  listContactsApiV1ContactsGet,
  listOrganizationMembersApiV1OrganizationsMembersGet,
  updateContactApiV1ContactsContactIdPatch,
} from "@/client/sdk.gen";
import type {
  ContactResponse,
  ContactStatsResponse,
  OrganizationMember,
} from "@/client/types.gen";
import { CompanyPicker } from "@/components/crm/CompanyPicker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  mql: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  sql: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  opportunity: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  customer: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const PAGE_SIZE = 20;

interface ContactFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  stage: string;
  doNotCall: boolean;
  companyId: number | null;
  tags: string;
}

const EMPTY_FORM: ContactFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  stage: "lead",
  doNotCall: false,
  companyId: null,
  tags: "",
};

function parseTags(raw: string): string[] | null {
  const tags = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : null;
}

export default function ContactsPage() {
  const { user, redirectToLogin, loading: authLoading } = useAuth();
  const [contacts, setContacts] = useState<ContactResponse[]>([]);
  const [stats, setStats] = useState<ContactStatsResponse | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<ContactResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactResponse | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);

  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasFetchedMembers = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) {
      redirectToLogin();
    }
  }, [authLoading, user, redirectToLogin]);

  // Debounce the search box so we do not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to the first page whenever filters change.
  useEffect(() => {
    setPage(0);
  }, [search, stageFilter, ownerFilter]);

  const fetchStats = useCallback(async () => {
    const res = await getContactStatsApiV1ContactsStatsGet();
    if (!res.error) setStats(res.data ?? null);
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const res = await listContactsApiV1ContactsGet({
        query: {
          search: search || null,
          lifecycle_stage: stageFilter !== "all" ? stageFilter : null,
          owner_id: ownerFilter !== "all" ? Number(ownerFilter) : null,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to load contacts"));
        return;
      }
      setContacts(res.data?.items ?? []);
      setTotal(res.data?.total ?? 0);
    } finally {
      setIsLoading(false);
    }
  }, [search, stageFilter, ownerFilter, page]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchContacts();
  }, [authLoading, user, fetchContacts]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchStats();
  }, [authLoading, user, fetchStats]);

  useEffect(() => {
    if (authLoading || !user || hasFetchedMembers.current) return;
    hasFetchedMembers.current = true;
    listOrganizationMembersApiV1OrganizationsMembersGet().then((res) => {
      if (!res.error) setMembers(res.data ?? []);
    });
  }, [authLoading, user]);

  const openEditDialog = (contact: ContactResponse) => {
    setForm({
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      stage: contact.lifecycle_stage,
      doNotCall: contact.do_not_call ?? false,
      companyId: contact.company_id ?? null,
      tags: (contact.tags ?? []).map((t) => t.name).join(", "),
    });
    setFormError(null);
    setEditContact(contact);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setFormError(null);
      const tagNames = parseTags(form.tags);
      if (editContact) {
        const res = await updateContactApiV1ContactsContactIdPatch({
          path: { contact_id: editContact.id },
          body: {
            first_name: form.firstName || null,
            last_name: form.lastName || null,
            email: form.email || null,
            phone: form.phone || null,
            lifecycle_stage: form.stage,
            do_not_call: form.doNotCall,
            company_id: form.companyId,
            tag_names: tagNames,
          },
        });
        if (res.error) {
          setFormError(detailFromError(res.error, "Failed to update contact"));
          return;
        }
        setEditContact(null);
      } else {
        const res = await createContactApiV1ContactsPost({
          body: {
            first_name: form.firstName || null,
            last_name: form.lastName || null,
            email: form.email || null,
            phone: form.phone || null,
            lifecycle_stage: form.stage,
            do_not_call: form.doNotCall,
            company_id: form.companyId,
            tag_names: tagNames,
          },
        });
        if (res.error) {
          setFormError(detailFromError(res.error, "Failed to create contact"));
          return;
        }
        setIsAddOpen(false);
      }
      setForm(EMPTY_FORM);
      fetchContacts();
      fetchStats();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const res = await deleteContactApiV1ContactsContactIdDelete({
        path: { contact_id: deleteTarget.id },
      });
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to delete contact"));
        return;
      }
      setDeleteTarget(null);
      fetchContacts();
      fetchStats();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) return;
    try {
      setIsSubmitting(true);
      setImportResult(null);
      const lines = csvText.trim().split("\n");
      const items = lines
        .slice(1)
        .map((line) => {
          const [first_name, last_name, email, phone, stage_val] = line
            .split(",")
            .map((s) => s.trim());
          return {
            first_name,
            last_name,
            email,
            phone,
            lifecycle_stage: stage_val || "lead",
          };
        })
        .filter((item) => !!item.phone);

      const res = await bulkImportContactsApiV1ContactsImportPost({
        body: { contacts: items },
      });
      if (res.error) {
        setImportResult(detailFromError(res.error, "Failed to import contacts"));
        return;
      }
      const imported = res.data?.imported_count ?? 0;
      const errors = res.data?.errors ?? [];
      setImportResult(
        errors.length > 0
          ? `Imported ${imported} contacts. ${errors.length} row(s) failed: ${errors[0]}`
          : `Successfully imported ${imported} contacts.`
      );
      if (errors.length === 0) {
        setCsvText("");
      }
      fetchContacts();
      fetchStats();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="container mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your leads, customer phone records, and mid-call conversation histories.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="glass-button gap-2 border-white/10"
            onClick={() => {
              setImportResult(null);
              setIsImportOpen(true);
            }}
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError(null);
              setIsAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Contacts</span>
            <Users className="h-5 w-5 text-primary/80" />
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight">{stats?.total_contacts ?? total}</div>
          <p className="text-xs text-muted-foreground mt-1">
            +{stats?.contacts_created_this_week ?? 0} added this week
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Leads</span>
            <UserPlus className="h-5 w-5 text-blue-400" />
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-blue-400">
            {stats?.leads ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Ready for voice outbound</p>
        </div>

        <div className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opportunities</span>
            <UserCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-emerald-400">
            {stats?.opportunities ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Qualified voice prospects</p>
        </div>

        <div className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Do-Not-Call (DNC)</span>
            <PhoneOff className="h-5 w-5 text-destructive/80" />
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-destructive">
            {stats?.do_not_call_count ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Enforced compliance protection</p>
        </div>
      </div>

      {/* Filter and Table Panel */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone (+1...), or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 bg-background/50 border-white/10 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-background/50 border-white/10 rounded-xl">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="mql">Marketing Qualified (MQL)</SelectItem>
                <SelectItem value="sql">Sales Qualified (SQL)</SelectItem>
                <SelectItem value="opportunity">Opportunity</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background/50 border-white/10 rounded-xl">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={String(m.user_id)}>
                    {m.is_you ? "You" : m.email || `User #${m.user_id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pageError && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
            {pageError}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground uppercase text-[11px] font-semibold tracking-wider border-b border-white/10">
              <tr>
                <th className="px-5 py-3.5">Name / Contact</th>
                <th className="px-5 py-3.5">Phone (E.164)</th>
                <th className="px-5 py-3.5">Lifecycle Stage</th>
                <th className="px-5 py-3.5">DNC Compliance</th>
                <th className="px-5 py-3.5">Source</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    No contacts found. Create your first contact or upload a CSV.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed Contact";
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    >
                      <td className="px-5 py-4">
                        <Link href={`/contacts/${c.id}`} className="block">
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {fullName}
                          </div>
                          {c.email && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </div>
                          )}
                          {(c.tags ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(c.tags ?? []).map((t) => (
                                <span
                                  key={t.id}
                                  className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                                >
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs">
                        <Link href={`/contacts/${c.id}`} className="flex items-center gap-1.5 text-foreground/90">
                          <Phone className="h-3.5 w-3.5 text-primary/70" />
                          {c.phone || "—"}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                            STAGE_COLORS[c.lifecycle_stage] || "bg-muted text-muted-foreground border-white/10"
                          }`}
                        >
                          {c.lifecycle_stage}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {c.do_not_call ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                            <PhoneOff className="h-3 w-3" />
                            DNC Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground">
                            Callable
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 capitalize text-xs text-muted-foreground">
                        {c.source}
                      </td>
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
                          <Link href={`/contacts/${c.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {total === 0 ? "No contacts" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-white/10"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground font-mono">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-white/10"
              disabled={page + 1 >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Add / Edit Contact Modal */}
      <Dialog
        open={isAddOpen || editContact !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddOpen(false);
            setEditContact(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="glass-panel max-w-md border-white/10">
          <DialogHeader>
            <DialogTitle>{editContact ? "Edit Contact" : "Add New Contact"}</DialogTitle>
            <DialogDescription>
              {editContact
                ? "Update this caller or prospect profile."
                : "Create a caller or prospect profile for voice dialing and CRM history."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveContact} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number (E.164)</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+14155552671"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@company.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Company</Label>
              <CompanyPicker
                value={form.companyId}
                onChange={(companyId) => setForm({ ...form, companyId })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stage">Lifecycle Stage</Label>
                <Select
                  value={form.stage}
                  onValueChange={(stage) => setForm({ ...form, stage })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="mql">MQL</SelectItem>
                    <SelectItem value="sql">SQL</SelectItem>
                    <SelectItem value="opportunity">Opportunity</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="vip, newsletter"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="dnc"
                checked={form.doNotCall}
                onChange={(e) => setForm({ ...form, doNotCall: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary"
              />
              <Label htmlFor="dnc" className="text-xs text-muted-foreground font-normal">
                Mark as Do Not Call (DNC) for compliance
              </Label>
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
                  setEditContact(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editContact
                    ? "Save Changes"
                    : "Save Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              {[deleteTarget?.first_name, deleteTarget?.last_name].filter(Boolean).join(" ") ||
                deleteTarget?.phone ||
                "this contact"}{" "}
              and remove them from lists and campaigns. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import CSV Modal */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="glass-panel max-w-lg border-white/10">
          <DialogHeader>
            <DialogTitle>Bulk Import Contacts</DialogTitle>
            <DialogDescription>
              Paste CSV records below. Format: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">first_name,last_name,email,phone,stage</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <textarea
              className="w-full h-44 p-3 font-mono text-xs bg-background/50 border border-white/10 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={`first_name,last_name,email,phone,stage\nAlice,Smith,alice@example.com,+14155550101,lead\nBob,Jones,bob@example.com,+14155550102,opportunity`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            {importResult && (
              <div className="text-sm text-muted-foreground bg-muted/40 border border-white/10 rounded-xl px-3 py-2">
                {importResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsImportOpen(false)}>
              Close
            </Button>
            <Button onClick={handleImportCsv} disabled={isSubmitting || !csvText.trim()}>
              {isSubmitting ? "Importing..." : "Import Contacts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
