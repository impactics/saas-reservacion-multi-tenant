"use client";

import { useState, useRef, useEffect } from "react";

const COUNTRIES = [
  { code: "EC", flag: "🇪🇨", dial: "+593", name: "Ecuador" },
  { code: "US", flag: "🇺🇸", dial: "+1",   name: "EE.UU." },
  { code: "CO", flag: "🇨🇴", dial: "+57",  name: "Colombia" },
  { code: "PE", flag: "🇵🇪", dial: "+51",  name: "Perú" },
  { code: "MX", flag: "🇲🇽", dial: "+52",  name: "México" },
  { code: "VE", flag: "🇻🇪", dial: "+58",  name: "Venezuela" },
  { code: "CL", flag: "🇨🇱", dial: "+56",  name: "Chile" },
  { code: "AR", flag: "🇦🇷", dial: "+54",  name: "Argentina" },
  { code: "BO", flag: "🇧🇴", dial: "+591", name: "Bolivia" },
  { code: "PA", flag: "🇵🇦", dial: "+507", name: "Panamá" },
  { code: "CR", flag: "🇨🇷", dial: "+506", name: "Costa Rica" },
  { code: "GT", flag: "🇬🇹", dial: "+502", name: "Guatemala" },
  { code: "ES", flag: "🇪🇸", dial: "+34",  name: "España" },
  { code: "CA", flag: "🇨🇦", dial: "+1",   name: "Canadá" },
  { code: "GB", flag: "🇬🇧", dial: "+44",  name: "Reino Unido" },
  { code: "DE", flag: "🇩🇪", dial: "+49",  name: "Alemania" },
  { code: "IT", flag: "🇮🇹", dial: "+39",  name: "Italia" },
  { code: "FR", flag: "🇫🇷", dial: "+33",  name: "Francia" },
];

interface PhoneInputProps {
  value: string;
  onChange: (fullNumber: string) => void;
  placeholder?: string;
  className?: string;
}

export default function PhoneInput({
  value,
  onChange,
  placeholder = "991234567",
  className = "",
}: PhoneInputProps) {
  const [dialCode, setDialCode] = useState("+593");
  const [localNumber, setLocalNumber] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  // Sync outward: combinar dial + número local
  useEffect(() => {
    const digits = localNumber.replace(/\D/g, "");
    onChange(digits ? `${dialCode}${digits}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialCode, localNumber]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = COUNTRIES.find((c) => c.dial === dialCode) ?? COUNTRIES[0];
  const filtered = search
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial.includes(search)
      )
    : COUNTRIES;

  return (
    <div className={`relative flex rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-teal-500 bg-white ${className}`} ref={dropRef}>
      {/* Selector de país */}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex items-center gap-1.5 pl-3 pr-2 py-2 text-sm font-medium text-gray-700 border-r border-gray-200 hover:bg-gray-50 transition-colors rounded-l-lg shrink-0"
        aria-label="Seleccionar código de país"
      >
        <span className="text-base">{selected.flag}</span>
        <span className="tabular-nums">{selected.dial}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Input número */}
      <input
        type="tel"
        inputMode="numeric"
        value={localNumber}
        onChange={(e) => setLocalNumber(e.target.value.replace(/[^\d\s\-]/g, ""))}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm bg-transparent focus:outline-none rounded-r-lg min-w-0"
      />

      {/* Dropdown países */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar país o código..."
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">Sin resultados</li>
            )}
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    setDialCode(c.dial);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-teal-50 transition-colors text-left ${
                    c.dial === dialCode ? "bg-teal-50 text-teal-700 font-medium" : "text-gray-700"
                  }`}
                >
                  <span className="text-base">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="tabular-nums text-gray-400">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
