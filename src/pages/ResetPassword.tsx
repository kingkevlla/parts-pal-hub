import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 6) return toast({ title: "Password must be at least 6 characters", variant: "destructive" });
    if (password !== String(f.get("confirm"))) return toast({ title: "Passwords don't match", variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast({ title: "Could not change password", description: error.message, variant: "destructive" });
    toast({ title: "Password changed", description: "You're now signed in." });
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            {ready ? "Choose a new password for your account." : "Open this page from the link in your password reset email."}
          </CardDescription>
        </CardHeader>
        {ready && (
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" name="password" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" name="confirm" type="password" required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving..." : "Save password"}</Button>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
