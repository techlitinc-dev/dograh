"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  listOrganizationMembersApiV1OrganizationsMembersGet,
  removeOrganizationMemberApiV1OrganizationsMembersUserIdDelete,
  updateOrganizationMemberRoleApiV1OrganizationsMembersUserIdPatch,
} from "@/client/sdk.gen";
import type { OrganizationMember, OrganizationRole } from "@/client/types.gen";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrgConfig } from "@/context/OrgConfigContext";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const ORG_ROLES: OrganizationRole[] = ["owner", "admin", "agent"];

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        role === "owner" && "border-cta/40 bg-cta/15 text-cta",
        role === "admin" &&
          "border-glow/40 bg-glow/15 text-glow drop-shadow-[0_0_6px_var(--glow)]",
        role === "agent" && "text-muted-foreground",
      )}
    >
      {role}
    </Badge>
  );
}

export function TeamMembersSection() {
  const { user, loading: authLoading } = useAuth();
  const { role } = useOrgConfig();
  const hasFetched = useRef(false);

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);

  const isOwner = role === "owner";

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const result =
        await listOrganizationMembersApiV1OrganizationsMembersGet();

      if (result.error) {
        toast.error(
          detailFromError(result.error, "Failed to load team members"),
        );
        return;
      }

      setMembers(result.data ?? []);
    } catch {
      toast.error("Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user || hasFetched.current) {
      return;
    }
    hasFetched.current = true;
    void fetchMembers();
  }, [authLoading, user, fetchMembers]);

  async function handleRoleChange(
    member: OrganizationMember,
    nextRole: OrganizationRole,
  ) {
    if (nextRole === member.role) return;
    try {
      const result =
        await updateOrganizationMemberRoleApiV1OrganizationsMembersUserIdPatch(
          {
            path: { user_id: member.user_id },
            body: { role: nextRole },
          },
        );

      if (result.error) {
        toast.error(detailFromError(result.error, "Failed to update role"));
        return;
      }

      toast.success(`Updated ${member.email ?? "member"} to ${nextRole}`);
      await fetchMembers();
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result =
        await removeOrganizationMemberApiV1OrganizationsMembersUserIdDelete({
          path: { user_id: removeTarget.user_id },
        });

      if (result.error) {
        toast.error(detailFromError(result.error, "Failed to remove member"));
        return;
      }

      toast.success(`${removeTarget.email ?? "Member"} removed`);
      setRemoveTarget(null);
      await fetchMembers();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            {isOwner && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.user_id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="truncate">{member.email ?? "—"}</span>
                  {member.is_you && (
                    <Badge variant="secondary" className="shrink-0">
                      You
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {isOwner && !member.is_you ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      void handleRoleChange(member, value as OrganizationRole)
                    }
                  >
                    <SelectTrigger className="h-8 w-32 capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_ROLES.map((orgRole) => (
                        <SelectItem
                          key={orgRole}
                          value={orgRole}
                          className="capitalize"
                        >
                          {orgRole}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <RoleBadge role={member.role} />
                )}
              </TableCell>
              {isOwner && (
                <TableCell className="text-right">
                  {!member.is_you && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(member)}
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.email ?? "This member"} will lose access to this
              workspace. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              {removing ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
