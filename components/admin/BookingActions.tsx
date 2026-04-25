"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  bookingId: string;
  status: string;
}

export default function BookingActions({ bookingId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const update = async (newStatus: string, reason?: string) => {
    setLoading(true);
    await fetch(`/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, cancellationReason: reason }),
    });
    setLoading(false);
    router.refresh();
  };

  if (status === "CANCELLED" || status === "COMPLETED") {
    return <span className="text-xs text-gray-300">—</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {status === "PENDING" && (
        <button
          onClick={() => update("CONFIRMED")}
          disabled={loading}
          className="text-xs font-medium text-teal-700 hover:text-teal-900 disabled:opacity-50"
        >
          Confirmar
        </button>
      )}
      {(status === "PENDING" || status === "CONFIRMED") && (
        <button
          onClick={() => update("COMPLETED")}
          disabled={loading}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          Completar
        </button>
      )}
      <button
        onClick={() => {
          const reason = window.prompt("Motivo de cancelación (opcional):") ?? undefined;
          if (reason !== null) update("CANCELLED", reason);
        }}
        disabled={loading}
        className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  );
}
