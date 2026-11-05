import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Clock, WifiOff, Printer } from "lucide-react";
import { maybeAutoBackup } from "@/components/settings/BackupPanel";

const STEPS = [
  { icon: ShoppingCart, title: "Make a sale", text: "Open Point of Sale, tap products to add them to the cart, then tap Pay Now." },
  { icon: Clock, title: "Hold a bill", text: "Tap Pending to save the cart for later. Open it from the Pending tab when the customer is ready to pay." },
  { icon: Printer, title: "Print receipts", text: "After paying, press the printer button on the receipt." },
  { icon: WifiOff, title: "No internet? Keep selling", text: "Sales are saved on this device and sent automatically when the internet comes back." },
];

export function WelcomeGuide() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const key = user ? `welcome_seen_${user.id}` : "";

  useEffect(() => {
    if (!user) return;
    if (!localStorage.getItem(key)) setOpen(true);
    maybeAutoBackup();
  }, [user, key]);

  const finish = (goPos: boolean) => {
    localStorage.setItem(key, "1");
    setOpen(false);
    if (goPos) navigate("/pos");
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center">{s.title}</DialogTitle>
          <DialogDescription className="text-center">{s.text}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i === step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => finish(false)}>Skip</Button>
          {last ? (
            <Button onClick={() => finish(true)}>Start selling</Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
