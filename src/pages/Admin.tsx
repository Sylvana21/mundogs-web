import { useEffect, useState } from "react";
import { Lock, RefreshCw, Phone, Mail, MapPin, PawPrint, CalendarOff, CalendarCheck, Trash2, Image } from "lucide-react";
import { listAppointments, updateAppointmentStatus, updateAppointmentPets, type Appointment } from "../lib/appointments";
import { deletePhotoByUrl, deleteAppointmentPhotos } from "../lib/storage";
import { formatSlot12h, getUpcomingDays, getDaySlots, getBlockedSlots, toggleBlockedSlot, type BlockedSlots } from "../lib/availability";

const ADMIN_KEY = "mundogs_admin_unlocked";
const ADMIN_PASSWORD = "mundogs2026";

const STATUS_STYLES: Record<Appointment["status"], string> = {
  pendiente: "bg-amber-100 text-amber-700",
  confirmada: "bg-mint/25 text-mint-deep",
  completada: "bg-ink/10 text-ink/60",
  cancelada: "bg-red-100 text-red-600",
};

export default function Admin() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(ADMIN_KEY) === "1");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"todas" | Appointment["status"]>("todas");
  const [activeTab, setActiveTab] = useState<"citas" | "horarios">("citas");
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlots>({});
  const [selectedDay, setSelectedDay] = useState("");
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  const days = getUpcomingDays(14);

  async function load() {
    setLoading(true);
    const { data } = await listAppointments();
    setAppointments(data);
    setLoading(false);
  }

  useEffect(() => {
    if (unlocked) { load(); setBlockedSlots(getBlockedSlots()); }
  }, [unlocked]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_KEY, "1");
      setUnlocked(true);
      setLoginError("");
    } else {
      setLoginError("Clave incorrecta.");
    }
  }

  async function handleStatusChange(id: string, status: Appointment["status"]) {
    await updateAppointmentStatus(id, status);
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  async function handleDeletePhoto(appointmentId: string, petIndex: number, photoUrl: string) {
    setDeletingPhoto(photoUrl);
    await deletePhotoByUrl(photoUrl);
    setAppointments((prev) => prev.map((a) => {
      if (a.id !== appointmentId) return a;
      const newPets = a.pets.map((pet, i) => {
        if (i !== petIndex) return pet;
        return { ...pet, photo_urls: (pet.photo_urls ?? []).filter((u) => u !== photoUrl) };
      });
      return { ...a, pets: newPets };
    }));
    await updateAppointmentPets(
      appointmentId,
      appointments.find((a) => a.id === appointmentId)!.pets.map((pet, i) => {
        if (i !== petIndex) return pet;
        return { ...pet, photo_urls: (pet.photo_urls ?? []).filter((u) => u !== photoUrl) };
      })
    );
    setDeletingPhoto(null);
  }

  async function handleDeleteAllPhotos(appointmentId: string) {
    if (!confirm("¿Borrar todas las fotos de esta cita?")) return;
    await deleteAppointmentPhotos(appointmentId);
    setAppointments((prev) => prev.map((a) => {
      if (a.id !== appointmentId) return a;
      return { ...a, pets: a.pets.map((p) => ({ ...p, photo_urls: [] })) };
    }));
    const appt = appointments.find((a) => a.id === appointmentId)!;
    await updateAppointmentPets(appointmentId, appt.pets.map((p) => ({ ...p, photo_urls: [] })));
  }

  function handleToggleSlot(time: string) {
    if (!selectedDay) return;
    toggleBlockedSlot(selectedDay, time);
    setBlockedSlots(getBlockedSlots());
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-5 text-center">
        <Lock className="h-10 w-10 text-ink/30" />
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Panel Mundogs & Pets</h1>
        <p className="mt-1 text-sm text-ink/50">Solo para el equipo del negocio.</p>
        <form onSubmit={handleLogin} className="mt-6 w-full space-y-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Clave de acceso"
            className="w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none" />
          {loginError && <p className="text-sm font-semibold text-red-600">{loginError}</p>}
          <button type="submit" className="w-full rounded-full bg-ink py-3 font-display text-sm font-bold text-cream hover:bg-grape">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  const filtered = filter === "todas" ? appointments : appointments.filter((a) => a.status === filter);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Panel de administración</h1>
          <p className="text-sm text-ink/50">{appointments.length} cita{appointments.length !== 1 && "s"} en total</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        {(["citas", "horarios"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`rounded-full px-5 py-2 font-display text-sm font-bold capitalize transition-colors ${activeTab === tab ? "bg-ink text-cream" : "bg-ink/5 text-ink/60 hover:bg-ink/10"}`}>
            {tab === "citas" ? "Citas" : "Bloquear horarios"}
          </button>
        ))}
      </div>

      {/* TAB CITAS */}
      {activeTab === "citas" && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {(["todas", "pendiente", "confirmada", "completada", "cancelada"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-colors ${filter === f ? "bg-ink text-cream" : "bg-ink/5 text-ink/60 hover:bg-ink/10"}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-5">
            {filtered.length === 0 && (
              <p className="rounded-2xl bg-cream-soft p-8 text-center text-sm text-ink/50">No hay citas en esta categoría.</p>
            )}
            {filtered.map((a) => {
              const dateLabel = new Date(a.date + "T00:00:00").toLocaleDateString("es-MX", {
                weekday: "short", day: "numeric", month: "short",
              });
              const totalPhotos = a.pets.reduce((acc, p) => acc + (p.photo_urls?.length ?? 0), 0);
              return (
                <div key={a.id} className="rounded-2xl border border-ink/5 bg-white p-5 shadow-sm">
                  {/* Header cita */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="space-y-1.5">
                        {a.pets.map((pet, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <PawPrint className="h-4 w-4 shrink-0 text-mint-deep" />
                            <p className="font-display text-base font-bold text-ink">
                              {pet.pet_name}{" "}
                              <span className="font-normal text-ink/50">
                                ({pet.pet_species}{pet.pet_breed ? `, ${pet.pet_breed}` : ""}, {pet.pet_size})
                              </span>
                              <span className="ml-2 font-display text-sm font-semibold text-grape">{pet.service_name}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-sm text-ink/60">
                        {dateLabel} · {formatSlot12h(a.time)} ·{" "}
                        {a.location_type === "local" ? "En el local" : a.location_type === "movil" ? "Estética móvil" : "TaxiPet"}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                  </div>

                  {/* Datos de contacto */}
                  <div className="mt-3 grid gap-1.5 border-t border-ink/5 pt-3 text-sm text-ink/65 sm:grid-cols-2">
                    <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {a.owner_name} — {a.owner_phone}</p>
                    {a.owner_email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {a.owner_email}</p>}
                    {a.address && <p className="flex items-center gap-2 sm:col-span-2"><MapPin className="h-3.5 w-3.5" /> {a.address}</p>}
                    {a.notes && <p className="sm:col-span-2 italic text-ink/50">"{a.notes}"</p>}
                  </div>

                  {/* FOTOS POR MASCOTA */}
                  {totalPhotos > 0 && (
                    <div className="mt-4 border-t border-ink/5 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="flex items-center gap-1.5 font-display text-xs font-bold text-ink/70 uppercase tracking-wide">
                          <Image className="h-3.5 w-3.5" /> Fotos ({totalPhotos})
                        </p>
                        <button
                          onClick={() => handleDeleteAllPhotos(a.id)}
                          className="text-xs font-semibold text-red-400 hover:text-red-600"
                        >
                          Borrar todas
                        </button>
                      </div>
                      {a.pets.map((pet, petIdx) =>
                        (pet.photo_urls?.length ?? 0) > 0 ? (
                          <div key={petIdx} className="mb-3">
                            <p className="text-xs font-semibold text-ink/50 mb-2">{pet.pet_name}</p>
                            <div className="flex flex-wrap gap-2">
                              {pet.photo_urls!.map((url, photoIdx) => (
                                <div key={photoIdx} className="relative group">
                                  <a href={url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={url}
                                      alt={`${pet.pet_name} foto ${photoIdx + 1}`}
                                      className="h-24 w-24 rounded-xl object-cover border border-ink/10 hover:opacity-90 transition-opacity"
                                    />
                                  </a>
                                  <button
                                    onClick={() => handleDeletePhoto(a.id, petIdx, url)}
                                    disabled={deletingPhoto === url}
                                    className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                    title="Borrar foto"
                                  >
                                    {deletingPhoto === url
                                      ? <span className="text-xs animate-spin">⟳</span>
                                      : <Trash2 className="h-3 w-3" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Cambiar estado */}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/5 pt-3">
                    {(["pendiente", "confirmada", "completada", "cancelada"] as const).map((s) => (
                      <button key={s} onClick={() => handleStatusChange(a.id, s)} disabled={a.status === s}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ${a.status === s ? "cursor-default bg-ink/10 text-ink/40" : "bg-ink/5 text-ink/70 hover:bg-mint/20 hover:text-mint-deep"}`}>
                        Marcar {s}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* TAB HORARIOS */}
      {activeTab === "horarios" && (
        <div className="mt-6">
          <p className="text-sm text-ink/60 leading-relaxed">
            Bloquea los horarios ocupados. Los clientes no podrán seleccionarlos al agendar.
          </p>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {days.filter((d) => !d.closed).map((d) => (
              <button key={d.date} onClick={() => setSelectedDay(d.date)}
                className={`flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ${selectedDay === d.date ? "border-ink bg-ink text-cream" : "border-ink/10 bg-white text-ink/70 hover:border-ink/25"}`}>
                {d.label}
              </button>
            ))}
          </div>
          {selectedDay && (
            <div className="mt-5">
              <p className="mb-3 font-display text-sm font-bold text-ink">
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <div className="flex flex-wrap gap-2">
                {getDaySlots(selectedDay).map((slot) => {
                  const blocked = (blockedSlots[selectedDay] ?? []).includes(slot);
                  return (
                    <button key={slot} onClick={() => handleToggleSlot(slot)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${blocked ? "border-red-300 bg-red-50 text-red-600" : "border-ink/10 bg-white text-ink/70 hover:border-ink/25"}`}>
                      {blocked ? <CalendarOff className="h-3.5 w-3.5" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                      {formatSlot12h(slot)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-ink/40">Rojo = bloqueado. Dale clic de nuevo para desbloquear.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
