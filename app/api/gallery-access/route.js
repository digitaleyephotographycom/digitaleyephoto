import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getIndex, getGallery } from "@/lib/store";
import { signToken, verifyToken } from "@/lib/token";
import { signedUrlFor } from "@/lib/b2";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();
    const { code, password, token } = body || {};

    // Allow refreshing signed URLs with an active session token
    if (token && !code && !password) {
      const payload = verifyToken(token);
      if (!payload) {
        return NextResponse.json(
          { error: "Session expired — please enter code and password again." },
          { status: 401 }
        );
      }
      const gallery = await getGallery(payload.galleryId);
      if (!gallery) {
        return NextResponse.json(
          { error: "Gallery not found." },
          { status: 404 }
        );
      }

      if (gallery.status === "DRAFT" || gallery.status === "ARCHIVED") {
        return NextResponse.json(
          { error: "This gallery is not currently accessible." },
          { status: 403 }
        );
      }

      const photos = await Promise.all(
        (gallery.photos || []).map(async (p) => ({
          id: p.id,
          name: p.name,
          url: p.key ? await signedUrlFor(p.key, 3600) : null,
        }))
      );
      return NextResponse.json({
        token,
        gallery: {
          id: gallery.id,
          name: gallery.name,
          customerName: gallery.customerName || "",
          type: gallery.type,
          eventDate: gallery.eventDate || "",
          status: gallery.status,
          selectionStatus: gallery.selectionStatus,
          selectionLocked: Boolean(gallery.selectionLocked),
          selectionSubmittedAt: gallery.selectionSubmittedAt,
          selections: gallery.selections || [],
          photos,
        },
      });
    }

    if (!code?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Enter the gallery code and password." },
        { status: 400 }
      );
    }

    const index = await getIndex();
    const entry = index.galleries.find(
      (g) => g.code.toUpperCase() === code.trim().toUpperCase()
    );
    if (!entry) {
      return NextResponse.json(
        { error: "No gallery found with that code." },
        { status: 404 }
      );
    }

    const gallery = await getGallery(entry.id);
    if (!gallery) {
      return NextResponse.json(
        { error: "No gallery found with that code." },
        { status: 404 }
      );
    }

    if (gallery.status === "DRAFT" || gallery.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "This gallery is not currently accessible." },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(password, gallery.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const sessionToken = signToken(gallery.id);

    // Generate fresh short-lived signed GET URLs for client photo viewing
    const photos = await Promise.all(
      (gallery.photos || []).map(async (p) => ({
        id: p.id,
        name: p.name,
        url: p.key ? await signedUrlFor(p.key, 3600) : null,
      }))
    );

    return NextResponse.json({
      token: sessionToken,
      gallery: {
        id: gallery.id,
        name: gallery.name,
        customerName: gallery.customerName || "",
        type: gallery.type,
        eventDate: gallery.eventDate || "",
        status: gallery.status,
        selectionStatus: gallery.selectionStatus,
        selectionLocked: Boolean(gallery.selectionLocked),
        selectionSubmittedAt: gallery.selectionSubmittedAt,
        selections: gallery.selections || [],
        photos,
      },
    });
  } catch (err) {
    console.error("Gallery access error:", err);
    return NextResponse.json(
      { error: "Could not access gallery." },
      { status: 500 }
    );
  }
}
