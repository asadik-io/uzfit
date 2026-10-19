import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";

/** Serves venue photos uploaded through the partner editor (kept in the demo's memory). */
export async function GET(_request: Request, context: RouteContext<"/media/[...path]">) {
  const { path } = await context.params;
  const upload = getStore().uploads.get(path.join("/"));
  if (!upload) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(Buffer.from(upload.bytes), {
    status: 200,
    headers: {
      "Content-Type": upload.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
