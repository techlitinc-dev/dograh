"use client";

import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  PhoneCall,
  PhoneOff,
  Play,
  Send,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  completeTaskApiV1ActivitiesTasksActivityIdCompletePost,
  createActivityApiV1ActivitiesPost,
  deleteContactApiV1ContactsContactIdDelete,
  getContactApiV1ContactsContactIdGet,
  listContactActivitiesApiV1ContactsContactIdActivitiesGet,
  listDealsApiV1DealsGet,
  updateContactApiV1ContactsContactIdPatch,
} from "@/client/sdk.gen";
import type {
  ActivityResponse,
  ContactResponse,
  DealResponse,
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

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const resolvedParams = use(params);
  const contactId = Number(resolvedParams.contactId);
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();
  const hasFetched = useRef(false);
  const [contact, setContact] = useState<ContactResponse | null>(null);
  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [deals, setDeals] = useState<DealResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Composer mode and timeline filter are independent: the composer toggles
  // between note and task entry, the filter narrows the timeline feed.
  const [composerTab, setComposerTab] = useState<"note" | "task">("note");
  const [timelineFilter, setTimelineFilter] = useState<"all" | "call" | "note" | "task">("all");
  const [noteBody, setNoteBody] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  // Edit fields
  const [stage, setStage] = useState("lead");
  const [doNotCall, setDoNotCall] = useState(false);

  // Edit dialog / delete confirmation
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    companyId: null as number | null,
  });
  const [editError, setEditError] = useState<string | null>(null);

  const fetchContactData = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const [resContact, resActivities, resDeals] = await Promise.all([
        getContactApiV1ContactsContactIdGet({ path: { contact_id: contactId } }),
        listContactActivitiesApiV1ContactsContactIdActivitiesGet({
          path: { contact_id: contactId },
        }),
        listDealsApiV1DealsGet({ query: { contact_id: contactId } }),
      ]);

      if (resContact.error) {
        setPageError(detailFromError(resContact.error, "Failed to load contact"));
        setContact(null);
        return;
      }
      if (resContact.data) {
        setContact(resContact.data);
        setStage(resContact.data.lifecycle_stage);
        setDoNotCall(resContact.data.do_not_call ?? false);
      }
      if (!resActivities.error) setActivities(resActivities.data ?? []);
      if (!resDeals.error) setDeals(resDeals.data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (authLoading || !user || hasFetched.current) return;
    hasFetched.current = true;
    fetchContactData();
  }, [authLoading, user, fetchContactData]);

  const handleUpdateStage = async (newStage: string) => {
    setStage(newStage);
    const res = await updateContactApiV1ContactsContactIdPatch({
      path: { contact_id: contactId },
      body: { lifecycle_stage: newStage },
    });
    if (res.error) {
      setPageError(detailFromError(res.error, "Failed to update stage"));
      return;
    }
    // Log stage change activity (the backend only auto-logs deal stage moves).
    await createActivityApiV1ActivitiesPost({
      body: {
        contact_id: contactId,
        type: "stage_change",
        body: `Stage updated to ${newStage.toUpperCase()}`,
      },
    });
    fetchContactData();
  };

  const handleToggleDnc = async () => {
    const nextDnc = !doNotCall;
    setDoNotCall(nextDnc);
    const res = await updateContactApiV1ContactsContactIdPatch({
      path: { contact_id: contactId },
      body: { do_not_call: nextDnc },
    });
    if (res.error) {
      setDoNotCall(!nextDnc);
      setPageError(detailFromError(res.error, "Failed to update DNC status"));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    try {
      setIsSubmitting(true);
      setComposerError(null);
      const res = await createActivityApiV1ActivitiesPost({
        body: {
          contact_id: contactId,
          type: "note",
          body: noteBody,
        },
      });
      if (res.error) {
        setComposerError(detailFromError(res.error, "Failed to save note"));
        return;
      }
      setNoteBody("");
      fetchContactData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    try {
      setIsSubmitting(true);
      setComposerError(null);
      const res = await createActivityApiV1ActivitiesPost({
        body: {
          contact_id: contactId,
          type: "task",
          body: noteBody,
          due_at: taskDueDate ? new Date(taskDueDate).toISOString() : null,
        },
      });
      if (res.error) {
        setComposerError(detailFromError(res.error, "Failed to schedule task"));
        return;
      }
      setNoteBody("");
      setTaskDueDate("");
      fetchContactData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteTask = async (activityId: number) => {
    const res = await completeTaskApiV1ActivitiesTasksActivityIdCompletePost({
      path: { activity_id: activityId },
    });
    if (res.error) {
      setPageError(detailFromError(res.error, "Failed to complete task"));
      return;
    }
    fetchContactData();
  };

  const openEditDialog = () => {
    if (!contact) return;
    setEditForm({
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      companyId: contact.company_id ?? null,
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setEditError(null);
      const res = await updateContactApiV1ContactsContactIdPatch({
        path: { contact_id: contactId },
        body: {
          first_name: editForm.firstName || null,
          last_name: editForm.lastName || null,
          email: editForm.email || null,
          phone: editForm.phone || null,
          company_id: editForm.companyId,
        },
      });
      if (res.error) {
        setEditError(detailFromError(res.error, "Failed to update contact"));
        return;
      }
      setIsEditOpen(false);
      fetchContactData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async () => {
    try {
      setIsDeleting(true);
      const res = await deleteContactApiV1ContactsContactIdDelete({
        path: { contact_id: contactId },
      });
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to delete contact"));
        setIsDeleting(false);
        return;
      }
      router.push("/contacts");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || !contact) {
    return (
      <div className="container mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-44 rounded-2xl" />
        {pageError && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
            {pageError}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed Contact";
  const filteredActivities = activities.filter((a) => {
    if (timelineFilter === "all") return true;
    return a.type === timelineFilter;
  });

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Contacts
        </Link>
      </div>

      {pageError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
          {pageError}
        </div>
      )}

      {/* Profile Header */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
              {contact.first_name ? contact.first_name[0] : <User className="h-7 w-7" />}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{fullName}</h1>
                {contact.do_not_call && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                    <PhoneOff className="h-3 w-3" />
                    DNC
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
                {contact.phone && (
                  <span className="flex items-center gap-1 font-mono text-foreground/80">
                    <Phone className="h-3.5 w-3.5 text-primary/70" />
                    {contact.phone}
                  </span>
                )}
                {contact.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email}
                  </span>
                )}
                <span className="flex items-center gap-1 capitalize">
                  Source: {contact.source}
                </span>
              </div>
              {(contact.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(contact.tags ?? []).map((t) => (
                    <span
                      key={t.id}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase font-semibold">Lifecycle Stage</Label>
              <Select value={stage} onValueChange={handleUpdateStage}>
                <SelectTrigger className="w-[160px] bg-background/50 border-white/10 rounded-xl">
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

            <Button
              variant="outline"
              size="sm"
              onClick={openEditDialog}
              className="rounded-xl mt-4 border-white/10"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <Button
              variant={doNotCall ? "destructive" : "outline"}
              size="sm"
              onClick={handleToggleDnc}
              className="rounded-xl mt-4 border-white/10"
            >
              <PhoneOff className="h-3.5 w-3.5 mr-1.5" />
              {doNotCall ? "DNC Enabled" : "Block Outbound"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
              className="rounded-xl mt-4 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid: Activity Timeline on Left, Deals & Metadata on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Note / Task Composer */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Button
                variant={composerTab === "note" ? "default" : "ghost"}
                size="sm"
                className="rounded-xl text-xs gap-1.5"
                onClick={() => setComposerTab("note")}
              >
                <FileText className="h-3.5 w-3.5" />
                Add Note
              </Button>
              <Button
                variant={composerTab === "task" ? "default" : "ghost"}
                size="sm"
                className="rounded-xl text-xs gap-1.5"
                onClick={() => setComposerTab("task")}
              >
                <Calendar className="h-3.5 w-3.5" />
                Create Task / Callback
              </Button>
            </div>

            <form onSubmit={composerTab === "task" ? handleAddTask : handleAddNote} className="space-y-3">
              <textarea
                className="w-full h-24 p-3 text-sm bg-background/50 border border-white/10 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={
                  composerTab === "task"
                    ? "Follow-up task details (e.g. Call back regarding pricing proposal)..."
                    : "Write an internal note about this contact or call outcome..."
                }
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <div className="flex items-center justify-between">
                {composerTab === "task" ? (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="due" className="text-xs text-muted-foreground">Due:</Label>
                    <Input
                      id="due"
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="h-8 text-xs bg-background/50 border-white/10 w-40"
                    />
                  </div>
                ) : <div />}
                <Button type="submit" size="sm" disabled={isSubmitting || !noteBody.trim()}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {composerTab === "task" ? "Schedule Task" : "Save Note"}
                </Button>
              </div>
              {composerError && (
                <div className="text-sm text-destructive">{composerError}</div>
              )}
            </form>
          </div>

          {/* Timeline Feed */}
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Activity Timeline</h2>
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-white/5">
                {(["all", "call", "note", "task"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimelineFilter(t)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium capitalize transition-colors ${
                      timelineFilter === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "all" ? "All Activity" : t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No activities recorded yet. Voice calls and notes will appear here.
                </div>
              ) : (
                filteredActivities.map((act) => {
                  const isCall = act.type === "call";
                  const isTask = act.type === "task";
                  const isCompleted = !!act.completed_at;

                  return (
                    <div
                      key={act.id}
                      className="p-4 rounded-xl bg-muted/20 border border-white/5 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {isCall ? (
                            <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
                              <PhoneCall className="h-4 w-4" />
                            </span>
                          ) : isTask ? (
                            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                              <Calendar className="h-4 w-4" />
                            </span>
                          ) : (
                            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                              <MessageSquare className="h-4 w-4" />
                            </span>
                          )}
                          <span className="font-semibold capitalize text-foreground/90">
                            {isCall ? "AI Voice Conversation" : act.type.replace("_", " ")}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {new Date(act.created_at).toLocaleString()}
                        </span>
                      </div>

                      {act.body && (
                        <p className="text-sm text-muted-foreground whitespace-pre-line pl-8">
                          {act.body}
                        </p>
                      )}

                      {isCall && act.workflow_run_id && (
                        <div className="pl-8 pt-1 flex items-center gap-3">
                          <Link href={`/recordings`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 rounded-lg border-white/10">
                              <Play className="h-3 w-3" />
                              Playback Recording
                            </Button>
                          </Link>
                          <span className="text-xs text-muted-foreground font-mono">
                            Run #{act.workflow_run_id}
                          </span>
                        </div>
                      )}

                      {isTask && (
                        <div className="pl-8 pt-1 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {act.due_at ? `Due by ${new Date(act.due_at).toLocaleDateString()}` : "No due date"}
                          </span>
                          {!isCompleted ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                              onClick={() => handleCompleteTask(act.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Mark Complete
                            </Button>
                          ) : (
                            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Associated Deals & Attributes */}
        <div className="space-y-6">
          {/* Associated Deals */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Pipeline Deals
              </h2>
              <Link href="/pipeline">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View Board
                </Button>
              </Link>
            </div>

            <div className="space-y-2.5">
              {deals.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No active deals attached to this contact.
                </div>
              ) : (
                deals.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl bg-muted/30 border border-white/5 space-y-1"
                  >
                    <div className="font-medium text-sm text-foreground">{d.title}</div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-emerald-400">
                        ${(d.value || 0).toLocaleString()} {d.currency}
                      </span>
                      <span className="capitalize px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                        {d.stage}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Custom Fields & Metadata */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold tracking-tight">Contact Attributes</h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-muted-foreground">Contact ID</span>
                <span className="font-mono text-foreground">{contact.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-muted-foreground">Created At</span>
                <span className="text-foreground">{new Date(contact.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-muted-foreground">Outbound Voice</span>
                <span className={contact.do_not_call ? "text-destructive font-medium" : "text-emerald-400 font-medium"}>
                  {contact.do_not_call ? "Blocked (DNC)" : "Eligible"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="glass-panel max-w-md border-white/10">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update this caller or prospect profile.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit_first_name">First Name</Label>
                <Input
                  id="edit_first_name"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_last_name">Last Name</Label>
                <Input
                  id="edit_last_name"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_phone">Phone Number (E.164)</Label>
              <Input
                id="edit_phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+14155552671"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Company</Label>
              <CompanyPicker
                value={editForm.companyId}
                onChange={(companyId) => setEditForm({ ...editForm, companyId })}
              />
            </div>

            {editError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                {editError}
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {fullName} and remove them from lists and campaigns.
              This action cannot be undone.
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
    </div>
  );
}
