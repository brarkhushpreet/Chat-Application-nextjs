"use client";

import { ArrowDown, KeyRound, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { type FormEvent, useRef, useState } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_ENTRY_PATH } from "@/lib/demo";

interface AuthCardProps {
  intent?: "signin" | "signup";
  error?: string;
}

const errorMessages: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email already belongs to another login method. Use the method you chose first.",
  OAuthCallbackError: "GitHub could not complete sign-in. Please try again.",
  OAuthSignin: "GitHub sign-in could not be started. Please try again.",
  AccessDenied: "Access was denied. Choose another GitHub account or try again.",
  Configuration: "Authentication is not configured yet. Check the Auth.js environment variables.",
  CredentialsSignin: "The email or password is incorrect.",
};

export function AuthCard({ intent = "signin", error }: AuthCardProps) {
  const isMounted = useMounted();
  const isSignup = intent === "signup";
  const formRef = useRef<HTMLFormElement>(null);
  const [demoFilled, setDemoFilled] = useState(false);
  const [message, setMessage] = useState<string | null>(
    error ? errorMessages[error] ?? "Sign-in did not complete. Please try again." : null,
  );
  const [pending, setPending] = useState<"github" | "credentials" | null>(null);

  const fillDemo = () => {
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = DEMO_EMAIL;
    (form.elements.namedItem("password") as HTMLInputElement).value = DEMO_PASSWORD;
    setMessage(null);
    setDemoFilled(true);
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  };

  const handleGitHub = async () => {
    setMessage(null);
    setPending("github");

    try {
      const result = await signIn("github", {
        redirect: false,
        redirectTo: "/",
      });

      if (!result?.ok || result.error || !result.url) {
        setMessage("GitHub sign-in could not be started. Please try again.");
        return;
      }

      window.location.assign(result.url);
    } catch {
      setMessage("GitHub sign-in is temporarily unavailable. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const handleCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setPending("credentials");

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    try {
      if (isSignup) {
        if (password !== confirmation) {
          setMessage("Passwords do not match.");
          return;
        }

        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setMessage(payload.error ?? "Account creation failed. Please try again.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        redirectTo: email.trim().toLowerCase() === DEMO_EMAIL ? DEMO_ENTRY_PATH : "/",
      });

      if (!result?.ok || result.error || !result.url) {
        setMessage(
          result?.error === "CredentialsSignin"
            ? "The email or password is incorrect. If you registered with GitHub, use Continue with GitHub."
            : errorMessages[result?.error ?? ""] ?? "Sign-in could not be completed. Please try again.",
        );
        return;
      }

      // Load the authenticated page with the new session instead of reusing
      // an unauthenticated route that the client router may have cached.
      window.location.assign(result.url);
    } catch {
      setMessage("Authentication is temporarily unavailable. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const isPending = !isMounted || pending !== null;

  return (
    <div className="auth-card w-full max-w-[440px] rounded-[20px] border p-6 sm:p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7567ff]/10 text-[#6959f6] dark:text-[#a39bff]">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-[-0.035em]">
          {isSignup ? "Create your Nexus account" : "Welcome back"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isSignup
            ? "Sign up with email and password, or continue with GitHub."
            : "Use your email and password, or continue with GitHub."}
        </p>
      </div>

      {message && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-rose-500/15 bg-rose-500/[0.08] px-4 py-3 text-xs leading-5 text-rose-600 dark:text-rose-300"
        >
          {message}
        </div>
      )}

      {!isMounted && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Loading sign-in… If this persists, reload the page and check that JavaScript is enabled.
        </p>
      )}

      {!isSignup && (
        <div className="mb-6 rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
          <p className="text-sm font-semibold text-foreground">Just looking around?</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Explore a sample team, group chats, and direct messages. No signup needed.</p>
          <button type="button" onClick={fillDemo} disabled={isPending} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50">
            Fill dummy email <ArrowDown className="h-3.5 w-3.5" />
          </button>
          {demoFilled && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">Demo email and password filled. Select Sign in with email to explore.</p>}
        </div>
      )}

      <form ref={formRef} method="post" onSubmit={handleCredentials}>
        <fieldset disabled={isPending} className="space-y-3">
        {isSignup && (
          <AuthInput
            icon={<UserRound className="h-4 w-4" />}
            label="Display name"
            name="name"
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={50}
          />
        )}
        <AuthInput
          icon={<Mail className="h-4 w-4" />}
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
        />
        <AuthInput
          icon={<KeyRound className="h-4 w-4" />}
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          maxLength={72}
        />
        {isSignup && (
          <AuthInput
            icon={<KeyRound className="h-4 w-4" />}
            label="Confirm password"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
          />
        )}

        <button
          type="submit"
          disabled={isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
        >
          {pending === "credentials" && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {isSignup ? "Create account" : "Sign in with email"}
        </button>
        </fieldset>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.08]" />
        or
        <span className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.08]" />
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={handleGitHub}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#242734] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#343848] disabled:pointer-events-none disabled:opacity-60 dark:bg-[#171923] dark:text-white dark:hover:bg-[#252836]"
      >
        {pending === "github" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GitHubMark />}
        Continue with GitHub
      </button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {isSignup ? "Already have an account?" : "New to Nexus?"}{" "}
        <Link
          href={isSignup ? "/sign-in" : "/sign-up"}
          className="font-bold text-[#6959f6] hover:underline dark:text-[#a39bff]"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}

interface AuthInputProps {
  icon: React.ReactNode;
  label: string;
  name: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
}

function AuthInput({ icon, label, ...props }: AuthInputProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-foreground">{label}</span>
      <span className="auth-field flex h-12 items-center gap-3 rounded-xl border px-4 text-muted-foreground transition-colors">
        {icon}
        <input
          {...props}
          required
          placeholder={label}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground"
        />
      </span>
    </label>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.98 10.98 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}
