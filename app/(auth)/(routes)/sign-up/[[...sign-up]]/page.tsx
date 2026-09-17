import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, query] = await Promise.all([auth(), searchParams]);
  if (session?.user) redirect("/");

  return <AuthCard intent="signup" error={query.error} />;
}
