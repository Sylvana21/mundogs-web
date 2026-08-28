import { supabase, supabaseConfigured } from "./supabase";

export type PetEntry = {
  pet_name: string;
  pet_species: string;
  pet_breed: string;
  pet_size: "chico" | "mediano" | "grande";
  service_id: string;
  service_name: string;
  photo_urls?: string[]; // URLs de fotos en Supabase Storage
};

export type AppointmentInput = {
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  pets: PetEntry[];
  location_type: "local" | "movil" | "taxipet";
  address: string | null;
  date: string;
  time: string;
  notes: string | null;
};

export type Appointment = AppointmentInput & {
  id: string;
  status: "pendiente" | "confirmada" | "cancelada" | "completada";
  created_at: string;
};

const LOCAL_KEY = "mundogs_appointments_demo";

function readLocal(): Appointment[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Appointment[]) : [];
  } catch { return []; }
}

function writeLocal(items: Appointment[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

export async function createAppointment(
  input: AppointmentInput
): Promise<{ data: Appointment | null; error: string | null }> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("appointments")
      .insert([{ ...input, status: "pendiente" }])
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Appointment, error: null };
  }
  const items = readLocal();
  const newItem: Appointment = {
    ...input,
    id: crypto.randomUUID(),
    status: "pendiente",
    created_at: new Date().toISOString(),
  };
  items.unshift(newItem);
  writeLocal(items);
  return { data: newItem, error: null };
}

export async function listAppointments(): Promise<{ data: Appointment[]; error: string | null }> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("date", { ascending: true })
      .order("time", { ascending: true });
    if (error) return { data: [], error: error.message };
    return { data: data as Appointment[], error: null };
  }
  return { data: readLocal(), error: null };
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment["status"]
): Promise<{ error: string | null }> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    return { error: error?.message ?? null };
  }
  const items = readLocal();
  const idx = items.findIndex((a) => a.id === id);
  if (idx >= 0) { items[idx].status = status; writeLocal(items); }
  return { error: null };
}

export async function updateAppointmentPets(
  id: string,
  pets: PetEntry[]
): Promise<{ error: string | null }> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from("appointments").update({ pets }).eq("id", id);
    return { error: error?.message ?? null };
  }
  const items = readLocal();
  const idx = items.findIndex((a) => a.id === id);
  if (idx >= 0) { items[idx].pets = pets; writeLocal(items); }
  return { error: null };
}

export async function getBookedSlots(date: string): Promise<{ data: string[]; error: string | null }> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("appointments")
      .select("time")
      .eq("date", date)
      .neq("status", "cancelada");
    if (error) return { data: [], error: error.message };
    return { data: (data as { time: string }[]).map((d) => d.time), error: null };
  }
  const items = readLocal().filter((a) => a.date === date && a.status !== "cancelada");
  return { data: items.map((a) => a.time), error: null };
}
