"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff, BellRing, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getCapability,
  getExistingSubscription,
  isPushConfigured,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
  type NotificationCapability,
} from "@/lib/notifications";

export function PushNotifications() {
  const [capability, setCapability] = useState<NotificationCapability>("unsupported");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [working, setWorking] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const refresh = useCallback(async () => {
    setCapability(getCapability());
    try {
      const sub = await getExistingSubscription();
      setHasSubscription(Boolean(sub));
    } catch {
      setHasSubscription(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window !== "undefined") {
      setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    }
  }, [refresh]);

  const enable = async () => {
    setWorking(true);
    try {
      const result = await requestPermission();
      setCapability(result);
      if (result !== "granted") {
        toast.error("Notification permission denied", {
          description: "Allow notifications in your browser to receive alerts when chats finish.",
        });
        return;
      }
      if (isPushConfigured()) {
        try {
          await subscribeToPush();
          setHasSubscription(true);
          toast.success("Push notifications enabled");
        } catch (err) {
          toast.error("Couldn't register push subscription", {
            description: (err as Error).message,
          });
        }
      } else {
        toast.success("Local notifications enabled", {
          description:
            "You'll be pinged when a reply finishes and the tab is in the background.",
        });
      }
    } finally {
      setWorking(false);
    }
  };

  const disable = async () => {
    setWorking(true);
    try {
      await unsubscribeFromPush();
      setHasSubscription(false);
      toast.success("Push subscription removed");
    } catch (err) {
      toast.error("Couldn't unsubscribe", { description: (err as Error).message });
    } finally {
      setWorking(false);
    }
  };

  if (capability === "unsupported") {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border/70 bg-background/40">
        <Smartphone className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Notifications unsupported</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This browser doesn't expose the Notification API. Install Wingman to your
            home screen (iOS 16.4+) for push support.
          </p>
        </div>
      </div>
    );
  }

  const granted = capability === "granted";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border/70 bg-background/40">
        <div className={`mt-0.5 shrink-0 ${granted ? "text-copilot-green" : "text-muted-foreground"}`}>
          {granted ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">Browser notifications</p>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase border ${
                granted
                  ? "border-copilot-green/30 bg-copilot-green/10 text-copilot-green"
                  : capability === "denied"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  granted
                    ? "bg-copilot-green"
                    : capability === "denied"
                    ? "bg-destructive"
                    : "bg-muted-foreground"
                }`}
              />
              {granted ? "Granted" : capability === "denied" ? "Blocked" : "Not asked"}
            </span>
            {hasSubscription && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase border border-copilot-purple/30 bg-copilot-purple/10 text-copilot-purple">
                Push subscribed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Get an alert when a long-running reply finishes while the tab is in the
            background.{" "}
            {isPushConfigured()
              ? "Server push is configured for true background delivery."
              : "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY to enable server-side push."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {granted ? (
          hasSubscription ? (
            <Button variant="outline" size="sm" onClick={disable} disabled={working}>
              {working ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5 mr-1.5" />}
              Unsubscribe
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={enable} disabled={working || !isPushConfigured()}>
              {working ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5 mr-1.5" />}
              {isPushConfigured() ? "Subscribe to push" : "Local-only (enabled)"}
            </Button>
          )
        ) : (
          <Button
            size="sm"
            onClick={enable}
            disabled={working || capability === "denied"}
            className="bg-copilot-gradient hover:opacity-90 text-white border-0"
          >
            {working ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Bell className="w-3.5 h-3.5 mr-1.5" />}
            Enable notifications
          </Button>
        )}
      </div>

      {!isStandalone && (
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
          Tip — install Wingman to your home screen for native-feel push (Add to Home
          Screen on iOS, Install App on Android/Chrome).
        </p>
      )}
    </div>
  );
}
