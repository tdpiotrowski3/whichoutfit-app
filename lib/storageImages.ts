import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-renderable signed URLs for closet cutouts.
//
// The iOS app stores background-removed cutouts as HEIC-with-alpha in the private
// `closet-images` bucket (mislabeled content-type image/jpeg). Every browser EXCEPT
// Safari fails to decode HEIC, so a raw signed URL renders as a broken image.
//
// Fix (Supabase Pro): route each image through the Storage image-transform endpoint.
// HEIC is supported as a transform SOURCE, and the endpoint auto-serves WebP to the
// browser (which preserves the cutout's alpha) — so the image renders everywhere.
//
// The batch `createSignedUrls` cannot carry a transform (the transform is embedded in
// each signed token), so we sign per-path with `createSignedUrl` in parallel. Returns
// the same `{ path, signedUrl, error }[]` shape (in input order) as `createSignedUrls`,
// making it a drop-in replacement.

const TRANSFORM = { width: 800, quality: 80, resize: "contain" as const };

export type SignedImage = { path: string; signedUrl: string | null; error: string | null };

export async function createSignedImageUrls(
  sb: SupabaseClient,
  bucket: string,
  paths: string[],
  expiresIn: number,
): Promise<SignedImage[]> {
  return Promise.all(
    paths.map(async (path): Promise<SignedImage> => {
      const { data, error } = await sb.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn, { transform: TRANSFORM });
      return { path, signedUrl: data?.signedUrl ?? null, error: error ? error.message : null };
    }),
  );
}
