import { NextResponse } from "next/server";

export function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("behemoth_session", "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
