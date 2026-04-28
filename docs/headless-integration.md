# Integracion Headless — ReservaSaaS

Guia para conectar cualquier ecommerce directamente a la API, sin redirecciones.

---

## Opcion A — Widget JS (mas facil, 2 minutos)

Pega este codigo en cualquier pagina de tu ecommerce (WordPress, Webflow, WooCommerce, etc.):

```html
<!-- 1. Contenedor donde aparece el widget -->
<div id="reserva-widget"></div>

<!-- 2. Script del widget -->
<script
  src="https://tudominio.app/widget/booking.js"
  data-slug="dra-maria-belen"
  data-api-key="srs_pub_xxxxxxxxxxxxxxxxx"
  data-container="reserva-widget"
  data-primary="#01696f"
  data-base-url="https://tudominio.app"
></script>
```

**Parametros:**
| Atributo | Descripcion |
|---|---|
| `data-slug` | Slug de la organizacion (ej: `dra-maria-belen`) |
| `data-api-key` | API key generada desde el panel admin |
| `data-primary` | Color primario del widget (hex, opcional) |
| `data-base-url` | URL base del SaaS |

---

## Opcion B — API directa (para devs)

Todas las llamadas requieren el header `X-Api-Key`.

### Autenticacion
```
X-Api-Key: srs_pub_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Endpoints disponibles

#### GET /api/{slug}/services
Retorna los servicios activos.

```bash
curl https://tudominio.app/api/dra-maria-belen/services \
  -H "X-Api-Key: srs_pub_xxx"
```

Respuesta:
```json
{
  "services": [
    {
      "id": "clx...",
      "name": "Consulta general",
      "durationMinutes": 30,
      "price": 40,
      "currency": "USD"
    }
  ]
}
```

#### GET /api/{slug}/professionals?serviceId={id}

#### GET /api/{slug}/availability?professionalId={id}&date=YYYY-MM-DD

Respuesta:
```json
{
  "slots": [
    { "start": "2026-04-28T14:00:00.000Z", "localStart": "09:00", "localEnd": "09:30" }
  ]
}
```

#### POST /api/{slug}/bookings

```json
{
  "serviceId":      "clx...",
  "professionalId": "clx...",
  "scheduledAt":    "2026-04-28T14:00:00.000Z",
  "patientName":    "Maria Perez",
  "patientPhone":   "+593991234567",
  "patientEmail":   "maria@ejemplo.com"
}
```

---

## Generar una API Key

1. Ir a `/admin` -> **Configuracion** -> **API Keys**
2. Click en **Nueva API Key**
3. Ingresar nombre (ej: `WooCommerce Dra. Maria`)
4. Ingresar los dominios permitidos (ej: `https://dramariabelencerda.com`)
5. Copiar la clave generada — **solo se muestra una vez**

---

## Capas de seguridad

| Capa | Mecanismo |
|---|---|
| **Autenticacion** | Header `X-Api-Key` en cada request |
| **CORS** | Solo los dominios registrados en la key pueden hacer requests |
| **Almacenamiento** | Las keys se guardan como SHA-256 (nunca en plano en la DB) |
| **Revocacion** | Desde el admin se puede desactivar una key al instante |
| **Preflight** | El middleware responde OPTIONS sin exponer datos |
