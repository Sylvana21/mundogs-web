import { supabase, supabaseConfigured } from "./supabase";

const BUCKET = "pet-photos";

/**
 * Sube una foto a Supabase Storage y regresa la URL pública.
 * Si Supabase no está configurado, regresa null.
 */
export async function uploadPetPhoto(
  file: File,
  appointmentId: string,
  petName: string,
  photoIndex: number
): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null;

  const ext = file.name.split(".").pop() ?? "jpg";
  const safePetName = petName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const path = `${appointmentId}/${safePetName}_${photoIndex}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("Error subiendo foto:", error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Borra todas las fotos de una cita del Storage.
 */
export async function deleteAppointmentPhotos(
  appointmentId: string
): Promise<void> {
  if (!supabaseConfigured || !supabase) return;

  // Listar archivos en la carpeta de esa cita
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(appointmentId);

  if (listError || !files || files.length === 0) return;

  const paths = files.map((f) => `${appointmentId}/${f.name}`);
  await supabase.storage.from(BUCKET).remove(paths);
}

/**
 * Borra una foto específica por su URL pública.
 */
export async function deletePhotoByUrl(url: string): Promise<void> {
  if (!supabaseConfigured || !supabase) return;

  // Extraer el path del bucket desde la URL pública
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;

  const path = url.slice(idx + marker.length);
  await supabase.storage.from(BUCKET).remove([path]);
}
