# Integración del Widget de Reservas en un Ecommerce

Este documento explica cómo integrar el widget de reservas en cualquier ecommerce (WordPress/WooCommerce, Webflow, Shopify, HTML estático, etc.) de forma **segura, sin redirecciones y sin exponer credenciales sensibles**.

---

## Arquitectura de seguridad

```
Ecommerce (cliente)                  SaaS Reservacion (servidor)
─────────────────────                ─────────────────────────────
browser del paciente
  │
  │  GET /api/dra-maria-belen/services
  │  Header: X-Api-Key: srs_pub_xxx         ──►  verifyApiKey()
  │                                               ├─ hash SHA-256
  │                                               ├─ busca en DB
  │                                               ├─ valida origin CORS
  │                                               └─ ok → responde datos
  │◄────────────────────────────────────────────
  │
  │  (el ecommerce NUNCA toca Payphone/WhatsApp)
  │  (las credenciales de pago quedan en el servidor)
```

**Qué es seguro y por qué:**

| Elemento | Dónde vive | Expuesto al browser |
|---|---|---|
| API Key del widget | Código del ecommerce | ✅ Sí — es una clave pública de solo lectura |
| Token de WhatsApp | Variables de entorno del SaaS | ❌ Nunca |
| Credenciales Payphone | Variables de entorno del SaaS | ❌ Nunca |
| Hash SHA-256 de la key | Base de datos | ❌ Nunca |

> La API Key del widget (`srs_pub_...`) es **pública por diseño** — solo puede leer servicios, slots y crear reservas. No puede acceder al panel admin, ver datos de otros doctores, ni modificar configuraciones.

---

## Paso 1 — Crear la API Key en el Admin

1. Ir a `/admin/api-keys`
2. Escribir un nombre descriptivo (ej: `"Ecommerce Dra. María Belén"`)
3. Agregar el dominio del ecommerce en **Orígenes CORS permitidos**:
   ```
   https://dramariabelencerda.com
   https://www.dramariabelencerda.com
   ```
4. Clic en **Generar API Key**
5. **Copiar la key inmediatamente** — no se vuelve a mostrar en claro

---

## Paso 2 — Opción A: Widget por iframe (más fácil)

Pegar este código en la página del ecommerce donde quieras mostrar el widget:

```html
<!-- 1. Contenedor del widget -->
<div id="booking-widget"></div>

<!-- 2. Cargar el widget (antes de </body>) -->
<script
  src="https://tu-saas.com/widget/booking.js"
  data-slug="dra-maria-belen"
  data-api-key="srs_pub_TU_KEY_AQUI"
  data-target="booking-widget"
  async
></script>
```

**Ventajas:** funciona en cualquier plataforma, no requiere código adicional.  
**Desventajas:** el diseño es el del SaaS, no del ecommerce.

---

## Paso 3 — Opción B: API headless (diseño 100% del ecommerce)

Si prefieres construir tu propia UI (con el diseño exacto del ecommerce), consume directamente la API REST.

### Autenticación

Todos los requests deben incluir el header:
```
X-Api-Key: srs_pub_TU_KEY_AQUI
```

### Endpoints disponibles

#### Listar servicios
```http
GET https://tu-saas.com/api/dra-maria-belen/services
X-Api-Key: srs_pub_xxx
```

Respuesta:
```json
{
  "services": [
    {
      "id": "clx...",
      "name": "Consulta general",
      "description": "...",
      "durationMinutes": 30,
      "price": 45.00,
      "currency": "USD"
    }
  ]
}
```

#### Ver disponibilidad
```http
GET https://tu-saas.com/api/dra-maria-belen/availability
    ?professionalId=clx...
    &date=2026-05-10
X-Api-Key: srs_pub_xxx
```

Respuesta:
```json
{
  "slots": [
    {
      "start": "2026-05-10T14:00:00.000Z",
      "localStart": "09:00",
      "localEnd": "09:30"
    }
  ]
}
```

#### Crear reserva
```http
POST https://tu-saas.com/api/dra-maria-belen/bookings
Content-Type: application/json
X-Api-Key: srs_pub_xxx

{
  "serviceId": "clx...",
  "professionalId": "clx...",
  "scheduledAt": "2026-05-10T14:00:00.000Z",
  "patientName": "María Pérez",
  "patientPhone": "+593991234567",
  "patientEmail": "maria@email.com"
}
```

Respuesta:
```json
{
  "booking": {
    "id": "clx...",
    "status": "PENDING",
    "checkoutUrl": "https://pay.payphone.com/..."
  }
}
```

> Después de crear la reserva, redirige al paciente a `checkoutUrl` para completar el pago.

#### Ejemplo JavaScript completo

```javascript
const API_BASE = 'https://tu-saas.com';
const API_KEY  = 'srs_pub_TU_KEY_AQUI';
const SLUG     = 'dra-maria-belen';

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
};

// 1. Cargar servicios
const { services } = await fetch(`${API_BASE}/api/${SLUG}/services`, { headers }).then(r => r.json());

// 2. Ver disponibilidad
const { slots } = await fetch(
  `${API_BASE}/api/${SLUG}/availability?professionalId=${profId}&date=2026-05-10`,
  { headers }
).then(r => r.json());

// 3. Crear reserva
const { booking } = await fetch(`${API_BASE}/api/${SLUG}/bookings`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    serviceId: '...',
    professionalId: '...',
    scheduledAt: '2026-05-10T14:00:00.000Z',
    patientName: 'María Pérez',
    patientPhone: '+593991234567',
  }),
}).then(r => r.json());

// 4. Redirigir al pago
window.location.href = booking.checkoutUrl;
```

---

## Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `401 API key invalida` | Key incorrecta o revocada | Verificar la key en `/admin/api-keys` |
| `CORS blocked` | El origen no está en la lista | Agregar el dominio en los orígenes de la key |
| `403` en producción | Key inactiva | Crear una nueva key |

---

## Agregar a múltiples ecommerces

Cada ecommerce debe tener **su propia API Key** con sus orígenes configurados. Esto permite:
- Revocar el acceso de un ecommerce sin afectar a los demás
- Ver en el admin qué key se usó por última vez
- Auditar de dónde vienen las reservas
