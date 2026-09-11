import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", phase: "01-foundation" });
}
