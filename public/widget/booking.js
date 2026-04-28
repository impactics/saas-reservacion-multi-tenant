/**
 * ReservaSaaS — Widget embebible
 *
 * Uso en cualquier ecommerce:
 *
 *   <div id="reserva-widget"></div>
 *   <script
 *     src="https://tudominio.app/widget/booking.js"
 *     data-slug="dra-maria-belen"
 *     data-api-key="srs_pub_xxxx"
 *     data-container="reserva-widget"
 *     data-primary="#01696f"
 *     data-base-url="https://tudominio.app"
 *   ></script>
 */
(function () {
  "use strict";

  var script     = document.currentScript;
  var SLUG       = script.dataset.slug      || "";
  var API_KEY    = script.dataset.apiKey    || "";
  var CONTAINER  = script.dataset.container || "reserva-widget";
  var PRIMARY    = script.dataset.primary   || "#01696f";
  var BASE_URL   = (script.dataset.baseUrl  || "").replace(/\/$/, "");
  var API_BASE   = BASE_URL + "/api/" + SLUG;

  if (!SLUG || !API_KEY || !BASE_URL) {
    console.error("[ReservaSaaS] Faltan atributos: data-slug, data-api-key, data-base-url");
    return;
  }

  // ── Fetch helper ────────────────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    return fetch(API_BASE + path, Object.assign({}, opts, {
      headers: Object.assign({
        "Content-Type": "application/json",
        "X-Api-Key": API_KEY,
      }, opts.headers || {}),
    })).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
        return data;
      });
    });
  }

  // ── Paises ──────────────────────────────────────────────────────────────────
  var COUNTRIES = [
    { flag: "\uD83C\uDDEA\uD83C\uDDE8", dial: "+593", name: "Ecuador" },
    { flag: "\uD83C\uDDFA\uD83C\uDDF8", dial: "+1",   name: "EE.UU." },
    { flag: "\uD83C\uDDE8\uD83C\uDDF4", dial: "+57",  name: "Colombia" },
    { flag: "\uD83C\uDDF5\uD83C\uDDEA", dial: "+51",  name: "Peru" },
    { flag: "\uD83C\uDDF2\uD83C\uDDFD", dial: "+52",  name: "Mexico" },
    { flag: "\uD83C\uDDFB\uD83C\uDDEA", dial: "+58",  name: "Venezuela" },
    { flag: "\uD83C\uDDE8\uD83C\uDDF1", dial: "+56",  name: "Chile" },
    { flag: "\uD83C\uDDE6\uD83C\uDDF7", dial: "+54",  name: "Argentina" },
    { flag: "\uD83C\uDDEA\uD83C\uDDF8", dial: "+34",  name: "Espana" },
    { flag: "\uD83C\uDDE7\uD83C\uDDF7", dial: "+55",  name: "Brasil" },
  ];

  // ── CSS ─────────────────────────────────────────────────────────────────────
  var css = [
    ".rsw-wrap *{box-sizing:border-box;font-family:system-ui,sans-serif}",
    ".rsw-wrap{max-width:560px;margin:0 auto}",
    ".rsw-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px}",
    ".rsw-card h3{margin:0 0 14px;font-size:15px;font-weight:600;color:#111}",
    ".rsw-list{display:flex;flex-direction:column;gap:8px}",
    ".rsw-btn{text-align:left;padding:12px 16px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-size:14px;transition:border-color .15s,background .15s}",
    ".rsw-btn:hover{border-color:" + PRIMARY + ";background:" + PRIMARY + "18}",
    ".rsw-btn.on{border-color:" + PRIMARY + ";background:" + PRIMARY + "18;color:" + PRIMARY + ";font-weight:600}",
    ".rsw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:10px}",
    ".rsw-slot{padding:10px 4px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-size:13px;font-weight:500;text-align:center;transition:all .15s}",
    ".rsw-slot:hover{border-color:" + PRIMARY + "}",
    ".rsw-slot.on{background:" + PRIMARY + ";border-color:" + PRIMARY + ";color:#fff}",
    ".rsw-lbl{display:block;font-size:13px;color:#6b7280;margin-bottom:4px;margin-top:12px}",
    ".rsw-inp{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:14px;outline:none;transition:border-color .15s}",
    ".rsw-inp:focus{border-color:" + PRIMARY + ";box-shadow:0 0 0 3px " + PRIMARY + "22}",
    ".rsw-date{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:14px;outline:none;margin-top:8px}",
    ".rsw-date:focus{border-color:" + PRIMARY + ";box-shadow:0 0 0 3px " + PRIMARY + "22}",
    ".rsw-phone-row{display:flex;border:1px solid #e5e7eb;border-radius:8px;overflow:visible;position:relative}",
    ".rsw-phone-row:focus-within{border-color:" + PRIMARY + ";box-shadow:0 0 0 3px " + PRIMARY + "22}",
    ".rsw-dial{display:flex;align-items:center;gap:4px;padding:0 10px;border:none;border-right:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:13px;font-weight:500;border-radius:8px 0 0 8px;white-space:nowrap}",
    ".rsw-num{flex:1;border:none;outline:none;padding:9px 12px;font-size:14px;background:transparent;border-radius:0 8px 8px 0}",
    ".rsw-dd{position:absolute;top:calc(100% + 4px);left:0;width:240px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px #0002;z-index:9999;overflow:hidden}",
    ".rsw-dd-s{width:100%;border:none;border-bottom:1px solid #e5e7eb;padding:8px 12px;font-size:13px;outline:none}",
    ".rsw-dd-ul{max-height:200px;overflow-y:auto}",
    ".rsw-dd-li{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;font-size:13px;transition:background .1s}",
    ".rsw-dd-li:hover{background:#f3f4f6}",
    ".rsw-dd-li.on{background:" + PRIMARY + "12;color:" + PRIMARY + ";font-weight:600}",
    ".rsw-sum{background:#f9fafb;border-radius:8px;padding:14px;font-size:13px}",
    ".rsw-row{display:flex;justify-content:space-between;padding:4px 0}",
    ".rsw-row span:first-child{color:#6b7280}",
    ".rsw-row span:last-child{font-weight:500}",
    ".rsw-submit{width:100%;padding:13px;background:" + PRIMARY + ";color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:14px;transition:opacity .15s}",
    ".rsw-submit:hover{opacity:.88}",
    ".rsw-submit:disabled{opacity:.5;cursor:not-allowed}",
    ".rsw-err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:12px}",
    ".rsw-ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:12px;padding:24px;text-align:center}",
    ".rsw-ok h3{margin:0 0 8px;font-size:18px}",
    ".rsw-hint{font-size:12px;color:#9ca3af;margin-top:4px}",
    ".rsw-muted{font-size:13px;color:#9ca3af;padding:4px 0}",
  ].join("");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Estado ───────────────────────────────────────────────────────────────────
  var S = {
    step: "service",
    services: [], professionals: [], slots: [],
    loading: false, error: "", submitting: false,
    service: null, professional: null,
    date: "", slot: null,
    name: "", email: "", dialCode: "+593", phone: "",
    ddOpen: false, ddSearch: "",
    result: null,
  };

  function set(patch) { Object.assign(S, patch); draw(); }

  function fullPhone() {
    var d = S.phone.replace(/\D/g, "");
    return d ? S.dialCode + d : "";
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function draw() {
    var el = document.getElementById(CONTAINER);
    if (!el) return;
    el.innerHTML = "";
    var w = document.createElement("div");
    w.className = "rsw-wrap";

    if (S.step === "done") {
      var ok = document.createElement("div");
      ok.className = "rsw-ok";
      ok.innerHTML = "<div style='font-size:40px;margin-bottom:12px'>\u2705</div>" +
        "<h3>\u00a1Cita agendada!</h3>" +
        "<p>Recibir\u00e1s confirmaci\u00f3n por WhatsApp.</p>";
      w.appendChild(ok);
    } else {
      if (S.error) {
        var err = document.createElement("div");
        err.className = "rsw-err";
        err.textContent = S.error;
        w.appendChild(err);
      }
      w.appendChild(drawServices());
      if (S.service) w.appendChild(drawDatetime());
      if (S.slot)    w.appendChild(drawPatient());
      if (S.slot && S.name && fullPhone()) w.appendChild(drawConfirm());
    }

    el.appendChild(w);
  }

  // Paso 1
  function drawServices() {
    var sec = card("1. Servicio");
    if (S.loading && !S.services.length) { sec.appendChild(muted("Cargando...")); return sec; }
    var list = document.createElement("div"); list.className = "rsw-list";
    S.services.forEach(function (svc) {
      var b = document.createElement("button");
      b.className = "rsw-btn" + (S.service && S.service.id === svc.id ? " on" : "");
      b.innerHTML = "<strong>" + svc.name + "</strong>&nbsp;<span style='color:#6b7280;font-size:13px'>" +
        svc.durationMinutes + " min &middot; $" + svc.price + " " + svc.currency + "</span>";
      b.onclick = function () {
        set({ service: svc, slot: null, slots: [], professional: null, professionals: [] });
        loadProfessionals(svc.id);
      };
      list.appendChild(b);
    });
    sec.appendChild(list);
    return sec;
  }

  // Paso 2
  function drawDatetime() {
    var sec = card("2. Fecha y hora");
    if (S.professionals.length > 1) {
      var pl = document.createElement("div"); pl.className = "rsw-list"; pl.style.marginBottom = "12px";
      S.professionals.forEach(function (p) {
        var b = document.createElement("button");
        b.className = "rsw-btn" + (S.professional && S.professional.id === p.id ? " on" : "");
        b.textContent = p.name;
        b.onclick = function () { set({ professional: p, slot: null, slots: [] }); if (S.date) loadSlots(); };
        pl.appendChild(b);
      });
      sec.appendChild(pl);
    }
    var today = new Date().toISOString().split("T")[0];
    var di = document.createElement("input");
    di.type = "date"; di.className = "rsw-date"; di.min = today; di.value = S.date;
    di.onchange = function (e) { set({ date: e.target.value, slot: null, slots: [] }); if (S.professional) loadSlots(); };
    sec.appendChild(di);
    if (S.loading) { sec.appendChild(muted("Cargando horarios...")); return sec; }
    if (!S.loading && S.date && !S.slots.length) { sec.appendChild(muted("No hay horarios disponibles.")); return sec; }
    if (S.slots.length) {
      var grid = document.createElement("div"); grid.className = "rsw-grid";
      S.slots.forEach(function (sl) {
        var b = document.createElement("button");
        b.className = "rsw-slot" + (S.slot && S.slot.start === sl.start ? " on" : "");
        b.textContent = sl.localStart;
        b.onclick = function () { set({ slot: sl }); };
        grid.appendChild(b);
      });
      sec.appendChild(grid);
    }
    return sec;
  }

  // Paso 3
  function drawPatient() {
    var sec = card("3. Tus datos");
    sec.appendChild(lbl("Nombre completo *"));
    sec.appendChild(inp("text", S.name, "Ej: Maria Perez", function (v) { set({ name: v }); }));
    sec.appendChild(lbl("Telefono (WhatsApp) *"));
    sec.appendChild(drawPhone());
    var hint = document.createElement("div"); hint.className = "rsw-hint";
    hint.textContent = "Se usar\u00e1 para enviarte la confirmaci\u00f3n por WhatsApp.";
    sec.appendChild(hint);
    sec.appendChild(lbl("Email (opcional)"));
    sec.appendChild(inp("email", S.email, "correo@ejemplo.com", function (v) { set({ email: v }); }));
    return sec;
  }

  function drawPhone() {
    var country = COUNTRIES.find(function (c) { return c.dial === S.dialCode; }) || COUNTRIES[0];
    var row = document.createElement("div"); row.className = "rsw-phone-row"; row.style.position = "relative";
    var db = document.createElement("button"); db.type = "button"; db.className = "rsw-dial";
    db.innerHTML = country.flag + " " + country.dial + " <span style='font-size:10px'>&#9662;</span>";
    db.onclick = function (e) { e.stopPropagation(); set({ ddOpen: !S.ddOpen, ddSearch: "" }); };
    row.appendChild(db);
    var ni = document.createElement("input"); ni.type = "tel"; ni.className = "rsw-num";
    ni.placeholder = "991234567"; ni.value = S.phone;
    ni.oninput = function (e) { set({ phone: e.target.value.replace(/[^\d\s-]/g, "") }); };
    row.appendChild(ni);
    if (S.ddOpen) {
      var dd = document.createElement("div"); dd.className = "rsw-dd";
      var ds = document.createElement("input"); ds.className = "rsw-dd-s";
      ds.placeholder = "Buscar pais..."; ds.value = S.ddSearch;
      ds.oninput = function (e) { set({ ddSearch: e.target.value }); };
      dd.appendChild(ds);
      var ul = document.createElement("div"); ul.className = "rsw-dd-ul";
      var filtered = S.ddSearch
        ? COUNTRIES.filter(function (c) {
            return c.name.toLowerCase().indexOf(S.ddSearch.toLowerCase()) >= 0 || c.dial.indexOf(S.ddSearch) >= 0;
          })
        : COUNTRIES;
      filtered.forEach(function (c) {
        var li = document.createElement("div");
        li.className = "rsw-dd-li" + (c.dial === S.dialCode ? " on" : "");
        li.innerHTML = c.flag + " <span style='flex:1'>" + c.name + "</span> <span style='color:#9ca3af'>" + c.dial + "</span>";
        li.style.display = "flex";
        li.onclick = function () { set({ dialCode: c.dial, ddOpen: false, ddSearch: "" }); };
        ul.appendChild(li);
      });
      dd.appendChild(ul); row.appendChild(dd);
      setTimeout(function () {
        document.addEventListener("click", function close(e) {
          if (!row.contains(e.target)) { set({ ddOpen: false }); document.removeEventListener("click", close); }
        });
      }, 0);
    }
    return row;
  }

  // Paso 4
  function drawConfirm() {
    var sec = card("4. Confirmar reserva");
    var sum = document.createElement("div"); sum.className = "rsw-sum";
    [
      ["Servicio",  S.service.name],
      ["Duracion",  S.service.durationMinutes + " min"],
      ["Fecha",     S.date],
      ["Hora",      (S.slot.localStart + " \u2014 " + S.slot.localEnd)],
      ["Paciente",  S.name],
      ["WhatsApp",  fullPhone()],
      ["Precio",    "$" + S.service.price + " " + S.service.currency],
    ].forEach(function (pair) {
      var row = document.createElement("div"); row.className = "rsw-row";
      row.innerHTML = "<span>" + pair[0] + "</span><span>" + pair[1] + "</span>";
      sum.appendChild(row);
    });
    sec.appendChild(sum);
    var btn = document.createElement("button");
    btn.className = "rsw-submit"; btn.disabled = S.submitting;
    btn.textContent = S.submitting ? "Agendando..." : "Confirmar cita";
    btn.onclick = submit;
    sec.appendChild(btn);
    return sec;
  }

  // ── Acciones ─────────────────────────────────────────────────────────────────
  function loadServices() {
    set({ loading: true, error: "" });
    api("/services").then(function (d) {
      set({ services: d.services, loading: false });
    }).catch(function (e) { set({ error: e.message, loading: false }); });
  }

  function loadProfessionals(serviceId) {
    set({ loading: true });
    api("/professionals?serviceId=" + serviceId).then(function (d) {
      var profs = d.professionals || [];
      set({ professionals: profs, professional: profs.length === 1 ? profs[0] : null, loading: false });
      if (profs.length === 1 && S.date) loadSlots();
    }).catch(function (e) { set({ error: e.message, loading: false }); });
  }

  function loadSlots() {
    if (!S.professional || !S.date) return;
    set({ loading: true, slots: [] });
    api("/availability?professionalId=" + S.professional.id + "&date=" + S.date)
      .then(function (d) { set({ slots: d.slots || [], loading: false }); })
      .catch(function (e) { set({ error: e.message, loading: false }); });
  }

  function submit() {
    set({ submitting: true, error: "" });
    api("/bookings", {
      method: "POST",
      body: JSON.stringify({
        serviceId: S.service.id,
        professionalId: S.professional.id,
        scheduledAt: S.slot.start,
        patientName: S.name,
        patientEmail: S.email || undefined,
        patientPhone: fullPhone(),
      }),
    }).then(function (d) {
      set({ submitting: false, step: "done", result: d.booking });
    }).catch(function (e) { set({ submitting: false, error: e.message }); });
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────────
  function card(title) {
    var d = document.createElement("div"); d.className = "rsw-card";
    var h = document.createElement("h3"); h.textContent = title; d.appendChild(h);
    return d;
  }
  function inp(type, value, placeholder, onChange) {
    var i = document.createElement("input"); i.type = type; i.className = "rsw-inp";
    i.value = value; i.placeholder = placeholder;
    i.oninput = function (e) { onChange(e.target.value); };
    return i;
  }
  function lbl(text) { var l = document.createElement("label"); l.className = "rsw-lbl"; l.textContent = text; return l; }
  function muted(text) { var p = document.createElement("p"); p.className = "rsw-muted"; p.textContent = text; return p; }

  // ── Init ────────────────────────────────────────────────────────────────────
  loadServices();
})();
