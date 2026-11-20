/*
 * hcpy Dishwasher Card
 * Lovelace card for Bosch/Siemens dishwashers that reach Home Assistant locally
 * over MQTT through hcpy (HomeConnect2MQTT with Home Assistant discovery). Finds
 * the entities of the device by the end of their unique_id (the BSH key),
 * translates the raw values (`Auto2`, `MainWash` …) and takes colors and fonts
 * only from the Home Assistant theme.
 */

const CARD_VERSION = "0.1.0";
const MODES = ["full", "row"];
const PARTS = ["options", "hints", "door"];

// Role → [domain, unique_id/entity_id endings, first match wins].
const ROLES = {
  state: ["sensor", ["status_operationstate", "operationstate"]],
  phase: ["sensor", ["programphase"]],
  progress: ["sensor", ["programprogress"]],
  remaining: ["sensor", ["remainingprogramtime"]],
  estimated: ["binary_sensor", ["remainingprogramtimeisestimated"]],
  active: ["select", ["activeprogram"]],
  selected: ["select", ["selectedprogram"]],
  door: ["sensor", ["doorstate"]],
  delay: ["sensor", ["startinrelative"]],
  remote_start: ["binary_sensor", ["remotecontrolstartallowed"]],
  abort: ["button", ["abortprogram"]],
  ack_select: ["select", ["acknowledgeevent"]],
  ack_button: ["button", ["acknowledgeevent"]],
  favorite: ["sensor", ["favorite_001_name"]],
  opt_extradry: ["switch", ["option_extradry", "extradry"]],
  opt_halfload: ["switch", ["option_halfload", "halfload"]],
  opt_variospeedplus: ["switch", ["option_variospeedplus", "variospeedplus"]],
  od_silence: ["switch", ["option_silenceondemand", "silenceondemand"]],
  od_silence_left: ["sensor", ["silenceondemandremainingtime"]],
  // a setting, not an option: settings stay writable while the program runs
  od_speed: ["switch", ["setting_speedondemand", "option_speedondemand", "speedondemand"]],
};
// Chosen before the start; the machine locks options once it runs …
const OPTIONS = ["extradry", "halfload", "variospeedplus"];
// … these two are switched while it runs. Not every program allows them; the
// bridge does not say which, so the machine's answer decides (error text).
// Role per on-demand control:
const ON_DEMAND = { silence: "od_silence", speed: "od_speed" };

// Appliance events worth a hint (sensor state `Present`), most urgent first.
const HINTS = [
  ["AquaStopOccured", "error", "mdi:water-alert"],
  ["DrainPumpBlocked", "error", "mdi:pump-off"],
  ["DrainingNotPossible", "error", "mdi:water-off"],
  ["InternalError", "error", "mdi:alert-circle"],
  ["LowWaterPressure", "error", "mdi:water-minus"],
  ["LowVoltage", "error", "mdi:flash-alert"],
  ["SaltLack", "warning", "mdi:shaker"],
  ["RinseAidLack", "warning", "mdi:water-opacity"],
  ["CheckFilterSystem", "warning", "mdi:filter-remove"],
  ["WaterheaterCalcified", "warning", "mdi:water-boiler-alert"],
  ["SaltNearlyEmpty", "info", "mdi:shaker-outline"],
  ["RinseAidNearlyEmpty", "info", "mdi:water-opacity"],
  ["MachineCareReminder", "info", "mdi:spray-bottle"],
  ["MachineCareAndFilterCleaningReminder", "info", "mdi:spray-bottle"],
  ["SmartFilterCleaningReminder", "info", "mdi:filter"],
];
const HINT_COLOR = { error: "var(--error-color)", warning: "var(--warning-color)", info: "var(--info-color, var(--primary-color))" };

const RUNNING = ["Run", "Pause", "DelayedStart", "Aborting"];
const ABORTABLE = ["Run", "Pause", "DelayedStart"];
const OFF = ["unavailable", "unknown", undefined, null, ""];
// How long a pressed button waits for the machine before it gives up showing a spinner.
const WAIT_MS = 30000;
// How long the abort button asks "really?" before it falls back.
const CONFIRM_MS = 4000;

const TEXT = {
  en: {
    name: "Dishwasher",
    no_device: "No dishwasher found. The card looks for an MQTT device with an OperationState and a ProgramPhase entity.",
    st_Inactive: "Off",
    st_Ready: "Ready",
    st_DelayedStart: "Delayed start",
    st_Run: "Running",
    st_Pause: "Paused",
    st_ActionRequired: "Action required",
    st_Finished: "Finished",
    st_Error: "Error",
    st_Aborting: "Aborting",
    st_offline: "Not reachable",
    ph_PreRinse: "Pre-rinse",
    ph_MainWash: "Main wash",
    ph_FinalRinse: "Final rinse",
    ph_Drying: "Drying",
    pr_Auto1: "Auto 35–45 °C",
    pr_Auto2: "Auto 45–65 °C",
    pr_Auto3: "Auto 65–75 °C",
    pr_Eco50: "Eco 50 °C",
    pr_Intensiv70: "Intensive 70 °C",
    pr_Quick45: "Quick 45 °C",
    pr_Quick65: "Quick 65 °C",
    pr_Glas40: "Glass 40 °C",
    pr_NightWash: "Night wash",
    pr_MixedLoad: "Mixed load",
    pr_PreRinse: "Pre-rinse",
    pr_MachineCare: "Machine care",
    pr_favorite: "Favorite",
    left: "{time} left",
    left_about: "about {time} left",
    done_at: "done {time}",
    starts_in: "Starts in {time}",
    starts_at: "at {time}",
    door_open: "Door open",
    door_closed: "Door closed",
    o_extradry: "Extra dry",
    o_halfload: "Half load",
    o_variospeedplus: "VarioSpeed",
    od_silence: "Silence",
    od_silence_left: "Silence · {time}",
    od_speed: "Finish faster",
    od_speed_on: "Sped up",
    starter: "Start when nobody is home",
    abort: "Cancel program",
    abort_confirm: "Really cancel?",
    ack: "OK",
    ack_label: "Acknowledge: {hint}",
    h_AquaStopOccured: "AquaStop triggered",
    h_DrainPumpBlocked: "Drain pump blocked",
    h_DrainingNotPossible: "Cannot drain",
    h_InternalError: "Internal error",
    h_LowWaterPressure: "Water pressure too low",
    h_LowVoltage: "Supply voltage too low",
    h_SaltLack: "Salt empty",
    h_RinseAidLack: "Rinse aid empty",
    h_CheckFilterSystem: "Check the filters",
    h_WaterheaterCalcified: "Water heater calcified",
    h_SaltNearlyEmpty: "Salt nearly empty",
    h_RinseAidNearlyEmpty: "Rinse aid nearly empty",
    h_MachineCareReminder: "Machine care due",
    h_MachineCareAndFilterCleaningReminder: "Machine care and filter cleaning due",
    h_SmartFilterCleaningReminder: "Clean the filter",
    error: "Could not do it: {msg}",
    ed_mode: "Display",
    mode_full: "Full card",
    mode_row: "Row",
    ed_name: "Name",
    ed_device_id: "Dishwasher (empty = find it)",
    ed_starter_entity: "Switch “start when nobody is home” (optional)",
    ed_hide: "Hide parts",
    ed_hide_options: "Options",
    ed_hide_hints: "Hints",
    ed_hide_door: "Door",
    ed_more: "More options",
    ed_tap_action: "Tap action (row)",
    ed_hold_action: "Hold action (row)",
  },
  de: {
    name: "Spülmaschine",
    no_device: "Keine Spülmaschine gefunden. Die Karte sucht ein MQTT-Gerät mit den Entitäten OperationState und ProgramPhase.",
    st_Inactive: "Aus",
    st_Ready: "Bereit",
    st_DelayedStart: "Startvorwahl",
    st_Run: "Läuft",
    st_Pause: "Pausiert",
    st_ActionRequired: "Aktion erforderlich",
    st_Finished: "Fertig",
    st_Error: "Fehler",
    st_Aborting: "Bricht ab",
    st_offline: "Nicht erreichbar",
    ph_PreRinse: "Vorspülen",
    ph_MainWash: "Hauptspülgang",
    ph_FinalRinse: "Klarspülen",
    ph_Drying: "Trocknen",
    pr_Auto1: "Auto 35–45 °C",
    pr_Auto2: "Auto 45–65 °C",
    pr_Auto3: "Auto 65–75 °C",
    pr_Eco50: "Eco 50 °C",
    pr_Intensiv70: "Intensiv 70 °C",
    pr_Quick45: "Schnell 45 °C",
    pr_Quick65: "Schnell 65 °C",
    pr_Glas40: "Glas 40 °C",
    pr_NightWash: "Nachtprogramm",
    pr_MixedLoad: "Gemischte Beladung",
    pr_PreRinse: "Vorspülen",
    pr_MachineCare: "Maschinenpflege",
    pr_favorite: "Favorit",
    left: "noch {time}",
    left_about: "noch ca. {time}",
    done_at: "fertig {time}",
    starts_in: "Startet in {time}",
    starts_at: "um {time}",
    door_open: "Tür offen",
    door_closed: "Tür zu",
    o_extradry: "Extra trocken",
    o_halfload: "Halbe Beladung",
    o_variospeedplus: "VarioSpeed",
    od_silence: "Leise",
    od_silence_left: "Leise · noch {time}",
    od_speed: "Schneller fertig",
    od_speed_on: "Beschleunigt",
    starter: "Starten, wenn niemand da ist",
    abort: "Programm abbrechen",
    abort_confirm: "Wirklich abbrechen?",
    ack: "OK",
    ack_label: "Quittieren: {hint}",
    h_AquaStopOccured: "AquaStop ausgelöst",
    h_DrainPumpBlocked: "Ablaufpumpe blockiert",
    h_DrainingNotPossible: "Abpumpen nicht möglich",
    h_InternalError: "Interner Fehler",
    h_LowWaterPressure: "Wasserdruck zu niedrig",
    h_LowVoltage: "Netzspannung zu niedrig",
    h_SaltLack: "Salz leer",
    h_RinseAidLack: "Klarspüler leer",
    h_CheckFilterSystem: "Filter prüfen",
    h_WaterheaterCalcified: "Heizung verkalkt",
    h_SaltNearlyEmpty: "Salz fast leer",
    h_RinseAidNearlyEmpty: "Klarspüler fast leer",
    h_MachineCareReminder: "Maschinenpflege fällig",
    h_MachineCareAndFilterCleaningReminder: "Maschinenpflege und Filterreinigung fällig",
    h_SmartFilterCleaningReminder: "Filter reinigen",
    error: "Hat nicht geklappt: {msg}",
    ed_mode: "Darstellung",
    mode_full: "Volle Karte",
    mode_row: "Zeile",
    ed_name: "Name",
    ed_device_id: "Spülmaschine (leer = selbst suchen)",
    ed_starter_entity: "Schalter „Starten, wenn niemand da ist“ (optional)",
    ed_hide: "Teile ausblenden",
    ed_hide_options: "Optionen",
    ed_hide_hints: "Hinweise",
    ed_hide_door: "Tür",
    ed_more: "Weitere Einstellungen",
    ed_tap_action: "Aktion beim Antippen (Zeile)",
    ed_hold_action: "Aktion beim Halten (Zeile)",
  },
};

function uiText(key) {
  const lang = (document.querySelector("home-assistant")?.hass?.language || navigator.language || "en").split("-")[0];
  return (TEXT[lang] || TEXT.en)[key] || TEXT.en[key] || key;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "MainWash" → "Main wash", "Intensiv70" → "Intensiv 70": unknown raw values stay readable.
const humanize = (raw) => {
  const s = String(raw).replace(/[_.]/g, " ").replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([0-9])([A-Za-z])/g, "$1 $2");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

class DishwasherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = null;
    this._busy = {}; // key → { watch, from, timer }
    this._confirm = false;
    this._error = "";
    this._uids = null; // entity_id → unique_id, once read from the registry

    this.shadowRoot.addEventListener("click", (e) => {
      const el = e.target.closest("[data-act]");
      if (!el) {
        const tile = e.target.closest("[data-tap]");
        if (tile && !this._held) this._action(tile.dataset.tap, "tap");
        this._held = false;
        return;
      }
      if (el.disabled) return;
      const { act, entity } = el.dataset;
      if (act === "abort") this._abort();
      if (act === "toggle") this._press(entity, entity, "homeassistant", "toggle", { entity_id: entity });
      if (act === "ack") this._ack(el.dataset.hint);
      if (act === "more") this._moreInfo(entity);
    });
    // row: hold action after half a second, Enter/Space as tap
    this.shadowRoot.addEventListener("pointerdown", (e) => {
      const tile = e.target.closest("[data-tap]");
      if (!tile || e.target.closest("[data-act]") || !this._config.hold_action) return;
      this._held = false;
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        this._held = true;
        this._action(tile.dataset.tap, "hold");
      }, 500);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
      this.shadowRoot.addEventListener(ev, () => clearTimeout(this._holdTimer), true);
    }
    this.shadowRoot.addEventListener("keydown", (e) => {
      const tile = e.target.matches?.("[data-tap]") ? e.target : null;
      if (tile && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        this._action(tile.dataset.tap, "tap");
      }
    });
  }

  // ---- Lovelace API ----------------------------------------------------------

  static getConfigForm() {
    return {
      schema: [
        {
          name: "mode",
          default: "full",
          selector: { select: { mode: "dropdown", options: MODES.map((m) => ({ value: m, label: uiText(`mode_${m}`) })) } },
        },
        { name: "name", selector: { text: {} } },
        { name: "device_id", selector: { device: { filter: { integration: "mqtt" } } } },
        { name: "starter_entity", selector: { entity: { domain: ["input_boolean", "switch"] } } },
        {
          name: "hide",
          selector: {
            select: { multiple: true, mode: "list", options: PARTS.map((p) => ({ value: p, label: uiText(`ed_hide_${p}`) })) },
          },
        },
        {
          type: "expandable",
          name: "more",
          title: uiText("ed_more"),
          flatten: true,
          schema: [
            { name: "tap_action", selector: { ui_action: {} } },
            { name: "hold_action", selector: { ui_action: {} } },
          ],
        },
      ],
      computeLabel: (schema) => uiText(`ed_${schema.name}`),
    };
  }

  static getStubConfig() {
    return {};
  }

  getCardSize() {
    return this._row ? 1 : 4;
  }

  getGridOptions() {
    if (this._row) return { rows: 1, columns: 12, min_columns: 6 };
    return { columns: 12, min_columns: 4 };
  }

  get _row() {
    return this._config?.mode === "row";
  }

  setConfig(config) {
    if (config.mode && !MODES.includes(config.mode)) throw new Error(`mode must be ${MODES.join(" or ")}`);
    this._config = { ...config, mode: config.mode || "full", hide: [].concat(config.hide || []) };
    this._sig = null;
    if (this._hass) this._update();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._readUniqueIds();
    this._update();
  }

  disconnectedCallback() {
    clearTimeout(this._confirmTimer);
  }

  _refresh() {
    this._sig = null;
    if (this._hass) this._update();
  }

  _t(key, vars = {}) {
    const lang = (this._hass?.language || "en").split("-")[0];
    const table = TEXT[lang] || TEXT.en;
    return (table[key] ?? TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  }

  _shows(part) {
    return !this._config.hide.includes(part);
  }

  // ---- discovery -------------------------------------------------------------
  // The bridge names its entities after the BSH keys; the unique_id keeps that
  // name even when an entity is renamed. The frontend registry has no unique_id,
  // so it is read once over the websocket; until then (or without access) the
  // entity_id stands in.

  async _readUniqueIds() {
    try {
      const ids = Object.entries(this._hass.entities || {})
        .filter(([, r]) => r.platform === "mqtt")
        .map(([id]) => id);
      if (!ids.length) return;
      const res = await this._hass.callWS({ type: "config/entity_registry/get_entries", entity_ids: ids });
      this._uids = {};
      for (const [id, e] of Object.entries(res || {})) if (e?.unique_id) this._uids[id] = String(e.unique_id).toLowerCase();
      this._refresh();
    } catch (_) {
      /* no access: entity_ids it is */
    }
  }

  _ends(id, end) {
    const name = this._uids?.[id] || id.split(".")[1];
    return name === end || name.endsWith(`_${end}`);
  }

  _findRole(devId, domain, ends) {
    const mine = Object.entries(this._hass.entities || {}).filter(
      ([id, r]) => r.device_id === devId && id.startsWith(`${domain}.`),
    );
    for (const end of ends) {
      const hit = mine.find(([id]) => this._ends(id, end));
      if (hit) return hit[0];
    }
    return undefined;
  }

  // Searched again only when the registry, the unique_ids or the config change,
  // not on every state update.
  _discover() {
    const hass = this._hass;
    const key = [hass.entities, this._uids, this._config];
    if (this._discKey && key.every((k, i) => k === this._discKey[i])) return this._discFound;
    this._discKey = key;
    this._discFound = this._search();
    return this._discFound;
  }

  _search() {
    const hass = this._hass;
    let devId = this._config.device_id;
    if (!devId) {
      const state = Object.entries(hass.entities || {}).find(
        ([id, r]) => r.platform === "mqtt" && r.device_id && id.startsWith("sensor.") && this._ends(id, "operationstate") &&
          this._findRole(r.device_id, "sensor", ["programphase"]),
      );
      devId = state?.[1].device_id;
    }
    if (!devId) return null;
    const e = {};
    for (const [role, [domain, ends]] of Object.entries(ROLES)) e[role] = this._findRole(devId, domain, ends);
    // hcpy sends appliance events as sensors (HCPY_EVENTS_AS_SENSORS) or as event entities
    for (const [name] of HINTS) {
      const n = name.toLowerCase();
      e[`h_${name}`] = this._findRole(devId, "sensor", [`event_${n}`]) || this._findRole(devId, "event", [`event_${n}`, n]);
    }
    if (!e.state) return null;
    const d = hass.devices?.[devId];
    return { id: devId, name: this._config.name || d?.name_by_user || this._t("name"), e };
  }

  _st(key) {
    const id = this._dev?.e[key];
    return id ? this._hass.states[id] : undefined;
  }

  _val(key) {
    const s = this._st(key)?.state;
    return OFF.includes(s) ? null : s;
  }

  _num(key) {
    const v = Number(this._val(key));
    return this._val(key) != null && Number.isFinite(v) ? v : null;
  }

  // ---- texts -----------------------------------------------------------------

  _known(prefix, raw) {
    return TEXT.en[`${prefix}${raw}`] ? this._t(`${prefix}${raw}`) : humanize(raw);
  }

  _program(state) {
    const raw = this._val(RUNNING.includes(state) || state === "Finished" ? "active" : "selected") ?? this._val("active");
    if (raw == null) return "";
    if (/^\d+$/.test(raw)) return this._val("favorite") || this._t("pr_favorite");
    return this._known("pr_", raw);
  }

  _phase() {
    const raw = this._val("phase");
    return raw && raw !== "None" ? this._known("ph_", raw) : "";
  }

  _dur(sec) {
    const min = Math.max(1, Math.round(sec / 60));
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  }

  _clock(sec) {
    return new Intl.DateTimeFormat(this._hass.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(Date.now() + sec * 1000));
  }

  // Everything the full card and the row show, worked out once.
  _view() {
    const st = this._st("state");
    const offline = !st || st.state === "unavailable";
    const state = offline ? "offline" : this._val("state") || "offline";
    const remaining = this._num("remaining");
    const delay = this._num("delay");
    const about = this._val("estimated") === "on";
    const phase = this._phase();
    const program = offline ? "" : this._program(state);
    let status = this._known("st_", state);
    let detail = [];
    let when = "";
    if ((state === "Run" || state === "Pause") && remaining != null) {
      when = this._t(about ? "left_about" : "left", { time: this._dur(remaining) });
      if (state === "Run") status = when;
      detail = [state === "Pause" ? when : "", phase, program, this._t("done_at", { time: this._clock(remaining) })];
    } else if (state === "Run" || state === "Pause") {
      detail = [phase, program];
    } else if (state === "DelayedStart" && delay) {
      status = when = this._t("starts_in", { time: this._dur(delay) });
      detail = [program, this._t("starts_at", { time: this._clock(delay) })];
    } else if (!offline) {
      detail = [program];
    }
    // during a program the chosen options are just part of the description
    if (RUNNING.includes(state) || state === "Finished") {
      const at = program ? detail.indexOf(program) + 1 : detail.length;
      detail.splice(at, 0, ...this._activeOptions());
    }
    const doorOpen = !offline && this._shows("door") && this._val("door") === "Open";
    if (doorOpen) detail.unshift(this._t("door_open"));
    const progress = state === "Run" || state === "Pause" ? this._num("progress") : null;
    return { state, offline, status, detail: detail.filter(Boolean), when, phase, progress, doorOpen };
  }

  // Chosen options for the description line. Speeding up switches VarioSpeed
  // on by itself; "Sped up" already says so, so it is not named twice.
  _activeOptions() {
    if (!this._shows("options")) return [];
    const sped = this._val(ON_DEMAND.speed) === "on";
    return OPTIONS.filter((o) => this._val(`opt_${o}`) === "on" && !(sped && o === "variospeedplus")).map((o) => this._t(`o_${o}`));
  }

  _hints() {
    if (!this._shows("hints")) return [];
    return HINTS.filter(([name]) => this._hintState(name) === "Present").map(([name, level, icon]) => ({ name, level, icon }));
  }

  // Off / Present / Confirmed: a sensor's state, or an event entity's last event type.
  _hintState(name) {
    const st = this._st(`h_${name}`);
    if (!st || OFF.includes(st.state)) return null;
    return st.entity_id.startsWith("event.") ? st.attributes?.event_type : st.state;
  }

  // ---- actions ---------------------------------------------------------------

  // A pressed control waits for the machine: it shows a spinner until `watch`
  // changes, the call fails, or WAIT_MS have passed.
  async _press(key, watch, domain, service, data) {
    if (this._busy[key]) return;
    const timer = setTimeout(() => this._release(key), WAIT_MS);
    this._busy[key] = { watch, from: this._hass.states[watch]?.state, timer };
    this._error = "";
    this._refresh();
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this._release(key);
      this._error = this._t("error", { msg: err?.message || err });
      this._refresh();
    }
  }

  _release(key) {
    clearTimeout(this._busy[key]?.timer);
    delete this._busy[key];
    this._refresh();
  }

  // First tap asks, the second within CONFIRM_MS cancels the program.
  _abort() {
    const id = this._dev?.e.abort;
    if (!id) return;
    clearTimeout(this._confirmTimer);
    if (!this._confirm) {
      this._confirm = true;
      this._confirmTimer = setTimeout(() => {
        this._confirm = false;
        this._refresh();
      }, CONFIRM_MS);
      return this._refresh();
    }
    this._confirm = false;
    this._press("abort", this._dev.e.state, "button", "press", { entity_id: id });
  }

  // Acknowledge one hint: the bridge's AcknowledgeEvent list names each event
  // ("SaltNearlyEmpty (4626)"); without it, the plain AcknowledgeEvent button.
  _ack(name) {
    const e = this._dev?.e;
    if (!e) return;
    const sel = this._st("ack_select");
    const option = sel?.attributes?.options?.find((o) => o === name || o.startsWith(`${name} (`));
    if (option) this._press(`ack:${name}`, e[`h_${name}`], "select", "select_option", { entity_id: e.ack_select, option });
    else if (e.ack_button) this._press(`ack:${name}`, e[`h_${name}`], "button", "press", { entity_id: e.ack_button });
  }

  _canAck(name) {
    const sel = this._st("ack_select");
    return !!sel?.attributes?.options?.some((o) => o === name || o.startsWith(`${name} (`)) || !!this._dev?.e.ack_button;
  }

  // Row tap/hold: HA runs the action (more-info by default, navigate, perform-action …).
  _action(entity, kind) {
    const config = { entity, tap_action: { action: "more-info" }, ...this._config };
    this.dispatchEvent(new CustomEvent("hass-action", { detail: { config, action: kind }, bubbles: true, composed: true }));
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // ---- rendering -------------------------------------------------------------

  _update() {
    if (!this._config) return;
    const hass = this._hass;
    const dev = this._discover();
    this._dev = dev;
    for (const [key, b] of Object.entries(this._busy)) {
      if (hass.states[b.watch]?.state !== b.from) {
        clearTimeout(b.timer);
        delete this._busy[key];
      }
    }
    const ids = dev ? [...Object.values(dev.e), this._config.starter_entity].filter(Boolean) : [];
    const sig = JSON.stringify([
      ids.map((id) => [hass.states[id]?.state, hass.states[id]?.attributes?.options]),
      Object.keys(this._busy),
      this._confirm,
      this._error,
      this._config,
      hass.language,
      !!this._uids,
      // "done 21:40" moves with the clock
      Math.floor(Date.now() / 60000),
    ]);
    if (sig === this._sig) return;
    this._sig = sig;

    const css = `<style>${this._css()}</style>`;
    if (!dev) {
      this.shadowRoot.innerHTML = `${css}<ha-card class="${this._row ? "tile" : ""}"><div class="note">${this._t("no_device")}</div></ha-card>`;
      return;
    }
    const view = this._view();
    this.shadowRoot.innerHTML = css + (this._row ? this._renderTile(dev, view) : this._renderFull(dev, view));
  }

  _spinner() {
    return `<ha-icon icon="mdi:loading" class="spin"></ha-icon>`;
  }

  // The one main button: cancel while a program runs or waits to start.
  _abortBtn(view) {
    if (!this._dev.e.abort || !ABORTABLE.includes(view.state)) return "";
    const busy = !!this._busy.abort;
    const ask = this._confirm;
    const label = this._t(ask ? "abort_confirm" : "abort");
    return `<button class="main ${ask ? "ask" : ""}" data-act="abort" ${busy ? "disabled" : ""} title="${label}" aria-label="${label}">
      ${busy ? this._spinner() : `<ha-icon icon="mdi:${ask ? "help" : "stop"}"></ha-icon>`}</button>`;
  }

  _bar(progress, label) {
    if (progress == null) return "";
    const v = Math.max(0, Math.min(100, progress));
    return `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${Math.round(v)}" aria-valuemin="0"
      aria-valuemax="100"><div style="width:${v}%"></div></div>`;
  }

  _icon(view) {
    const icon = view.offline ? "mdi:dishwasher-off" : view.state === "Finished" ? "mdi:dishwasher-alert" : "mdi:dishwasher";
    const badge = view.doorOpen ? `<span class="badge" title="${this._t("door_open")}"><ha-icon icon="mdi:door-open"></ha-icon></span>` : "";
    return `<div class="dicon ${view.offline ? "off" : ""} ${RUNNING.includes(view.state) ? "on" : ""}"><ha-icon icon="${icon}"></ha-icon>${badge}</div>`;
  }

  // A switch as a chip: filled when on, spinner while the machine answers.
  // Without an icon it shows a check / plus, so off still reads as "add".
  _toggleChip(id, label, icon) {
    const st = id && this._hass.states[id];
    if (!st || OFF.includes(st.state)) return "";
    const on = st.state === "on";
    const busy = !!this._busy[id];
    const sym = busy ? this._spinner() : `<ha-icon icon="${icon || `mdi:${on ? "check" : "plus"}`}"></ha-icon>`;
    return `<button class="chip toggle ${on ? "on" : ""}" data-act="toggle" data-entity="${id}" role="switch"
      aria-checked="${on}" ${busy ? "disabled" : ""}>${sym}${esc(label)}</button>`;
  }

  _renderFull(dev, view) {
    const color = view.state === "Error" || view.state === "ActionRequired" ? "var(--error-color)" : "";
    const head = `
      <div class="head">
        ${this._icon(view)}
        <div class="text">
          <div class="name">${esc(dev.name)}</div>
          <div class="status" ${color ? `style="color:${color}"` : ""}>${esc(view.status)}</div>
          ${view.detail.length ? `<div class="sub">${view.detail.map(esc).join(" · ")}</div>` : ""}
        </div>
        ${this._abortBtn(view)}
        ${this._bar(view.progress, view.status)}
      </div>`;

    // chips only where something can be set: the options before a start (while
    // running they are part of the description line), on-demand while it runs
    const chips = [];
    if (this._shows("options") && view.state === "Ready") {
      for (const o of OPTIONS) chips.push(this._toggleChip(dev.e[`opt_${o}`], this._t(`o_${o}`)));
    }
    if (this._shows("options") && view.state === "Run") {
      for (const [o, role] of Object.entries(ON_DEMAND)) {
        // speeding up cannot be taken back: once on, it is a plain note
        if (o === "speed" && this._val(role) === "on") {
          chips.push(`<span class="tag"><ha-icon icon="mdi:fast-forward"></ha-icon>${this._t("od_speed_on")}</span>`);
          continue;
        }
        const left = o === "silence" && this._val(role) === "on" ? this._num("od_silence_left") : null;
        const label = left ? this._t("od_silence_left", { time: this._dur(left) }) : this._t(`od_${o}`);
        chips.push(this._toggleChip(dev.e[role], label, o === "silence" ? "mdi:volume-off" : "mdi:fast-forward"));
      }
    }
    const starter = this._config.starter_entity && this._hass.states[this._config.starter_entity];
    if (starter && !view.offline && !RUNNING.includes(view.state)) {
      chips.push(this._toggleChip(starter.entity_id, this._t("starter"), "mdi:home-export-outline"));
    }
    const chipRow = chips.some(Boolean) ? `<div class="chips">${chips.join("")}</div>` : "";

    const hints = this._hints()
      .map((h) => {
        const busy = !!this._busy[`ack:${h.name}`];
        const text = this._t(`h_${h.name}`);
        const ack = this._canAck(h.name)
          ? `<button class="ack" data-act="ack" data-hint="${h.name}" ${busy ? "disabled" : ""} aria-label="${esc(this._t("ack_label", { hint: text }))}">
              ${busy ? this._spinner() : this._t("ack")}</button>`
          : "";
        // errors and warnings stand out; reminders are quiet rows
        return `<div class="hint ${h.level === "info" ? "quiet" : ""}" style="--hint:${HINT_COLOR[h.level]}"><ha-icon icon="${h.icon}"></ha-icon><span>${esc(text)}</span>${ack}</div>`;
      })
      .join("");
    const hintBox = hints ? `<div class="hints">${hints}</div>` : "";
    const err = this._error ? `<div class="msg" role="alert">${esc(this._error)}</div>` : "";
    return `<ha-card><div class="dev">${head}${chipRow}${hintBox}</div>${err}</ha-card>`;
  }

  // ---- row (mode: row) ------------------------------------------------------
  // Tile-sized: icon, name, "Main wash · 1 h 50 min left", 3 px progress, cancel.
  _renderTile(dev, view) {
    // the row only names what needs doing now; reminders stay in the full card
    const hint = this._hints().find((h) => h.level !== "info");
    let line;
    if (view.state === "Run" || view.state === "Pause") {
      const first = view.state === "Pause" ? this._t("st_Pause") : view.phase || this._t("st_Run");
      line = [first, view.when].filter(Boolean).map(esc).join(" · ");
    } else {
      line = esc(view.status);
    }
    if (hint) line += ` · <span style="color:${HINT_COLOR[hint.level]}">${esc(this._t(`h_${hint.name}`))}</span>`;
    const err = this._error ? `<div class="msg" role="alert">${esc(this._error)}</div>` : "";
    return `
      <ha-card class="tile" data-tap="${dev.e.state}" role="button" tabindex="0" aria-label="${esc(dev.name)}"><div class="t-in">
        ${this._icon(view)}
        <div class="text">
          <div class="r-name">${esc(dev.name)}</div>
          <div class="sub t-line">${line}</div>
          ${this._bar(view.progress, view.status)}
        </div>
        ${this._abortBtn(view)}
      </div></ha-card>${err}`;
  }

  // Same building blocks as the ember, cremalink and airfryer cards.
  _css() {
    return `
      :host { display: block; container-type: inline-size; }
      ha-card { padding: 12px 14px; }
      .note { color: var(--secondary-text-color); padding: 4px; }
      /* one device: its content sits right in the card, no inner panel */
      .dev { display: block; }
      .head { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; column-gap: 14px; align-items: center; }
      .text { display: flex; flex-direction: column; min-width: 0; }
      .name { font-size: 14px; color: var(--secondary-text-color); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status { font-size: 22px; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
      .sub { font-size: 12px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
      .bar { grid-column: 1 / -1; margin-top: 8px; height: 6px; border-radius: 3px; background: var(--divider-color); overflow: hidden; }
      .bar div { height: 100%; border-radius: 3px; background: var(--accent-color, var(--primary-color)); transition: width .6s ease; }

      .dicon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; --mdc-icon-size: 32px;
        color: var(--secondary-text-color); background: var(--secondary-background-color); }
      .dicon.on { color: var(--accent-color, var(--primary-color));
        background: color-mix(in srgb, var(--accent-color, var(--primary-color)) 20%, transparent); }
      .dicon.off { opacity: .5; }

      .main { all: unset; box-sizing: border-box; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
        cursor: pointer; background: var(--primary-color); color: var(--text-primary-color); }
      .main ha-icon { --mdc-icon-size: 22px; }
      .main:hover { filter: brightness(1.08); }
      .main.ask { background: var(--error-color); }

      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .chip { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px;
        border-radius: 16px; border: 1px solid var(--divider-color); background: var(--card-background-color); font-size: 13px;
        color: var(--primary-text-color); cursor: pointer; }
      .chip ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color); }
      .chip:hover { border-color: var(--primary-color); }
      .chip.on { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color); }
      .chip.on ha-icon { color: var(--text-primary-color); }
      /* a state, not a control: no border, no pointer */
      .tag { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 4px; font-size: 13px;
        color: var(--accent-color, var(--primary-color)); }
      .tag ha-icon { --mdc-icon-size: 16px; }
      .dicon { position: relative; }
      .badge { position: absolute; top: -3px; right: -5px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
        background: var(--warning-color); box-shadow: 0 0 0 2px var(--card-background-color); }
      .badge ha-icon { --mdc-icon-size: 14px; color: var(--text-primary-color); }
      .t-in .badge { width: 16px; height: 16px; top: -4px; right: -4px; box-shadow: 0 0 0 2px var(--card-background-color); }
      .t-in .badge ha-icon { --mdc-icon-size: 11px; }

      .hints { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
      .hint { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; column-gap: 10px; align-items: center; min-height: 36px;
        padding: 0 4px 0 10px; border-radius: 10px; font-size: 14px;
        background: color-mix(in srgb, var(--hint) 14%, var(--card-background-color)); }
      .hint ha-icon { --mdc-icon-size: 20px; color: var(--hint); }
      .hint.quiet { background: none; min-height: 32px; font-size: 13px; color: var(--secondary-text-color); }
      .hint.quiet + .hint.quiet { border-top: 1px solid var(--divider-color); border-radius: 0; }
      .hint.quiet ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
      .ack { all: unset; box-sizing: border-box; min-width: 44px; height: 28px; padding: 0 10px; border-radius: 14px; display: grid;
        place-items: center; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--primary-color);
        border: 1px solid var(--primary-color); background: var(--card-background-color); }
      .ack:hover { background: var(--primary-color); color: var(--text-primary-color); }
      .ack ha-icon { --mdc-icon-size: 16px; }

      button[disabled] { cursor: default; pointer-events: none; opacity: .7; }
      button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .msg { margin-top: 8px; font-size: 13px; color: var(--error-color); }

      @container (max-width: 360px) {
        ha-card { padding: 10px; }
        .head { grid-template-columns: 44px minmax(0, 1fr) auto; column-gap: 10px; }
        .dicon { width: 44px; height: 44px; --mdc-icon-size: 26px; }
        .status { font-size: 18px; }
      }
      @media (prefers-reduced-motion: reduce) { .bar div { transition: none; } .spin { animation: none; } }

      /* row: tile-sized */
      ha-card.tile { padding: 0; cursor: pointer; overflow: hidden; }
      ha-card.tile .note { padding: 12px; }
      .t-in { box-sizing: border-box; height: 56px; padding: 0 10px; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto;
        column-gap: 10px; align-items: center; }
      ha-card.tile:hover { background: color-mix(in srgb, var(--primary-text-color) 4%, var(--card-background-color)); }
      ha-card.tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
      .t-in .dicon { width: 40px; height: 40px; --mdc-icon-size: 22px; color: var(--accent-color, var(--primary-color));
        background: color-mix(in srgb, var(--accent-color, var(--primary-color)) 18%, transparent); }
      .t-in .dicon.off { color: var(--secondary-text-color); background: var(--secondary-background-color); }
      .r-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .t-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
      .tile .bar { margin-top: 4px; height: 3px; border-radius: 2px; }
      .tile .main { width: 36px; height: 36px; }
      .tile .main ha-icon { --mdc-icon-size: 20px; }
    `;
  }
}

customElements.define("hcpy-dishwasher-card", DishwasherCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "hcpy-dishwasher-card",
  name: "Dishwasher (hcpy)",
  description: "Bosch/Siemens dishwasher connected locally through hcpy (HomeConnect2MQTT): state, program, phase, time left, options, salt and rinse aid hints, cancel.",
  preview: true,
});

console.info(`%c HCPY-DISHWASHER-CARD %c ${CARD_VERSION} `, "font-weight: 700", "");
