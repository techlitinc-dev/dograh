"use client";

import {
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  createDealApiV1DealsPost,
  deleteDealApiV1DealsDealIdDelete,
  getPipelineBoardApiV1DealsBoardGet,
  updateDealApiV1DealsDealIdPatch,
} from "@/client/sdk.gen";
import type { DealResponse, PipelineBoardResponse } from "@/client/types.gen";
import { CompanyPicker } from "@/components/crm/CompanyPicker";
import { ContactPicker } from "@/components/crm/ContactPicker";
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

const STAGE_ACCENTS: Record<string, string> = {
  lead: "border-t-blue-500",
  qualified: "border-t-purple-500",
  meeting: "border-t-amber-500",
  proposal: "border-t-indigo-500",
  negotiation: "border-t-orange-500",
  won: "border-t-emerald-500",
  lost: "border-t-rose-500",
};

const STAGE_OPTIONS = [
  { value: "lead", label: "Lead In" },
  { value: "qualified", label: "Qualified" },
  { value: "meeting", label: "Meeting Scheduled" },
  { value: "proposal", label: "Proposal Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Closed Won" },
  { value: "lost", label: "Closed Lost" },
];

interface DealFormState {
  title: string;
  value: string;
  currency: string;
  stage: string;
  probability: string;
  expectedCloseDate: string;
  contactId: number | null;
  companyId: number | null;
}

const EMPTY_FORM: DealFormState = {
  title: "",
  value: "",
  currency: "USD",
  stage: "lead",
  probability: "50",
  expectedCloseDate: "",
  contactId: null,
  companyId: null,
};

export default function PipelinePage() {
  const { user, redirectToLogin, loading: authLoading } = useAuth();
  const [board, setBoard] = useState<PipelineBoardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isAddDealOpen, setIsAddDealOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<DealResponse | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Form states
  const [form, setForm] = useState<DealFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      redirectToLogin();
    }
  }, [authLoading, user, redirectToLogin]);

  const fetchBoard = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const res = await getPipelineBoardApiV1DealsBoardGet();
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to load pipeline"));
        return;
      }
      setBoard(res.data ?? null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchBoard();
  }, [authLoading, user, fetchBoard]);

  const openEditDialog = (deal: DealResponse) => {
    setForm({
      title: deal.title,
      value: deal.value !== null && deal.value !== undefined ? String(deal.value) : "",
      currency: deal.currency,
      stage: deal.stage,
      probability:
        deal.probability !== null && deal.probability !== undefined
          ? String(deal.probability)
          : "50",
      expectedCloseDate: deal.expected_close_date
        ? deal.expected_close_date.slice(0, 10)
        : "",
      contactId: deal.contact_id ?? null,
      companyId: deal.company_id ?? null,
    });
    setFormError(null);
    setEditDeal(deal);
  };

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      setIsSubmitting(true);
      setFormError(null);
      const res = editDeal
        ? await updateDealApiV1DealsDealIdPatch({
            path: { deal_id: editDeal.id },
            body: {
              title: form.title,
              value: form.value ? parseFloat(form.value) : null,
              currency: form.currency || null,
              stage: form.stage,
              probability: form.probability ? parseInt(form.probability, 10) : null,
              expected_close_date: form.expectedCloseDate || null,
              contact_id: form.contactId,
              company_id: form.companyId,
              status:
                form.stage === "won" ? "won" : form.stage === "lost" ? "lost" : "open",
            },
          })
        : await createDealApiV1DealsPost({
            body: {
              title: form.title,
              value: form.value ? parseFloat(form.value) : null,
              currency: form.currency || "USD",
              stage: form.stage,
              probability: form.probability ? parseInt(form.probability, 10) : null,
              expected_close_date: form.expectedCloseDate || null,
              contact_id: form.contactId,
              company_id: form.companyId,
              status:
                form.stage === "won" ? "won" : form.stage === "lost" ? "lost" : "open",
            },
          });

      if (res.error) {
        setFormError(
          detailFromError(res.error, editDeal ? "Failed to update deal" : "Failed to create deal")
        );
        return;
      }
      setIsAddDealOpen(false);
      setEditDeal(null);
      setForm(EMPTY_FORM);
      fetchBoard();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDeal = async () => {
    if (!editDeal) return;
    try {
      setIsDeleting(true);
      const res = await deleteDealApiV1DealsDealIdDelete({
        path: { deal_id: editDeal.id },
      });
      if (res.error) {
        setFormError(detailFromError(res.error, "Failed to delete deal"));
        setIsDeleteOpen(false);
        return;
      }
      setIsDeleteOpen(false);
      setEditDeal(null);
      fetchBoard();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveStage = async (dealId: number, targetStage: string) => {
    // The backend automatically logs a stage_change activity on stage moves.
    const res = await updateDealApiV1DealsDealIdPatch({
      path: { deal_id: dealId },
      body: {
        stage: targetStage,
        status: targetStage === "won" ? "won" : targetStage === "lost" ? "lost" : "open",
      },
    });
    if (res.error) {
      setPageError(detailFromError(res.error, "Failed to move deal"));
      return;
    }
    fetchBoard();
  };

  if (authLoading || !user) {
    return (
      <div className="container mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deals Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track deals, forecast revenue, and manage customer journey stages.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-xs text-muted-foreground uppercase font-semibold">Total Pipeline</span>
            <div className="text-2xl font-bold text-emerald-400">
              ${(board?.total_pipeline_value || 0).toLocaleString()} USD
            </div>
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError(null);
              setIsAddDealOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Deal
          </Button>
        </div>
      </div>

      {pageError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
          {pageError}
        </div>
      )}

      {/* Kanban Board Container */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1280px]">
          {isLoading || !board ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-1 space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ))
          ) : (
            board.stages.map((stage) => {
              const borderTopClass = STAGE_ACCENTS[stage.stage_id] || "border-t-primary";
              return (
                <div
                  key={stage.stage_id}
                  className={`flex-1 flex flex-col glass-card rounded-2xl border-t-4 ${borderTopClass} p-4 min-h-[680px] space-y-3 bg-card/40`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div>
                      <div className="font-semibold text-sm tracking-tight flex items-center gap-2">
                        {stage.stage_name}
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-muted/60 font-mono text-muted-foreground">
                          {stage.deal_count}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                        ${stage.total_value.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Deals in Stage */}
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {stage.deals.length === 0 ? (
                      <div className="h-32 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-xs text-muted-foreground/60">
                        No deals
                      </div>
                    ) : (
                      stage.deals.map((deal) => (
                        <div
                          key={deal.id}
                          className="glass-card rounded-xl p-4 space-y-3 hover:border-primary/40 transition-all cursor-pointer group shadow-sm"
                          onClick={() => openEditDialog(deal)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                              {deal.title}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-emerald-400">
                              ${(deal.value || 0).toLocaleString()} {deal.currency}
                            </span>
                            {deal.probability !== null && deal.probability !== undefined && (
                              <span className="text-muted-foreground font-mono">
                                {deal.probability}% win
                              </span>
                            )}
                          </div>

                          {/* Quick Stage Mover */}
                          <div
                            className="pt-2 border-t border-white/5 flex items-center justify-between"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Select
                              value={deal.stage}
                              onValueChange={(val) => handleMoveStage(deal.id, val)}
                            >
                              <SelectTrigger className="h-6 text-[11px] px-2 py-0 bg-white/5 border-white/10 rounded-md">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STAGE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {deal.contact_id && (
                              <Link
                                href={`/contacts/${deal.contact_id}`}
                                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                              >
                                Contact <ChevronRight className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add / Edit Deal Dialog */}
      <Dialog
        open={isAddDealOpen || editDeal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDealOpen(false);
            setEditDeal(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="glass-panel max-w-md border-white/10">
          <DialogHeader>
            <DialogTitle>{editDeal ? "Edit Deal" : "Create Pipeline Deal"}</DialogTitle>
            <DialogDescription>
              {editDeal
                ? "Update deal details, value, and associations."
                : "Add a new commercial opportunity to track in your pipeline."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDeal} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Deal Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Enterprise Voice Agent Rollout"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="value">Deal Value</Label>
                <Input
                  id="value"
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="24000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  placeholder="USD"
                  maxLength={3}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stage">Stage</Label>
                <Select
                  value={form.stage}
                  onValueChange={(stage) => setForm({ ...form, stage })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prob">Probability (%)</Label>
                <Input
                  id="prob"
                  type="number"
                  min="0"
                  max="100"
                  value={form.probability}
                  onChange={(e) => setForm({ ...form, probability: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="close_date">Expected Close Date</Label>
              <Input
                id="close_date"
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Contact</Label>
              <ContactPicker
                value={form.contactId}
                onChange={(contactId) => setForm({ ...form, contactId })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Company</Label>
              <CompanyPicker
                value={form.companyId}
                onChange={(companyId) => setForm({ ...form, companyId })}
              />
            </div>

            {formError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                {formError}
              </div>
            )}

            <DialogFooter className="pt-4 sm:justify-between">
              {editDeal ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setIsDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsAddDealOpen(false);
                    setEditDeal(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !form.title.trim()}>
                  {isSubmitting ? "Saving..." : editDeal ? "Save Changes" : "Create Deal"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Deal Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the deal &quot;{editDeal?.title}&quot;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDeal}
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
