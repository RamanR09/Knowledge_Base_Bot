import { MessagesSquareIcon } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <MessagesSquareIcon aria-hidden className="size-5 text-primary" />
        KB-Chat
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
