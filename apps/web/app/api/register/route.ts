import { NextResponse } from "next/server";
import { z } from "zod";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(10).max(128),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Invalid request body" } },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: parsed.error.issues[0]?.message ?? "Check your details and try again.",
        },
      },
      { status: 422 },
    );
  }
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }
    return NextResponse.json({ ok: true, user: payload.user }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "backend_unreachable",
          message: "The AETHER API is not reachable right now. Please try again.",
        },
      },
      { status: 502 },
    );
  }
}
