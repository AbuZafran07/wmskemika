import { useState, useEffect, useCallback } from 'react';

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(() => {
    const saved = localStorage.getItem('push_notifications_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    // Check if notifications are supported
    if ('Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      console.log('Push notifications not supported');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const toggleEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    localStorage.setItem('push_notifications_enabled', JSON.stringify(enabled));
  }, []);

  const sendNotification = useCallback(
    async (options: PushNotificationOptions) => {
      if (!isSupported || !isEnabled) {
        console.log('Push notifications disabled or not supported');
        return null;
      }

      // Request permission if not granted
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          console.log('Notification permission denied');
          return null;
        }
      }

      try {
        const notification = new Notification(options.title, {
          body: options.body,
          icon: options.icon || '/logo-kemika.png',
          tag: options.tag,
          requireInteraction: options.requireInteraction ?? false,
        });

        if (options.onClick) {
          notification.onclick = () => {
            window.focus();
            options.onClick?.();
            notification.close();
          };
        }

        // Auto-close after 5 seconds if not require interaction
        if (!options.requireInteraction) {
          setTimeout(() => {
            notification.close();
          }, 5000);
        }

        return notification;
      } catch (error) {
        console.error('Error creating notification:', error);
        return null;
      }
    },
    [isSupported, isEnabled, permission, requestPermission]
  );

  // Notification helpers for specific types
  const notifyApprovalPending = useCallback(
    (refNo: string, module: string, onClick?: () => void) => {
      const moduleNames: Record<string, string> = {
        plan_order: 'Plan Order',
        sales_order: 'Sales Order',
        stock_adjustment: 'Stock Adjustment',
      };

      return sendNotification({
        title: '🔔 Approval Required',
        body: `${moduleNames[module] || module} ${refNo} needs your approval`,
        tag: `approval_${refNo}`,
        requireInteraction: true,
        onClick,
      });
    },
    [sendNotification]
  );

  const notifyLowStock = useCallback(
    (productName: string, currentStock: number, minStock: number, onClick?: () => void) => {
      return sendNotification({
        title: '⚠️ Low Stock Alert',
        body: `${productName} is low on stock (${currentStock}/${minStock} units)`,
        tag: `low_stock_${productName}`,
        requireInteraction: false,
        onClick,
      });
    },
    [sendNotification]
  );

  const notifyExpiringSoon = useCallback(
    (productName: string, batchNo: string, daysUntilExpiry: number, onClick?: () => void) => {
      return sendNotification({
        title: '⏰ Expiring Soon',
        body: `${productName} (Batch: ${batchNo}) expires in ${daysUntilExpiry} days`,
        tag: `expiring_${batchNo}`,
        requireInteraction: daysUntilExpiry <= 7,
        onClick,
      });
    },
    [sendNotification]
  );

  const notifyExpired = useCallback(
    (productName: string, batchNo: string, onClick?: () => void) => {
      return sendNotification({
        title: '🚨 Batch Expired',
        body: `${productName} (Batch: ${batchNo}) has expired!`,
        tag: `expired_${batchNo}`,
        requireInteraction: true,
        onClick,
      });
    },
    [sendNotification]
  );

  const notifyNewOrder = useCallback(
    (orderNo: string, type: 'plan_order' | 'sales_order', onClick?: () => void) => {
      const typeNames = {
        plan_order: 'Plan Order',
        sales_order: 'Sales Order',
      };

      return sendNotification({
        title: '📦 New Order',
        body: `New ${typeNames[type]} ${orderNo} has been created`,
        tag: `new_order_${orderNo}`,
        requireInteraction: false,
        onClick,
      });
    },
    [sendNotification]
  );

  const notifyStatusChange = useCallback(
    (refNo: string, status: 'approved' | 'cancelled' | 'rejected', onClick?: () => void) => {
      const statusIcons: Record<string, string> = {
        approved: '✅',
        cancelled: '❌',
        rejected: '🚫',
      };

      return sendNotification({
        title: `${statusIcons[status]} Status Update`,
        body: `${refNo} has been ${status}`,
        tag: `status_${refNo}`,
        requireInteraction: false,
        onClick,
      });
    },
    [sendNotification]
  );

  return {
    isSupported,
    permission,
    isEnabled,
    requestPermission,
    toggleEnabled,
    sendNotification,
    // Specific notification helpers
    notifyApprovalPending,
    notifyLowStock,
    notifyExpiringSoon,
    notifyExpired,
    notifyNewOrder,
    notifyStatusChange,
  };
}
