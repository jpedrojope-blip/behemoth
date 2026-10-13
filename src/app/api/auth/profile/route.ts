import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { updateUserProfile } from "@/lib/auth-store";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { profileFromUser, userFromRequest } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 512 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function hasImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  return file.type === "image/webp"
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function ensureAvatarBucket() {
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.storage.getBucket(BUCKET);
  if (existing?.public) return admin;
  if (existing) {
    const { error } = await admin.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: `${MAX_AVATAR_BYTES}`,
      allowedMimeTypes: Object.keys(EXTENSIONS),
    });
    if (error) throw error;
    return admin;
  }

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_AVATAR_BYTES}`,
    allowedMimeTypes: Object.keys(EXTENSIONS),
  });
  if (error) {
    const { data: createdByAnotherRequest } = await admin.storage.getBucket(BUCKET);
    if (!createdByAnotherRequest) throw error;
  }
  return admin;
}

export async function PATCH(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Entre novamente para editar seu perfil." }, { status: 401 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Não foi possível ler os dados do perfil." }, { status: 400 }); }

  const displayNameValue = form.get("displayName");
  const displayName = typeof displayNameValue === "string" ? displayNameValue.trim() : "";
  if (!displayName || displayName.length > 60) {
    return NextResponse.json({ error: "Informe um nome de exibição com até 60 caracteres." }, { status: 400 });
  }

  const avatarValue = form.get("avatar");
  const avatar = avatarValue instanceof File && avatarValue.size > 0 ? avatarValue : null;
  const removeAvatar = form.get("removeAvatar") === "true";
  if (avatar && !EXTENSIONS[avatar.type]) {
    return NextResponse.json({ error: "Use uma foto JPG, PNG ou WebP." }, { status: 415 });
  }
  if (avatar && !(await hasImageSignature(avatar))) {
    return NextResponse.json({ error: "O arquivo enviado não parece ser uma imagem válida." }, { status: 415 });
  }
  if (avatar && avatar.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "A foto deve ter no máximo 512 KB depois da otimização." }, { status: 413 });
  }

  if (!("user_metadata" in user)) {
    const avatarUrl = avatar
      ? `data:${avatar.type};base64,${Buffer.from(await avatar.arrayBuffer()).toString("base64")}`
      : removeAvatar ? null : undefined;
    const updated = updateUserProfile(user.id, displayName, avatarUrl);
    if (!updated) return NextResponse.json({ error: "Não encontramos essa conta." }, { status: 404 });
    return NextResponse.json({ user: profileFromUser(updated) });
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try { admin = getSupabaseAdmin(); }
  catch { return NextResponse.json({ error: "Não foi possível salvar seu perfil. Confira a conexão com o Supabase." }, { status: 503 }); }

  const metadata: Record<string, unknown> = { ...user.user_metadata, name: displayName, display_name: displayName };
  const previousPath = typeof user.user_metadata.avatar_path === "string" ? user.user_metadata.avatar_path : null;
  let newPath: string | null = null;
  let avatarUrl: string | null = typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null;

  if (avatar) {
    try { admin = await ensureAvatarBucket(); }
    catch { return NextResponse.json({ error: "Não foi possível preparar o armazenamento da foto. Tente novamente." }, { status: 503 }); }
    const extension = EXTENSIONS[avatar.type];
    newPath = `${user.id}/${randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(BUCKET).upload(newPath, Buffer.from(await avatar.arrayBuffer()), {
      contentType: avatar.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return NextResponse.json({ error: "Não foi possível enviar sua foto. Tente novamente." }, { status: 502 });
    avatarUrl = admin.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
    metadata.avatar_url = avatarUrl;
    metadata.avatar_path = newPath;
  } else if (removeAvatar) {
    delete metadata.avatar_url;
    delete metadata.avatar_path;
    avatarUrl = null;
  }

  const { error: profileError } = await admin.auth.admin.updateUserById(user.id, { user_metadata: metadata });
  if (profileError) {
    if (newPath) await admin.storage.from(BUCKET).remove([newPath]);
    return NextResponse.json({ error: "Não foi possível salvar seu perfil. Tente novamente." }, { status: 502 });
  }

  if (previousPath && (removeAvatar || (newPath && previousPath !== newPath))) {
    await admin.storage.from(BUCKET).remove([previousPath]);
  }

  return NextResponse.json({ user: { id: user.id, email: user.email ?? "", name: displayName, avatarUrl } });
}
