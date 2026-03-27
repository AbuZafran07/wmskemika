import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useWebPush } from "@/hooks/useWebPush";
import { toast } from "sonner";

export function PushNotificationToggle() {
  const { isSubscribed, isLoading, subscribe, unsubscribe } = useWebPush();

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.success("Web Push Notification dinonaktifkan");
    } else {
      const success = await subscribe();
      if (success) {
        toast.success("Web Push Notification diaktifkan! Anda akan menerima notifikasi walau browser tertutup.");
      } else {
        toast.error("Gagal mengaktifkan Web Push. Pastikan izin notifikasi diberikan.");
      }
    }
  };

  return (
    <Button
      variant={isSubscribed ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSubscribed ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {isSubscribed ? "Push Aktif" : "Aktifkan Push"}
    </Button>
  );
}
