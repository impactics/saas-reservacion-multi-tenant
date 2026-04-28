/**
 * Widget de reservas — SaaS Reservacion
 * Se carga desde el ecommerce via <script>.
 * Usa la API Key del atributo data-api-key para autenticarse.
 * Renderiza un iframe seguro apuntando al portal del slug.
 *
 * Uso:
 *   <div id="booking-widget"></div>
 *   <script
 *     src="https://tu-saas.com/widget/booking.js"
 *     data-slug="dra-maria-belen"
 *     data-api-key="srs_pub_..."
 *     data-target="booking-widget"
 *     async
 *   ></script>
 */
(function () {
  var script = document.currentScript ||
    Array.from(document.querySelectorAll('script[data-api-key]')).pop();

  if (!script) return;

  var slug    = script.dataset.slug;
  var apiKey  = script.dataset.apiKey;
  var targetId = script.dataset.target || 'booking-widget';
  var base    = script.src.replace('/widget/booking.js', '');

  if (!slug || !apiKey) {
    console.error('[Booking Widget] Faltan data-slug o data-api-key');
    return;
  }

  var container = document.getElementById(targetId);
  if (!container) {
    console.error('[Booking Widget] No se encontró el elemento #' + targetId);
    return;
  }

  // El iframe apunta al portal público del slug con el api-key como param
  // El portal verifica la key y solo sirve el widget si es válida
  var src = base + '/' + slug + '/booking?apiKey=' + encodeURIComponent(apiKey) + '&embed=1';

  var iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText = [
    'width:100%',
    'min-height:600px',
    'border:none',
    'border-radius:12px',
    'overflow:hidden',
  ].join(';');
  iframe.setAttribute('title', 'Agendar cita');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allow', 'payment');

  // Resize automático via postMessage
  window.addEventListener('message', function (e) {
    if (e.origin !== base) return;
    if (e.data && e.data.type === 'booking-resize') {
      iframe.style.minHeight = e.data.height + 'px';
    }
  });

  container.appendChild(iframe);
})();
