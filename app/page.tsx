export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-lg w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Booking SaaS
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Plataforma multi-tenant de reservas médicas
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-left space-y-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Endpoints disponibles
          </h2>
          <ul className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            <li>
              <span className="text-emerald-600 font-semibold">GET</span>{" "}
              /api/[slug]/availability?professionalId=&date=
            </li>
            <li>
              <span className="text-blue-600 font-semibold">POST</span>{" "}
              /api/[slug]/bookings
            </li>
            <li>
              <span className="text-amber-600 font-semibold">PATCH</span>{" "}
              /api/[slug]/bookings/[id]/reschedule
            </li>
            <li>
              <span className="text-amber-600 font-semibold">PATCH</span>{" "}
              /api/[slug]/bookings/[id]/cancel
            </li>
            <li>
              <span className="text-blue-600 font-semibold">POST</span>{" "}
              /api/workers/notifications
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
