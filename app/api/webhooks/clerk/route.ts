import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  let event: WebhookEvent;
  try {
    event = new Webhook(webhookSecret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Clerk webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const { id, email_addresses, first_name, last_name, image_url } = event.data;
      const primaryEmail = email_addresses.find(
        (e) => e.id === event.data.primary_email_address_id
      )?.email_address ?? email_addresses[0]?.email_address;

      if (!primaryEmail) {
        console.error(`Clerk user ${id} has no email address; skipping upsert`);
        break;
      }

      const name = [first_name, last_name].filter(Boolean).join(" ") || null;

      await prisma.user.upsert({
        where: { id },
        create: { id, email: primaryEmail, name, imageUrl: image_url ?? null },
        update: { email: primaryEmail, name, imageUrl: image_url ?? null },
      });
      break;
    }
    case "user.deleted": {
      const id = event.data.id;
      if (id) {
        await prisma.user.deleteMany({ where: { id } });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
