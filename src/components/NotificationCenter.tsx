
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function NotificationCenter() {
  const [notifications] = useState([
    {
      id: '1',
      title: 'Welcome to StudioCheck',
      message: 'Your account has been created successfully.',
      type: 'system',
      isRead: false,
      createdAt: new Date().toISOString(),
    },
  ]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Stay updated with your analysis progress and system alerts.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {notifications.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              No notifications yet.
            </p>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border ${
                  notification.isRead ? 'bg-slate-50' : 'bg-blue-50 border-blue-200'
                }`}
              >
                <h4 className="font-medium text-slate-900 mb-1">
                  {notification.title}
                </h4>
                <p className="text-sm text-slate-600 mb-2">
                  {notification.message}
                </p>
                <span className="text-xs text-slate-500">
                  {new Date(notification.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
