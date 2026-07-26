import { NextResponse } from "next/server";
import type { SourceType } from "@prisma/client";
import { requireUserId } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { findOwnedNotebook } from "@/lib/notebooks/queries";
import { ingestionQueue } from "@/lib/queue/ingestionQueue";
import { saveSourceFile } from "@/lib/storage/local";
import { listSourcesForNotebook, serializeSource } from "@/lib/sources/queries";
import {
  ACCEPTED_MIME_BY_TYPE,
  FILE_SOURCE_TYPES,
  MAX_FILE_SIZE_BYTES,
  registerLinkSourceSchema,
  registerPastedTextSourceSchema,
} from "@/lib/sources/validation";

type RouteParams = { params: Promise<{ id: string }> };
type FileSourceType = (typeof FILE_SOURCE_TYPES)[number];

function isFileSourceType(value: string): value is FileSourceType {
  return (FILE_SOURCE_TYPES as readonly string[]).includes(value);
}

export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;
  const notebook = await findOwnedNotebook(notebookId, userId);
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const sources = await listSourcesForNotebook(notebookId);
  return NextResponse.json({ sources });
}

async function handleFileUpload(request: Request, notebookId: string) {
  const form = await request.formData();
  const typeRaw = form.get("type");
  const file = form.get("file");
  const titleRaw = form.get("title");

  if (typeof typeRaw !== "string" || !isFileSourceType(typeRaw)) {
    return NextResponse.json(
      { error: `type must be one of ${FILE_SOURCE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 }
    );
  }

  const acceptedMimes = ACCEPTED_MIME_BY_TYPE[typeRaw];
  if (file.type && !acceptedMimes.includes(file.type)) {
    return NextResponse.json(
      { error: `Unexpected file type "${file.type}" for a ${typeRaw} source` },
      { status: 400 }
    );
  }

  const title = (typeof titleRaw === "string" && titleRaw.trim()) || file.name;

  const source = await prisma.source.create({
    data: { notebookId, type: typeRaw as SourceType, title, status: "QUEUED" },
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveSourceFile(notebookId, source.id, file.name, buffer);
  const updated = await prisma.source.update({
    where: { id: source.id },
    data: { storagePath },
  });

  await ingestionQueue.add("ingest", { sourceId: source.id });
  return NextResponse.json({ source: serializeSource(updated) }, { status: 202 });
}

async function handleJsonRegister(request: Request, notebookId: string) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const typeValue =
    typeof body === "object" && body !== null && "type" in body
      ? (body as { type?: unknown }).type
      : undefined;

  if (typeValue === "URL" || typeValue === "YOUTUBE") {
    const parsed = registerLinkSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const source = await prisma.source.create({
      data: {
        notebookId,
        type: parsed.data.type,
        title: parsed.data.title || parsed.data.originUrl,
        originUrl: parsed.data.originUrl,
        status: "QUEUED",
      },
    });
    await ingestionQueue.add("ingest", { sourceId: source.id });
    return NextResponse.json({ source: serializeSource(source) }, { status: 202 });
  }

  if (typeValue === "TEXT") {
    const parsed = registerPastedTextSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const source = await prisma.source.create({
      data: {
        notebookId,
        type: "TEXT",
        title: parsed.data.title || "Pasted text",
        status: "QUEUED",
        metadata: { pastedText: parsed.data.pastedText },
      },
    });
    await ingestionQueue.add("ingest", { sourceId: source.id });
    return NextResponse.json({ source: serializeSource(source) }, { status: 202 });
  }

  return NextResponse.json(
    { error: "type must be one of PDF, TEXT, URL, YOUTUBE, VTT" },
    { status: 400 }
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;
  const notebook = await findOwnedNotebook(notebookId, userId);
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleFileUpload(request, notebookId);
  }
  return handleJsonRegister(request, notebookId);
}
