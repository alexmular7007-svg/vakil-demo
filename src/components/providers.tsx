"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "./sw-register";
import { ConfirmProvider } from "./ui/confirm";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConfirmProvider>{children}</ConfirmProvider>
      <ServiceWorkerRegister />
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </ThemeProvider>
  );
}
