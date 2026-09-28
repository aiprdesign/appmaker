import { SiteHeader } from "@/components/SiteHeader";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in — Appmaker" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
