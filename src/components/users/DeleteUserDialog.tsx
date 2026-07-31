import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { offlineMutate } from "@/lib/offlineHelpers";

import { Loader2 } from "lucide-react";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  onSuccess: () => void;
}

export default function DeleteUserDialog({
  open,
  onOpenChange,
  userId,
  userName,
  onSuccess
}: DeleteUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      // Delete user roles first
      const rolesRes = await offlineMutate("user_roles", "delete", null, { user_id: userId });
      if (!rolesRes.success) throw rolesRes.error ?? new Error("Failed to delete user roles");

      // Delete profile (this will cascade delete the auth user due to FK constraint)
      const profileRes = await offlineMutate("profiles", "delete", null, { id: userId });
      if (!profileRes.success) throw profileRes.error ?? new Error("Failed to delete profile");


      toast({ title: "User deleted successfully" });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error deleting user",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the user <strong>{userName}</strong> and all associated data.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete User
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
