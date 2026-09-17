import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { registrationSchema } from "@/lib/auth-validation";
import { db } from "@/lib/db";
import { DEMO_EMAIL } from "@/lib/demo";

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const requestHost = forwardedHost ?? request.headers.get("host");
    let originHost: string | null = null;

    try {
      originHost = new URL(origin).host;
    } catch {
      // Invalid or opaque origins are never allowed to create accounts.
    }

    if (!requestHost || originHost !== requestHost) {
      return jsonError("Cross-origin registration is not allowed.", 403);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid account details.", 400);
  }

  if (parsed.data.email === DEMO_EMAIL) {
    return jsonError("Use the demo button to explore, or register with your own email.", 400);
  }

  const existingUser = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existingUser) {
    return jsonError("An account with this email already exists.", 409);
  }

  const passwordHash = await hash(parsed.data.password, 12);

  try {
    await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
      },
      select: { id: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return jsonError("An account with this email already exists.", 409);
    }
    throw error;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
