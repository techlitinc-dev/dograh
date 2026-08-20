"use client";

import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Plus,
  User,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  completeTaskApiV1ActivitiesTasksActivityIdCompletePost,
  createActivityApiV1ActivitiesPost,
  listOpenTasksApiV1ActivitiesTasksGet,
} from "@/client/sdk.gen";
import type { ActivityResponse } from "@/client/types.gen";
import { ContactPicker } from "@/components/crm/ContactPicker";
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

export default function TasksPage() {
  const { user, redirectToLogin, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<ActivityResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // New task form
  const [taskContactId, setTaskContactId] = useState<number | null>(null);
  const [taskBody, setTaskBody] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      redirectToLogin();
    }
  }, [authLoading, user, redirectToLogin]);

  // The tasks endpoint lists open tasks only; there is no completed filter.
  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const res = await listOpenTasksApiV1ActivitiesTasksGet();
      if (res.error) {
        setPageError(detailFromError(res.error, "Failed to load tasks"));
        return;
      }
      setTasks(res.data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchTasks();
  }, [authLoading, user, fetchTasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskContactId || !taskBody.trim()) return;
    try {
      setIsSubmitting(true);
      setFormError(null);
      const res = await createActivityApiV1ActivitiesPost({
        body: {
          contact_id: taskContactId,
          type: "task",
          body: taskBody,
          due_at: taskDueDate ? new Date(taskDueDate).toISOString() : null,
        },
      });
      if (res.error) {
        setFormError(detailFromError(res.error, "Failed to create task"));
        return;
      }
      setIsAddOpen(false);
      setTaskContactId(null);
      setTaskBody("");
      setTaskDueDate("");
      fetchTasks();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    const res = await completeTaskApiV1ActivitiesTasksActivityIdCompletePost({
      path: { activity_id: taskId },
    });
    if (res.error) {
      setPageError(detailFromError(res.error, "Failed to complete task"));
      return;
    }
    fetchTasks();
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Tasks & Callbacks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Follow-up tasks, callback requests, and scheduled agent actions.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-semibold text-muted-foreground">
            {tasks.length} Open {tasks.length === 1 ? "Task" : "Tasks"}
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
            onClick={() => {
              setFormError(null);
              setIsAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Task List */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        {pageError && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
            {pageError}
          </div>
        )}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : tasks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-400/50" />
              <div className="font-semibold text-foreground">You are all caught up!</div>
              <p className="text-xs mt-1">No open callbacks or follow-up tasks pending.</p>
            </div>
          ) : (
            tasks.map((task) => {
              const isOverdue = task.due_at && new Date(task.due_at) < new Date();
              return (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-muted/20 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                      <span className="p-1 rounded bg-blue-500/10 text-blue-400">
                        <Calendar className="h-3.5 w-3.5" />
                      </span>
                      {task.body || "Follow up with contact"}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pl-6">
                      <Link
                        href={`/contacts/${task.contact_id}`}
                        className="hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <User className="h-3 w-3" />
                        View Contact #{task.contact_id}
                      </Link>
                      {task.due_at && (
                        <span className={isOverdue ? "text-destructive font-medium" : ""}>
                          Due: {new Date(task.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <Link href={`/contacts/${task.contact_id}`}>
                      <Button variant="outline" size="sm" className="h-8 text-xs border-white/10">
                        Open Contact
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={() => handleCompleteTask(task.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Mark Done
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* New Task Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="glass-panel max-w-md border-white/10">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>
              Schedule a follow-up task or callback for a contact.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contact *</Label>
              <ContactPicker value={taskContactId} onChange={setTaskContactId} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task_body">Task Details *</Label>
              <textarea
                id="task_body"
                className="w-full h-24 p-3 text-sm bg-background/50 border border-white/10 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Call back regarding pricing proposal..."
                value={taskBody}
                onChange={(e) => setTaskBody(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task_due">Due Date</Label>
              <Input
                id="task_due"
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="bg-background/50 border-white/10"
              />
            </div>

            {formError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                {formError}
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !taskContactId || !taskBody.trim()}>
                {isSubmitting ? "Creating..." : "Create Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
