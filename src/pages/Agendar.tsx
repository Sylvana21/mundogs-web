import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Loader2, MapPin, Truck, Car, Plus, Trash2, PawPrint, Check, ArrowRight, Camera,
} from "lucide-react";
import { SERVICES, PACKAGES, BUSINESS } from "../lib/business";
import { createAppointment, updateAppointmentPets, type PetEntry } from "../lib/appointments";
import { uploadPetPhoto } from "../lib/storage";
import {
  getUpcomingDays, getDaySlots, formatSlot12h, isSlotBlocked,
} from "../lib/availability";
import ServiceIcon from "../components/ServiceIcon";
import AlfredIcon from "../components/AlfredIcon";

type LocationType = "local" | "movil" | "taxipet";

const LOCATION_OPTIONS: {
  id: LocationType; label: string; desc: string; icon: typeof MapPin;
}[] = [
  { id: "local", label: "En el local", desc: "Tú llevas a tu mascota a nuestras instalaciones", icon: MapPin },
  { id: "movil", label: "Estética móvil", desc: "Vamos hasta tu domicilio con la camioneta", icon: Truck },
  { id: "taxipet", label: "TaxiPet", desc: "Pasamos por tu mascota, la llevamos al local y la regresamos", icon: Car },
];

const PET_SIZES = [
  { id: "chico", label: "Chico" },
  { id: "mediano", label: "Mediano" },
  { id: "grande", label: "Grande" },
] as const;

const SPECIES_OPTIONS = ["Perro", "Otro"];

const ALL_SERVICE_OPTIONS = [
  ...SERVICES.map((s) => ({ id: s.id, name: s.name, isPackage: false })),
  ...PACKAGES.map((p) => ({ id: p.id, name: p.name, isPackage: true })),
];

type PetEntryLocal = Omit<PetEntry, "service_id" | "service_name"> & {
  service_ids: string[];
  notes: string;
  photos: File[];
};

function emptyPet(): PetEntryLocal {
  return {
    pet_name: "", pet_species: "Perro", pet_breed: "",
    pet_size: "mediano", service_ids: [], notes: "", photos: [],
  };
}

function toApiPet(p: PetEntryLocal): PetEntry {
  const names = p.service_ids.map(
    (id) => ALL_SERVICE_OPTIONS.find((s) => s.id === id)?.name ?? id
  );
  return {
    pet_name: p.pet_name.trim(),
    pet_species: p.pet_species,
    pet_breed: p.pet_breed.trim(),
    pet_size: p.pet_size,
    service_id: p.service_ids.join(","),
    service_name: names.join(", "),
    photo_urls: [],
  };
}

// === CAMPO DE FOTO POR MASCOTA ===
function PetPhotoField({ index, pet, onUpdate }: {
  index: number;
  pet: PetEntryLocal;
  onUpdate: (patch: Partial<PetEntryLocal>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
      <div className="mb-3 rounded-xl bg-amber-400 px-4 py-2.5 text-center">
        <p className="font-display text-xs font-extrabold uppercase tracking-wider text-amber-900">
          ⚠️ LA FOTO DEBE SER TOMADA EN ESTE MOMENTO
        </p>
        <p className="mt-0.5 text-xs text-amber-800">
          No sirven fotos viejas — necesitamos ver el pelaje y condición actual de{" "}
          {pet.pet_name || "tu mascota"} para hacer la cotización correcta.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Camera className="h-4 w-4 text-amber-600" />
        <label className="font-display text-sm font-bold text-ink">
          Foto de {pet.pet_name || `mascota ${index + 1}`}
        </label>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            onUpdate({ photos: [...pet.photos, ...Array.from(e.target.files)] });
          }
        }}
        className="w-full cursor-pointer rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-ink/60 file:mr-3 file:rounded-full file:border-0 file:bg-amber-400 file:px-4 file:py-1.5 file:font-display file:text-xs file:font-bold file:text-amber-900 hover:file:bg-amber-500"
      />

      {pet.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pet.photos.map((f, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border-2 border-amber-300">
              <img src={URL.createObjectURL(f)} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onUpdate({ photos: pet.photos.filter((_, pi) => pi !== i) })}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
              >×</button>
            </div>
          ))}
          <p className="w-full mt-1 text-xs font-semibold text-amber-700">
            ✓ {pet.photos.length} foto{pet.photos.length > 1 ? "s" : ""} lista{pet.photos.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      <div className="mt-3">
        <label className="block font-display text-xs font-semibold text-ink/70 mb-1">
          Indicaciones especiales para {pet.pet_name || "esta mascota"} (opcional)
        </label>
        <textarea
          value={pet.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          rows={2}
          placeholder="Alergias, comportamiento, zonas sensibles, etc."
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
      </div>
    </div>
  );
}

// === PANTALLA DE ÉXITO ===
function SuccessScreen({ pets, selectedDate, selectedTime }: {
  pets: PetEntryLocal[];
  selectedDate: string;
  selectedTime: string;
}) {
  const navigate = useNavigate();
  const dateObj = new Date(selectedDate + "T00:00:00");
  const dateLabel = dateObj.toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
  });
  const petsList = pets.map((p) => {
    const names = p.service_ids.map((id) => ALL_SERVICE_OPTIONS.find((s) => s.id === id)?.name ?? id);
    return `${p.pet_name} (${names.join(", ")})`;
  }).join(", ");

  const waText = encodeURIComponent(
    `¡Hola! Acabo de agendar una cita:\n` +
    `Mascotas: ${petsList}\n` +
    `Fecha: ${dateLabel} a las ${formatSlot12h(selectedTime)}\n` +
    `¡Las fotos de mis mascotas ya están adjuntas en la cita! Gracias 🐾`
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-16 text-center">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ink shadow-lg">
          <AlfredIcon className="h-20 w-20" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-mint text-ink shadow">
          <Check className="h-4 w-4" strokeWidth={3} />
        </div>
      </div>

      <div className="relative mt-6 rounded-3xl bg-ink px-7 py-6 text-cream shadow-lg">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 w-4 rotate-45 bg-ink" />
        <p className="font-display text-base font-bold">¡Con gusto, {pets[0]?.pet_name || "amigo"}! 🎩</p>
        <p className="mt-2 text-sm leading-relaxed text-cream/80">
          Tu cita está <strong className="text-mint">en espera de confirmación</strong>.
          En cuanto la revisemos, te mandamos la cotización por WhatsApp según
          el pelaje y condición de {pets.length > 1 ? "tus mascotas" : "tu mascota"}.
          ¡Nos vemos pronto! 🐾
        </p>
      </div>

      <div className="mt-6 w-full space-y-2 rounded-2xl bg-cream-soft p-5 text-left text-sm text-ink/70">
        <p><strong className="text-ink">Mascotas:</strong> {petsList}</p>
        <p><strong className="text-ink">Fecha:</strong> {dateLabel} a las {formatSlot12h(selectedTime)}</p>
      </div>

      <div className="mt-6 w-full">
        <div className="mb-3 rounded-2xl bg-ink px-5 py-3 text-center">
          <p className="text-xs text-cream/50 uppercase tracking-wide font-display font-bold">Tu cita</p>
          <p className="font-display text-lg font-extrabold text-mint mt-0.5">{dateLabel}</p>
          <p className="text-sm text-cream/70">a las {formatSlot12h(selectedTime)}</p>
        </div>
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className="animate-bounce text-lg">👆</span>
          <p className="font-display text-sm font-bold text-grape">¡No se te olvide confirmar tu cita!</p>
          <span className="animate-bounce text-lg">👆</span>
        </div>
        <a
          href={`https://wa.me/${BUSINESS.whatsapp.number}?text=${waText}`}
          target="_blank" rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-full bg-[#25D366] py-4 font-display text-base font-bold text-white shadow-lg hover:opacity-90 hover:scale-[1.02] transition-transform"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.46 1.36 4.92L2 22l5.27-1.39a9.86 9.86 0 0 0 4.77 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.13-2.9-7C17.18 3.03 14.7 2 12.04 2Zm0 1.67c2.23 0 4.33.87 5.9 2.44a8.23 8.23 0 0 1 2.43 5.8c0 4.56-3.72 8.27-8.29 8.27h-.01a8.3 8.3 0 0 1-4.21-1.15l-.3-.18-3.13.82.84-3.04-.2-.31a8.21 8.21 0 0 1-1.27-4.41c0-4.56 3.72-8.24 8.24-8.24Zm-4.6 4.37c-.16 0-.43.06-.65.31-.22.25-.86.84-.86 2.04 0 1.2.88 2.36 1 2.52.13.17 1.71 2.7 4.21 3.69 2.08.83 2.5.66 2.95.62.45-.04 1.46-.6 1.66-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28-.25-.13-1.46-.72-1.69-.8-.23-.08-.39-.13-.56.13-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.66-1.25-1.49-1.4-1.74-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.44-.06-.13-.56-1.37-.78-1.87-.2-.49-.41-.42-.56-.43-.14-.01-.31-.01-.47-.01Z"/>
          </svg>
          Confirmar cita por WhatsApp
          <ArrowRight className="h-5 w-5" />
        </a>
        <p className="mt-2 text-center text-xs text-ink/40">
          Tu cita queda guardada, pero la estética necesita tu confirmación para apartarte el lugar.
        </p>
      </div>
      <button onClick={() => navigate("/")} className="mt-4 font-display text-sm font-semibold text-ink/30 hover:text-ink">
        Volver al inicio
      </button>
    </div>
  );
}

// === FORMULARIO PRINCIPAL ===
export default function Agendar() {
  const location = useLocation();
  const incoming = location.state as { serviceId?: string; packageId?: string } | undefined;
  const days = useMemo(() => getUpcomingDays(21), []);

  const initialServiceId = incoming?.serviceId || incoming?.packageId || "";
  const [pets, setPets] = useState<PetEntryLocal[]>([{
    ...emptyPet(),
    service_ids: initialServiceId ? [initialServiceId] : [],
  }]);
  const [locationType, setLocationType] = useState<LocationType>("local");
  const [taxipetOption, setTaxipetOption] = useState<"recoger" | "regresar" | "ambas">("ambas");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    return getDaySlots(selectedDate).filter((slot) => !isSlotBlocked(selectedDate, slot));
  }, [selectedDate]);

  useEffect(() => { setSelectedTime(""); }, [selectedDate]);

  function updatePet(index: number, patch: Partial<PetEntryLocal>) {
    setPets((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function toggleService(index: number, serviceId: string) {
    const current = pets[index].service_ids;
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    updatePet(index, { service_ids: next });
  }

  function addPet() { setPets((prev) => [...prev, emptyPet()]); }
  function removePet(index: number) { setPets((prev) => prev.filter((_, i) => i !== index)); }

  const needsAddress = locationType === "movil" || locationType === "taxipet";

  function validate(): string | null {
    if (pets.length === 0) return "Agrega al menos una mascota.";
    for (const p of pets) {
      if (!p.pet_name.trim()) return "Falta el nombre de alguna mascota.";
      if (p.service_ids.length === 0)
        return `Elige al menos un servicio para ${p.pet_name || "tu mascota"}.`;
    }
    if (!selectedDate) return "Elige una fecha.";
    if (!selectedTime) return "Elige un horario.";
    if (!ownerName.trim()) return "Falta tu nombre.";
    if (!ownerPhone.trim()) return "Falta tu teléfono.";
    if (needsAddress && !address.trim())
      return locationType === "taxipet"
        ? "Falta la dirección para pasar por tu mascota."
        : "Falta la dirección para la estética móvil.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setErrorMsg(err); return; }
    setErrorMsg(null);
    setSubmitting(true);

    const notesGlobal = pets
      .filter((p) => p.notes.trim())
      .map((p) => `${p.pet_name}: ${p.notes.trim()}`)
      .join(" | ");

    // 1. Crear la cita primero
    const { data: appointment, error } = await createAppointment({
      owner_name: ownerName.trim(),
      owner_phone: ownerPhone.trim(),
      owner_email: ownerEmail.trim(),
      pets: pets.map(toApiPet),
      location_type: locationType,
      address: needsAddress ? address.trim() : null,
      date: selectedDate,
      time: selectedTime,
      notes: [
        notesGlobal,
        locationType === "taxipet"
          ? `TaxiPet: ${taxipetOption === "recoger" ? "solo recoger" : taxipetOption === "regresar" ? "solo regresar" : "recoger y regresar"}`
          : "",
      ].filter(Boolean).join(" | ") || null,
    });

    if (error || !appointment) {
      setSubmitting(false);
      setErrorMsg("No pudimos guardar tu cita. Intenta de nuevo o escríbenos por WhatsApp.");
      return;
    }

    // 2. Subir fotos a Storage y actualizar la cita con las URLs
    const totalPhotos = pets.reduce((acc, p) => acc + p.photos.length, 0);
    if (totalPhotos > 0) {
      setUploadProgress(`Subiendo fotos... 0/${totalPhotos}`);
      let uploaded = 0;
      const updatedPets = await Promise.all(
        pets.map(async (pet, petIdx) => {
          const apiPet = toApiPet(pet);
          const urls: string[] = [];
          for (let i = 0; i < pet.photos.length; i++) {
            const url = await uploadPetPhoto(pet.photos[i], appointment.id, pet.pet_name || `mascota${petIdx}`, i);
            if (url) urls.push(url);
            uploaded++;
            setUploadProgress(`Subiendo fotos... ${uploaded}/${totalPhotos}`);
          }
          return { ...apiPet, photo_urls: urls };
        })
      );
      await updateAppointmentPets(appointment.id, updatedPets);
      setUploadProgress("");
    }

    setSubmitting(false);
    setSuccess(true);
  }

  if (success) {
    return <SuccessScreen pets={pets} selectedDate={selectedDate} selectedTime={selectedTime} />;
  }

  return (
    <div>
      <section className="bg-ink py-12 text-cream">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-mint">Agenda tu cita</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Agenda tu cita</h1>
          <p className="mt-2 text-sm text-cream/60">
            ¿Tienes más de una mascota? Agrégalas todas. Te enviamos la cotización por WhatsApp.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-10 px-5 py-12">

        {/* 1. Mascotas */}
        <fieldset>
          <legend className="font-display text-lg font-bold text-ink">1. Tus mascotas y sus servicios</legend>
          <div className="mt-4 space-y-5">
            {pets.map((pet, index) => (
              <div key={index} className="rounded-2xl border border-ink/10 bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-ink/70">
                    <PawPrint className="h-4 w-4 text-mint-deep" />
                    <span className="font-display text-sm font-bold">Mascota {index + 1}</span>
                  </div>
                  {pets.length > 1 && (
                    <button type="button" onClick={() => removePet(index)} className="text-ink/40 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-display text-sm font-semibold text-ink">Nombre</label>
                    <input value={pet.pet_name} onChange={(e) => updatePet(index, { pet_name: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30" required />
                  </div>
                  <div>
                    <label className="block font-display text-sm font-semibold text-ink">Especie</label>
                    <select value={pet.pet_species} onChange={(e) => updatePet(index, { pet_species: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30">
                      {SPECIES_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-display text-sm font-semibold text-ink">Raza (si la conoces)</label>
                    <input value={pet.pet_breed} onChange={(e) => updatePet(index, { pet_breed: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30" />
                  </div>
                  <div>
                    <label className="block font-display text-sm font-semibold text-ink">Tamaño</label>
                    <div className="mt-1.5 flex gap-2">
                      {PET_SIZES.map((sz) => (
                        <button type="button" key={sz.id} onClick={() => updatePet(index, { pet_size: sz.id })}
                          className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${pet.pet_size === sz.id ? "border-mint-deep bg-mint/15 text-ink" : "border-ink/15 bg-white text-ink/60"}`}>
                          {sz.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block font-display text-sm font-semibold text-ink">
                    Servicios para {pet.pet_name || "esta mascota"}
                    <span className="ml-2 font-normal text-ink/40 text-xs">(puedes elegir varios)</span>
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {ALL_SERVICE_OPTIONS.map((s) => {
                      const selected = pet.service_ids.includes(s.id);
                      const svc = SERVICES.find((sv) => sv.id === s.id);
                      return (
                        <button type="button" key={s.id} onClick={() => toggleService(index, s.id)}
                          className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                            selected ? s.isPackage ? "border-grape bg-grape/10" : "border-mint-deep bg-mint/10"
                            : "border-ink/10 bg-white hover:border-ink/20"}`}>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            selected ? s.isPackage ? "border-grape bg-grape" : "border-mint-deep bg-mint"
                            : "border-ink/20 bg-white"}`}>
                            {selected && <Check className="h-3 w-3 text-ink" strokeWidth={3} />}
                          </span>
                          {svc && <ServiceIcon icon={svc.icon} className="h-4 w-4 shrink-0 text-mint-deep" />}
                          <span className="font-display text-xs font-bold text-ink">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <PetPhotoField index={index} pet={pet} onUpdate={(patch) => updatePet(index, patch)} />
              </div>
            ))}
          </div>
          <button type="button" onClick={addPet}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-dashed border-ink/25 px-5 py-2.5 font-display text-sm font-bold text-ink/60 hover:border-mint-deep hover:text-mint-deep">
            <Plus className="h-4 w-4" /> Agregar otra mascota
          </button>
        </fieldset>

        {/* 2. Modalidad */}
        <fieldset>
          <legend className="font-display text-lg font-bold text-ink">2. ¿Dónde las atendemos?</legend>
          <p className="mt-1 text-xs text-ink/45">Aplica para todas las mascotas de esta cita.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {LOCATION_OPTIONS.map((opt) => (
              <button type="button" key={opt.id} onClick={() => setLocationType(opt.id)}
                className={`rounded-2xl border p-4 text-left transition-colors ${locationType === opt.id ? "border-mint-deep bg-mint/10" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                <opt.icon className="h-5 w-5 text-mint-deep" />
                <p className="mt-2 font-display text-sm font-bold text-ink">{opt.label}</p>
                <p className="mt-1 text-xs text-ink/55">{opt.desc}</p>
              </button>
            ))}
          </div>
          {needsAddress && (
            <div className="mt-4 space-y-4">
              {locationType === "taxipet" && (
                <div>
                  <label className="block font-display text-sm font-semibold text-ink mb-2">¿Qué necesitas?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: "recoger", label: "Solo recoger", emoji: "🏠→🏪" },
                      { id: "regresar", label: "Solo regresar", emoji: "🏪→🏠" },
                      { id: "ambas", label: "Recoger y regresar", emoji: "🔄" },
                    ] as const).map((opt) => (
                      <button type="button" key={opt.id} onClick={() => setTaxipetOption(opt.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors ${taxipetOption === opt.id ? "border-mint-deep bg-mint/10" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                        <span className="text-lg">{opt.emoji}</span>
                        <span className="font-display text-xs font-bold text-ink leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block font-display text-sm font-semibold text-ink">
                  {locationType === "taxipet" ? "Dirección" : "Dirección para la estética móvil"}
                </label>
                <input value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle, número, colonia, referencias"
                  className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30" />
                {locationType === "taxipet" && (
                  <p className="mt-1.5 text-xs text-ink/50">
                    {taxipetOption === "recoger" && "Pasamos por tu mascota y la llevamos al local."}
                    {taxipetOption === "regresar" && "Tú la llevas al local y nosotros la regresamos."}
                    {taxipetOption === "ambas" && "Pasamos por tu mascota y la regresamos al terminar."}
                  </p>
                )}
              </div>
            </div>
          )}
        </fieldset>

        {/* 3. Fecha y hora */}
        <fieldset>
          <legend className="font-display text-lg font-bold text-ink">3. Fecha y hora</legend>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {days.map((d) => (
              <button type="button" key={d.date} disabled={d.closed} onClick={() => setSelectedDate(d.date)}
                className={`flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                  d.closed ? "cursor-not-allowed border-ink/5 bg-ink/5 text-ink/25"
                  : selectedDate === d.date ? "border-mint-deep bg-mint text-ink"
                  : "border-ink/10 bg-white text-ink/70 hover:border-ink/25"}`}>
                {d.label}
              </button>
            ))}
          </div>
          {selectedDate && (
            <div className="mt-4">
              {availableSlots.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 font-semibold">
                  No hay horarios disponibles este día. Elige otro o escríbenos por WhatsApp.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableSlots.map((slot) => (
                    <button type="button" key={slot} onClick={() => setSelectedTime(slot)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        selectedTime === slot ? "border-mint-deep bg-mint text-ink"
                        : "border-ink/10 bg-white text-ink/70 hover:border-ink/25"}`}>
                      {formatSlot12h(slot)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </fieldset>

        {/* 4. Datos */}
        <fieldset>
          <legend className="font-display text-lg font-bold text-ink">4. Tus datos de contacto</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-display text-sm font-semibold text-ink">Tu nombre</label>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30" required />
            </div>
            <div>
              <label className="block font-display text-sm font-semibold text-ink">Teléfono / WhatsApp</label>
              <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} type="tel"
                className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30" required />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-display text-sm font-semibold text-ink">Correo (opcional)</label>
              <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} type="email"
                className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-sm focus:border-mint-deep focus:outline-none focus:ring-2 focus:ring-mint/30" />
            </div>
          </div>
        </fieldset>

        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{errorMsg}</p>
        )}

        <button type="submit" disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-mint py-4 font-display text-base font-bold text-ink transition-transform hover:scale-[1.01] hover:bg-lime disabled:opacity-60">
          {submitting
            ? <><Loader2 className="h-5 w-5 animate-spin" /> {uploadProgress || "Agendando..."}</>
            : "Confirmar cita"}
        </button>
      </form>
    </div>
  );
}
