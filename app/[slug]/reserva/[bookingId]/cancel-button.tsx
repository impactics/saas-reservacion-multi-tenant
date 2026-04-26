"use client";

interface CancelButtonProps {
  slug: string;
  bookingId: string;
}

export function CancelButton({ slug, bookingId }: CancelButtonProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm("¿Seguro que deseas cancelar tu cita?")) {
      e.preventDefault();
    }
  }

  return (
    <form
      action={`/api/${slug}/bookings/${bookingId}/cancel`}
      method="POST"
      onSubmit={handleSubmit}
    >
      <button
        type="submit"
        className="w-full border border-red-300 text-red-600 hover:bg-red-50 font-medium py-3 rounded-lg transition-colors"
      >
        Cancelar cita
      </button>
    </form>
  );
}
