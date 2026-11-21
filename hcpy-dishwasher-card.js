/*
 * hcpy Dishwasher Card
 * Lovelace card for Bosch/Siemens dishwashers that reach Home Assistant locally
 * over MQTT through hcpy (HomeConnect2MQTT with Home Assistant discovery). Finds
 * the entities of the device by the end of their unique_id (the BSH key),
 * translates the raw values (`Auto2`, `MainWash` …) and takes colors and fonts
 * only from the Home Assistant theme.
 */

const CARD_VERSION = "0.1.4";
const MODES = ["full", "row"];
const PARTS = ["options", "program", "hints", "door", "care", "settings", "controls"];

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
  power: ["switch", ["setting_powerstate", "powerstate"]],
  delay_set: ["number", ["option_startinrelative", "startinrelative"]],
  ack_select: ["select", ["acknowledgeevent"]],
  ack_button: ["button", ["acknowledgeevent"]],
  favorite: ["sensor", ["favorite_001_name"]],
  started_count: ["sensor", ["all_count_started", "count_started"]],
  set_rinseaid: ["select", ["setting_rinseaid", "rinseaid"]],
  set_waterhardness: ["select", ["setting_waterhardness", "waterhardness"]],
  set_turbidity: ["select", ["setting_sensitivityturbidity", "sensitivityturbidity"]],
  set_hotwater: ["select", ["setting_hotwater", "hotwater"]],
  set_ecoasdefault: ["select", ["setting_ecoasdefault", "ecoasdefault"]],
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
// Care at a glance: per item the event that means empty/due and the one that means nearly empty.
const CARE = [
  ["salt", "SaltLack", "SaltNearlyEmpty"],
  ["rinse_aid", "RinseAidLack", "RinseAidNearlyEmpty"],
  ["machine_care", "MachineCareAndFilterCleaningReminder", "MachineCareReminder"],
  ["filter", "CheckFilterSystem", "SmartFilterCleaningReminder"],
];
// Settings of the dishwasher that are shown in the settings fold, in this order.
const SETTINGS = ["set_rinseaid", "set_waterhardness", "set_turbidity", "set_hotwater", "set_ecoasdefault"];

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
// While a program runs, the icon shows its phase.
const PHASE_ICON = { PreRinse: "mdi:water-outline", MainWash: "mdi:dishwasher", FinalRinse: "mdi:shimmer", Drying: "mdi:heat-wave" };
// Delayed start: steps of the minus/plus buttons and the most the dishwasher accepts (StartInRelative, 24 h).
const DELAY_STEP_MIN = 30;
const DELAY_MAX_MIN = 24 * 60;
const OFF = ["unavailable", "unknown", undefined, null, ""];
// How long a pressed button waits for the machine before it gives up showing a spinner.
const WAIT_MS = 30000;
// A switch answers in 2–3 s; no answer after this means the machine ignored it.
const SWITCH_WAIT_MS = 10000;
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
    takes: "takes about {time}",
    door_open: "Door open",
    door_closed: "Door closed",
    o_extradry: "Extra dry",
    o_halfload: "Half load",
    o_variospeedplus: "VarioSpeed",
    od_silence: "Silence",
    od_silence_left: "Silence · {time}",
    od_speed: "Finish faster",
    od_speed_on: "Sped up",
    abort: "Cancel program",
    start: "Start program",
    power_on: "Switch on",
    power_off: "Switch off",
    close_door: "Close the door to start",
    allow_remote: "Allow remote start on the dishwasher",
    program: "Program",
    delay_label: "Delayed start",
    delay_now: "Right away",
    delay_in: "In {time} · at {clock}",
    delay_less: "Start earlier",
    delay_more: "Start later",
    not_started: "The dishwasher did not start.",
    ed_start_options: "Switch on before every start (if the program allows it)",
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
    not_taken: "The dishwasher did not take it – maybe not possible with this program.",
    ed_mode: "Display",
    mode_full: "Full card",
    mode_row: "Row",
    ed_name: "Name",
    ed_device_id: "Dishwasher (empty = find it)",
    ed_starter_entity: "Extra switch next to the options, e.g. for your own start automation (optional)",
    ed_starter_name: "Name of that switch (empty = its entity name)",
    ed_starter_icon: "Icon of that switch (empty = its entity icon)",
    ed_hide: "Hide parts",
    ed_hide_options: "Options",
    ed_hide_hints: "Hints",
    ed_hide_door: "Door",
    ed_hide_care: "Care",
    ed_hide_settings: "Settings",
    ed_hide_program: "Program and delayed start",
    ed_hide_controls: "All buttons (display only)",
    ed_preselect_entity: "Text helper for the preselection when switched on (optional, see README)",
    care: "Care",
    c_salt: "Salt",
    c_rinse_aid: "Rinse aid",
    c_machine_care: "Machine care",
    c_filter: "Filter",
    cs_ok: "OK",
    cs_low: "Nearly empty",
    cs_empty: "Empty",
    cs_due: "Due",
    cs_soon: "Due soon",
    started_count: "Programs started",
    care_program: "Preselect machine care",
    settings: "Settings",
    set_rinseaid: "Rinse aid dosage",
    set_waterhardness: "Water hardness",
    set_turbidity: "Turbidity sensor",
    set_hotwater: "Water connection",
    set_ecoasdefault: "Program when switched on",
    v_Off: "Off",
    v_level: "Level {n}",
    v_Standard: "Standard",
    v_Sensitive: "Sensitive",
    v_VerySensitive: "Very sensitive",
    v_ColdWater: "Cold water",
    v_HotWater: "Hot water",
    v_LastProgram: "Last program",
    v_EcoAsDefault: "Eco",
    preselect: "Preselection when switched on",
    preselect_hint: "Set when the dishwasher is switched on (by the preselection automation).",
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
    takes: "dauert ca. {time}",
    door_open: "Tür offen",
    door_closed: "Tür zu",
    o_extradry: "Extra trocken",
    o_halfload: "Halbe Beladung",
    o_variospeedplus: "VarioSpeed",
    od_silence: "Leise",
    od_silence_left: "Leise · noch {time}",
    od_speed: "Schneller fertig",
    od_speed_on: "Beschleunigt",
    abort: "Programm abbrechen",
    start: "Programm starten",
    power_on: "Einschalten",
    power_off: "Ausschalten",
    close_door: "Zum Starten die Tür schließen",
    allow_remote: "Fernstart an der Maschine freigeben",
    program: "Programm",
    delay_label: "Startvorwahl",
    delay_now: "Sofort",
    delay_in: "In {time} · um {clock}",
    delay_less: "Früher starten",
    delay_more: "Später starten",
    not_started: "Die Spülmaschine ist nicht gestartet.",
    ed_start_options: "Vor jedem Start einschalten (wenn das Programm es erlaubt)",
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
    not_taken: "Hat die Maschine nicht übernommen – bei diesem Programm vielleicht nicht möglich.",
    ed_mode: "Darstellung",
    mode_full: "Volle Karte",
    mode_row: "Zeile",
    ed_name: "Name",
    ed_device_id: "Spülmaschine (leer = selbst suchen)",
    ed_starter_entity: "Zusätzlicher Schalter neben den Optionen, z. B. für eine eigene Start-Automation (optional)",
    ed_starter_name: "Name dieses Schalters (leer = Name der Entität)",
    ed_starter_icon: "Symbol dieses Schalters (leer = Symbol der Entität)",
    ed_hide: "Teile ausblenden",
    ed_hide_options: "Optionen",
    ed_hide_hints: "Hinweise",
    ed_hide_door: "Tür",
    ed_hide_care: "Pflege",
    ed_hide_settings: "Einstellungen",
    ed_hide_program: "Programm und Startvorwahl",
    ed_hide_controls: "Alle Knöpfe (nur Anzeige)",
    ed_preselect_entity: "Text-Helfer für die Vorwahl beim Einschalten (optional, siehe README)",
    care: "Pflege",
    c_salt: "Salz",
    c_rinse_aid: "Klarspüler",
    c_machine_care: "Maschinenpflege",
    c_filter: "Filter",
    cs_ok: "In Ordnung",
    cs_low: "Fast leer",
    cs_empty: "Leer",
    cs_due: "Fällig",
    cs_soon: "Bald fällig",
    started_count: "Gestartete Programme",
    care_program: "Maschinenpflege vorwählen",
    settings: "Einstellungen",
    set_rinseaid: "Klarspüler-Dosierung",
    set_waterhardness: "Wasserhärte",
    set_turbidity: "Trübungssensor",
    set_hotwater: "Wasseranschluss",
    set_ecoasdefault: "Programm beim Einschalten",
    v_Off: "Aus",
    v_level: "Stufe {n}",
    v_Standard: "Standard",
    v_Sensitive: "Empfindlich",
    v_VerySensitive: "Sehr empfindlich",
    v_ColdWater: "Kaltwasser",
    v_HotWater: "Warmwasser",
    v_LastProgram: "Zuletzt genutztes",
    v_EcoAsDefault: "Eco",
    preselect: "Vorwahl beim Einschalten",
    preselect_hint: "Wird beim Einschalten gesetzt (über die Vorwahl-Automation).",
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
    this._delayPending = null; // delayed start (minutes) just picked, until the dishwasher reports it
    this._open = {}; // which folds (care, settings) are open

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
      if (act === "start") this._start();
      if (act === "power") this._press("power", entity, "switch", "turn_on", { entity_id: entity });
      if (act === "power-off")
        this._press("power-off", entity, "switch", "turn_off", { entity_id: entity }, { wait: SWITCH_WAIT_MS, ignored: "not_taken" });
      if (act === "delay") this._stepDelay(Number(el.dataset.dir));
      if (act === "fold") {
        this._open[el.dataset.fold] = !this._open[el.dataset.fold];
        this._refresh();
      }
      if (act === "care-program") this._chooseProgram("MachineCare");
      if (act === "pre-opt") this._togglePreselectOption(el.dataset.opt);
      // the machine answers a switch within seconds; options a program does not allow it ignores silently
      if (act === "toggle")
        this._press(entity, entity, "homeassistant", "toggle", { entity_id: entity }, { wait: SWITCH_WAIT_MS, ignored: "not_taken" });
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
    this.shadowRoot.addEventListener("change", (e) => {
      if (e.target.matches?.("select[data-act='program']") && e.target.value) this._chooseProgram(e.target.value);
      if (e.target.matches?.("select[data-act='setting']") && e.target.value) {
        const id = e.target.dataset.entity;
        this._press(id, id, "select", "select_option", { entity_id: id, option: e.target.value }, { wait: SWITCH_WAIT_MS, ignored: "not_taken" });
      }
      if (e.target.matches?.("select[data-act='pre-program']") && e.target.value) this._writePreselect({ program: e.target.value });
      if (e.target.matches?.("select[data-act='delay-pick']")) {
        this._setDelay(Number(e.target.value) || 0);
      }
    });
    // keep the card still while the program drop-down is open
    this.shadowRoot.addEventListener("focusin", (e) => {
      if (e.target.matches?.("select")) this._hold = true;
    });
    this.shadowRoot.addEventListener("focusout", () => {
      this._hold = false;
      setTimeout(() => this._refresh(), 0);
    });
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
        { name: "starter_name", selector: { text: {} } },
        { name: "starter_icon", selector: { icon: {} } },
        { name: "preselect_entity", selector: { entity: { domain: "input_text" } } },
        {
          name: "start_options",
          selector: {
            select: { multiple: true, mode: "list", options: OPTIONS.map((o) => ({ value: o, label: uiText(`o_${o}`) })) },
          },
        },
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
    clearTimeout(this._delayTimer);
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
    return raw == null ? "" : this._programName(raw);
  }

  // "Auto2" → "Auto 45–65 °C"; a number is a favorite slot, named after the favorite.
  _programName(raw) {
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
    // no-break spaces: "2 h 25 min" never splits over two lines
    return (h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`).replace(/ /g, "\u00a0");
  }

  _clock(sec) {
    return new Intl.DateTimeFormat(this._hass.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(Date.now() + sec * 1000));
  }

  // Everything the full card and the row show, worked out once.
  _view() {
    const st = this._st("state");
    const offline = !st || st.state === "unavailable";
    let state = offline ? "offline" : this._val("state") || "offline";
    // Off: the power switch decides, as the operation state can still read "Ready"
    // while the dishwasher is off; a running program always wins.
    const off = !offline && !RUNNING.includes(state) && (state === "Inactive" || this._val("power") === "off");
    if (off) state = "Inactive";
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
    } else if (state === "Ready" && remaining) {
      // when ready, the dishwasher already reports how long the preselected program takes
      detail = [program, this._t("takes", { time: this._dur(remaining) })];
    } else if (!offline) {
      detail = [program];
    }
    // during a program the chosen options are just part of the description
    if (RUNNING.includes(state) || state === "Finished") {
      const at = program ? detail.indexOf(program) + 1 : detail.length;
      detail.splice(at, 0, ...this._activeOptions());
    }
    // the door only matters while the dishwasher is on
    const doorOpen = !offline && !off && this._shows("door") && this._val("door") === "Open";
    if (doorOpen) detail.unshift(this._t("door_open"));
    const progress = state === "Run" || state === "Pause" ? this._num("progress") : null;
    // Starting needs a closed door and the remote start allowed; otherwise the card says what is missing.
    let startHint = "";
    if (state === "Ready") {
      if (this._val("door") === "Open") startHint = "close_door";
      else if (this._dev.e.remote_start && this._val("remote_start") !== "on") startHint = "allow_remote";
    }
    const canStart = state === "Ready" && !startHint && !!this._dev.e.active && !!this._val("selected");
    const phaseRaw = state === "Run" || state === "Pause" ? this._val("phase") : null;
    return { state, offline, off, status, detail: detail.filter(Boolean), when, phase, phaseRaw, progress, doorOpen, canStart, startHint };
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
  // changes, the call fails, or the wait runs out. With `ignored` set, running
  // out means the machine silently refused it and that message is shown.
  async _press(key, watch, domain, service, data, { wait = WAIT_MS, ignored = "" } = {}) {
    if (this._busy[key]) return;
    const timer = setTimeout(() => {
      if (ignored) this._error = this._t(ignored);
      this._release(key);
    }, wait);
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

  // Waits until `test()` holds or `ms` have passed; true when it held.
  _waitFor(test, ms) {
    return new Promise((resolve) => {
      const end = Date.now() + ms;
      const tick = () => (test() ? resolve(true) : Date.now() > end ? resolve(false) : setTimeout(tick, 250));
      tick();
    });
  }

  // Switches on the options wanted before every start (start_options). Options the
  // program does not allow are ignored by the dishwasher; that is fine here.
  async _applyStartOptions() {
    for (const o of [].concat(this._config.start_options || [])) {
      const id = this._dev?.e[`opt_${o}`];
      if (!id || this._hass.states[id]?.state === "on") continue;
      await this._hass.callService("switch", "turn_on", { entity_id: id });
      await this._waitFor(() => this._hass.states[id]?.state === "on", 5000);
    }
  }

  // A new program resets the options on the dishwasher, so the wanted ones are set again afterwards.
  async _chooseProgram(raw) {
    const e = this._dev?.e;
    if (!e?.selected || this._busy.program) return;
    this._busy.program = { watch: e.selected, from: this._hass.states[e.selected]?.state, timer: null };
    this._error = "";
    this._refresh();
    try {
      await this._hass.callService("select", "select_option", { entity_id: e.selected, option: raw });
      if (await this._waitFor(() => this._val("selected") === raw, 15000)) await this._applyStartOptions();
      else this._error = this._t("not_taken");
    } catch (err) {
      this._error = this._t("error", { msg: err?.message || err });
    }
    delete this._busy.program;
    this._refresh();
  }

  // The delayed start lives on the dishwasher (StartInRelative), so a start from an
  // automation or another device uses it too. Shown: the value just picked, else the machine's.
  _delayValue() {
    if (this._delayPending != null) return this._delayPending;
    return Math.round((this._num("delay_set") ?? 0) / 60);
  }

  _stepDelay(dir) {
    this._setDelay(Math.min(DELAY_MAX_MIN, Math.max(0, this._delayValue() + dir * DELAY_STEP_MIN)));
  }

  // Several quick taps become one write; a value the dishwasher does not take is reported.
  _setDelay(min) {
    const id = this._dev?.e.delay_set;
    if (!id) return;
    this._delayPending = min;
    this._refresh();
    clearTimeout(this._delayTimer);
    this._delayTimer = setTimeout(() => this._writeDelay(), 800);
  }

  async _writeDelay() {
    const id = this._dev?.e.delay_set;
    const min = this._delayPending;
    if (!id || min == null) return;
    try {
      await this._hass.callService("number", "set_value", { entity_id: id, value: min * 60 });
      if (!(await this._waitFor(() => this._num("delay_set") === min * 60, 5000))) this._error = this._t("not_taken");
    } catch (err) {
      this._error = this._t("error", { msg: err?.message || err });
    }
    if (this._delayPending === min) this._delayPending = null;
    this._refresh();
  }

  // Start in the order the dishwasher needs: program (already chosen) → options →
  // delayed start → ActiveProgram, which starts it (SelectedProgram only preselects).
  async _start() {
    const e = this._dev?.e;
    const program = this._val("selected");
    if (!e?.active || !program || this._busy.start) return;
    const timer = setTimeout(() => {
      this._error = this._t("not_started");
      this._release("start");
    }, WAIT_MS);
    this._busy.start = { watch: e.state, from: this._hass.states[e.state]?.state, timer };
    this._error = "";
    this._refresh();
    try {
      await this._applyStartOptions();
      // a delayed start picked a moment ago may still be on its way
      if (this._delayPending != null) {
        clearTimeout(this._delayTimer);
        await this._writeDelay();
      }
      await this._hass.callService("select", "select_option", { entity_id: e.active, option: program });
    } catch (err) {
      this._release("start");
      this._error = this._t("error", { msg: err?.message || err });
      this._refresh();
    }
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
    if (!this._config || this._hold) return;
    const hass = this._hass;
    const dev = this._discover();
    this._dev = dev;
    for (const [key, b] of Object.entries(this._busy)) {
      if (hass.states[b.watch]?.state !== b.from) {
        clearTimeout(b.timer);
        delete this._busy[key];
      }
    }
    const ids = dev ? [...Object.values(dev.e), this._config.starter_entity, this._config.preselect_entity].filter(Boolean) : [];
    const sig = JSON.stringify([
      ids.map((id) => [hass.states[id]?.state, hass.states[id]?.attributes?.options]),
      Object.keys(this._busy),
      this._confirm,
      this._delayPending,
      this._open,
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

  // The one main button that fits now: switch on when off, start when ready,
  // cancel while a program runs or waits to start.
  // hide: controls → a display only: no buttons, drop-downs or chips; the states stay.
  get _controls() {
    return this._shows("controls");
  }

  _mainBtn(view) {
    const e = this._dev.e;
    if (!this._controls) return "";
    if (view.off && e.power) return this._btn("power", "mdi:power", "power_on", "", e.power);
    if (view.canStart) return this._btn("start", "mdi:play", "start", "go");
    if (!e.abort || !ABORTABLE.includes(view.state)) return "";
    const busy = !!this._busy.abort;
    const ask = this._confirm;
    const label = this._t(ask ? "abort_confirm" : "abort");
    return `<button class="main ${ask ? "ask" : ""}" data-act="abort" ${busy ? "disabled" : ""} title="${label}" aria-label="${label}">
      ${busy ? this._spinner() : `<ha-icon icon="mdi:${ask ? "help" : "stop"}"></ha-icon>`}</button>`;
  }

  // Full card only (the row keeps one button): switch off while on and no program runs.
  _powerOffBtn(view) {
    const e = this._dev.e;
    if (!this._controls || !e.power || view.offline || view.off || RUNNING.includes(view.state)) return "";
    return this._btn("power-off", "mdi:power", "power_off", "quiet", e.power);
  }

  _btn(act, icon, label, cls, entity = "") {
    const busy = !!this._busy[act];
    const text = this._t(label);
    return `<button class="main ${cls}" data-act="${act}" ${entity ? `data-entity="${entity}"` : ""} ${busy ? "disabled" : ""}
      title="${text}" aria-label="${text}">${busy ? this._spinner() : `<ha-icon icon="${icon}"></ha-icon>`}</button>`;
  }

  _bar(progress, label) {
    if (progress == null) return "";
    const v = Math.max(0, Math.min(100, progress));
    return `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${Math.round(v)}" aria-valuemin="0"
      aria-valuemax="100"><div style="width:${v}%"></div></div>`;
  }

  // The theme's error color when the dishwasher needs someone; same in the full card and the row.
  _statusColor(view) {
    return view.state === "Error" || view.state === "ActionRequired" ? "var(--error-color)" : "";
  }

  _icon(view) {
    const icon = view.offline
      ? "mdi:dishwasher-off"
      : PHASE_ICON[view.phaseRaw] || (view.state === "Finished" ? "mdi:dishwasher-alert" : "mdi:dishwasher");
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
    const color = this._statusColor(view);
    const head = `
      <div class="head">
        ${this._icon(view)}
        <div class="text">
          <div class="name">${esc(dev.name)}</div>
          <div class="status" ${color ? `style="color:${color}"` : ""}>${esc(view.status)}</div>
          ${view.detail.length ? `<div class="sub">${view.detail.map(esc).join(" · ")}</div>` : ""}
        </div>
        <div class="btns">${this._powerOffBtn(view)}${this._mainBtn(view)}</div>
        ${this._bar(view.progress, view.status)}
      </div>`;

    // ready: what to start and when, or what is missing to start it
    // program and delayed start can be chosen while ready and while off (the start then switches it on)
    const setup = this._controls && this._shows("program") && (view.state === "Ready" || view.off) ? this._setupRow(dev) : "";
    const startHint = view.startHint && this._controls ? `<div class="start-hint"><ha-icon icon="mdi:information-outline"></ha-icon>${this._t(view.startHint)}</div>` : "";

    // chips only where something can be set: the options before a start (while
    // running they are part of the description line), on-demand while it runs
    const chips = [];
    if (this._shows("options") && (view.state === "Ready" || view.off)) {
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
      // a switch of the user's own (e.g. an automation that starts the dishwasher): its own name and icon
      const name = this._config.starter_name || starter.attributes?.friendly_name || starter.entity_id;
      const icon = this._config.starter_icon || starter.attributes?.icon || "mdi:play-circle-outline";
      chips.push(this._toggleChip(starter.entity_id, name, icon));
    }
    // display only: just the notes ("Sped up"), no switches
    const shown = this._controls ? chips : chips.filter((c) => c.startsWith('<span class="tag"'));
    const chipRow = shown.some(Boolean) ? `<div class="chips">${shown.join("")}</div>` : "";

    const hints = this._hints()
      .map((h) => {
        const busy = !!this._busy[`ack:${h.name}`];
        const text = this._t(`h_${h.name}`);
        const ack = this._controls && this._canAck(h.name)
          ? `<button class="ack" data-act="ack" data-hint="${h.name}" ${busy ? "disabled" : ""} aria-label="${esc(this._t("ack_label", { hint: text }))}">
              ${busy ? this._spinner() : this._t("ack")}</button>`
          : "";
        // errors and warnings stand out; reminders are quiet rows
        return `<div class="hint ${h.level === "info" ? "quiet" : ""}" style="--hint:${HINT_COLOR[h.level]}"><ha-icon icon="${h.icon}"></ha-icon><span>${esc(text)}</span>${ack}</div>`;
      })
      .join("");
    const hintBox = hints ? `<div class="hints">${hints}</div>` : "";
    const err = this._error ? `<div class="msg" role="alert">${esc(this._error)}</div>` : "";
    const folds = view.offline ? "" : this._careFold(view) + this._settingsFold(view);
    return `<ha-card><div class="dev">${head}${startHint}${setup}${chipRow}${hintBox}${folds}</div>${err}</ha-card>`;
  }

  // A fold: closed by default, a clickable title row.
  _fold(key, title, inner) {
    if (!inner) return "";
    const open = !!this._open[key];
    return `<div class="fold">
      <button class="fold-toggle" data-act="fold" data-fold="${key}" aria-expanded="${open}">
        <span>${title}</span><ha-icon icon="mdi:chevron-${open ? "up" : "down"}"></ha-icon></button>
      ${open ? `<div class="fold-body">${inner}</div>` : ""}</div>`;
  }

  // Care: salt, rinse aid, machine care and filter from the dishwasher's own events, plus a counter.
  _careFold(view) {
    if (!this._shows("care")) return "";
    const rows = [];
    for (const [key, empty, low] of CARE) {
      if (!this._dev.e[`h_${empty}`] && !this._dev.e[`h_${low}`]) continue;
      const due = key === "machine_care" || key === "filter";
      let state = "cs_ok";
      let color = "var(--success-color)";
      if (this._hintState(empty) === "Present") {
        state = due ? "cs_due" : "cs_empty";
        color = "var(--error-color)";
      } else if (this._hintState(low) === "Present") {
        state = due ? "cs_soon" : "cs_low";
        color = "var(--warning-color)";
      }
      rows.push(`<div class="kv"><span>${this._t(`c_${key}`)}</span><span class="cs" style="--cs:${color}">${this._t(state)}</span></div>`);
    }
    const count = this._num("started_count");
    if (count != null) {
      rows.push(`<div class="kv"><span>${this._t("started_count")}</span><span>${new Intl.NumberFormat(this._hass.language).format(count)}</span></div>`);
    }
    const careDue = ["MachineCareReminder", "MachineCareAndFilterCleaningReminder"].some((h) => this._hintState(h) === "Present");
    const program = this._st("selected")?.attributes?.options || [];
    const action =
      this._controls && careDue && program.includes("MachineCare") && (view.state === "Ready" || view.off) && this._val("selected") !== "MachineCare"
        ? `<button class="chip" data-act="care-program"><ha-icon icon="mdi:spray-bottle"></ha-icon>${this._t("care_program")}</button>`
        : "";
    return this._fold("care", this._t("care"), rows.length || action ? `<div class="kvs">${rows.join("")}</div>${action}` : "");
  }

  // "R03" → "Level 3", "H04" → "Level 4"; known words from the table; others made readable.
  _settingLabel(raw) {
    const level = /^[RH]0*(\d+)$/.exec(raw);
    if (level) return this._t("v_level", { n: level[1] });
    return this._known("v_", raw);
  }

  // Settings of the dishwasher as drop-downs, and the preselection when switched on.
  _settingsFold(view) {
    // everything in it is a control
    if (!this._shows("settings") || !this._controls) return "";
    const busy = RUNNING.includes(view.state);
    const rows = SETTINGS.map((role) => {
      const st = this._st(role);
      const options = st?.attributes?.options;
      if (!st || OFF.includes(st.state) || !options?.length) return "";
      const id = st.entity_id;
      const wait = !!this._busy[id];
      return `<label class="setting"><span>${this._t(role)}</span>
        <select data-act="setting" data-entity="${id}" ${busy || wait ? "disabled" : ""} aria-label="${this._t(role)}">
          ${options.map((o) => `<option value="${esc(o)}" ${st.state === o ? "selected" : ""}>${esc(this._settingLabel(o))}</option>`).join("")}
        </select></label>`;
    }).join("");
    return this._fold("settings", this._t("settings"), rows + this._preselectBlock());
  }

  // ---- preselection when switched on --------------------------------------
  // Stored as a short JSON text in a text helper (preselect_entity), so the
  // "preselect when switched on" blueprint can use it while no card is open:
  // {"program":"Auto2","on":["extradry"],"off":["halfload","variospeedplus"]}

  _preselect() {
    const st = this._config.preselect_entity && this._hass.states[this._config.preselect_entity];
    if (!st) return null;
    let cfg = {};
    try {
      cfg = JSON.parse(st.state) || {};
    } catch (_) {
      /* empty or not ours yet: start from nothing */
    }
    return { program: cfg.program || "", on: [].concat(cfg.on || []), off: [].concat(cfg.off || []) };
  }

  async _writePreselect(change) {
    const id = this._config.preselect_entity;
    const cur = this._preselect();
    if (!id || !cur) return;
    const next = { ...cur, ...change };
    // every option is either switched on or off, so the automation sets all of them
    next.off = OPTIONS.filter((o) => !next.on.includes(o));
    try {
      await this._hass.callService("input_text", "set_value", { entity_id: id, value: JSON.stringify(next) });
    } catch (err) {
      this._error = this._t("error", { msg: err?.message || err });
      this._refresh();
    }
  }

  _togglePreselectOption(o) {
    const cur = this._preselect();
    if (!cur) return;
    const on = cur.on.includes(o) ? cur.on.filter((x) => x !== o) : [...cur.on, o];
    this._writePreselect({ on });
  }

  _preselectBlock() {
    const cfg = this._preselect();
    if (!cfg) return "";
    const options = this._st("selected")?.attributes?.options || [];
    const program = `<select data-act="pre-program" aria-label="${this._t("program")}">
        ${cfg.program ? "" : `<option value="" selected>–</option>`}
        ${options.map((o) => `<option value="${esc(o)}" ${cfg.program === o ? "selected" : ""}>${esc(this._programName(o))}</option>`).join("")}
      </select>`;
    const chips = OPTIONS.filter((o) => this._dev.e[`opt_${o}`])
      .map((o) => {
        const on = cfg.on.includes(o);
        return `<button class="chip toggle ${on ? "on" : ""}" data-act="pre-opt" data-opt="${o}" role="switch" aria-checked="${on}">
          <ha-icon icon="mdi:${on ? "check" : "plus"}"></ha-icon>${this._t(`o_${o}`)}</button>`;
      })
      .join("");
    return `<div class="pre"><div class="pre-title">${this._t("preselect")}</div>
      <div class="pre-hint">${this._t("preselect_hint")}</div>${program}<div class="chips">${chips}</div></div>`;
  }

  // Middle of the delayed-start stepper: a native picker (a wheel on iOS) in DELAY_STEP_MIN steps.
  _delayPick(d) {
    const label = (m) => (m ? this._t("delay_in", { time: this._dur(m * 60), clock: this._clock(m * 60) }) : this._t("delay_now"));
    const options = [];
    for (let m = 0; m <= DELAY_MAX_MIN; m += DELAY_STEP_MIN) options.push(`<option value="${m}" ${m === d ? "selected" : ""}>${esc(label(m))}</option>`);
    return `<select class="pick" data-act="delay-pick" aria-label="${this._t("delay_label")}">${options.join("")}</select>`;
  }

  // Program drop-down and delayed start, shown while the dishwasher is ready.
  _setupRow(dev) {
    const sel = this._st("selected");
    const options = sel?.attributes?.options || [];
    const busy = !!this._busy.program;
    const program = options.length
      ? `<label class="field"><span class="field-label">${this._t("program")}</span>
          <select data-act="program" ${busy ? "disabled" : ""} aria-label="${this._t("program")}">
            ${options.map((o) => `<option value="${esc(o)}" ${sel.state === o ? "selected" : ""}>${esc(this._programName(o))}</option>`).join("")}
          </select></label>`
      : "";
    const d = this._delayValue();
    const delay = dev.e.delay_set
      ? `<div class="field"><span class="field-label">${this._t("delay_label")}</span><div class="stepper" role="group" aria-label="${this._t("delay_label")}">
          <button data-act="delay" data-dir="-1" ${d <= 0 ? "disabled" : ""} aria-label="${this._t("delay_less")}"><ha-icon icon="mdi:minus"></ha-icon></button>
          ${this._delayPick(d)}
          <button data-act="delay" data-dir="1" ${d >= DELAY_MAX_MIN ? "disabled" : ""} aria-label="${this._t("delay_more")}"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div></div>`
      : "";
    return program || delay ? `<div class="setup">${program}${delay}</div>` : "";
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
      const color = this._statusColor(view);
      line = color ? `<span style="color:${color}">${esc(view.status)}</span>` : esc(view.status);
    }
    if (view.startHint) line += ` · ${esc(this._t(view.startHint))}`;
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
        ${this._mainBtn(view)}
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
      .btns { display: flex; align-items: center; gap: 8px; }
      /* secondary next to the main button: switch off */
      .main.quiet { width: 36px; height: 36px; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
        color: var(--primary-text-color); }
      .main.quiet ha-icon { --mdc-icon-size: 20px; }

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

      .start-hint { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 13px; color: var(--secondary-text-color); }
      .start-hint ha-icon { --mdc-icon-size: 18px; }
      .setup { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-top: 10px; }
      .field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .field-label { font-size: 12px; color: var(--secondary-text-color); padding-left: 2px; }
      select, .stepper { box-sizing: border-box; min-height: 38px; border-radius: var(--ha-card-border-radius, 12px);
        border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
      select { width: 100%; padding: 0 8px; cursor: pointer; text-overflow: ellipsis; }
      .stepper { display: flex; align-items: center; justify-content: space-between; overflow: hidden; }
      .stepper button { all: unset; box-sizing: border-box; width: 36px; align-self: stretch; display: flex; align-items: center;
        justify-content: center; cursor: pointer; color: var(--primary-color); }
      .stepper button:hover { background: var(--secondary-background-color); }
      .stepper button[disabled] { opacity: .35; }
      .stepper ha-icon { --mdc-icon-size: 18px; }
      .stepper select.pick { appearance: none; -webkit-appearance: none; border: 0; background: transparent; min-height: 0;
        padding: 0 2px; width: auto; flex: 1; min-width: 0; text-align: center; text-align-last: center; font-size: 13px;
        color: var(--primary-text-color); font-variant-numeric: tabular-nums; cursor: pointer; }
      .hints { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
      /* folds: care and settings */
      .fold { margin-top: 12px; padding: 0 12px; border-radius: var(--ha-card-border-radius, 12px); background: var(--secondary-background-color); }
      .fold-toggle { all: unset; box-sizing: border-box; width: 100%; min-height: 40px; display: flex; align-items: center;
        justify-content: space-between; cursor: pointer; font-size: 14px; font-weight: 500; }
      .fold-toggle:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      .fold-toggle ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
      .fold-body { padding: 0 0 12px; display: flex; flex-direction: column; gap: 8px; }
      .fold-body .chip { align-self: flex-start; }
      .kvs { display: flex; flex-direction: column; }
      .kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 3px 0; }
      .kv span:first-child { color: var(--secondary-text-color); }
      .cs { display: inline-flex; align-items: center; gap: 6px; }
      .cs::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--cs); }
      .setting { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: center; font-size: 13px; }
      .setting span { color: var(--secondary-text-color); }
      .setting select { min-height: 34px; }
      .pre { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--divider-color); }
      .pre-title { font-size: 14px; font-weight: 500; }
      .pre-hint { font-size: 12px; color: var(--secondary-text-color); }
      .pre .chips { margin-top: 0; }
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
      /* like the tiles around it: the icon stands free (accent only while a program runs, grey at rest
         like a tile that is off), the button is a rounded square */
      .t-in .dicon { width: 40px; height: 40px; --mdc-icon-size: 24px; background: none;
        color: var(--state-inactive-color, var(--secondary-text-color)); }
      .t-in .dicon.on { color: var(--accent-color, var(--primary-color)); background: none; }
      .t-in .dicon.off { opacity: .5; }
      .r-name { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tile .r-name { line-height: 20px; }
      .t-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 16px; }
      .tile .bar { margin-top: 4px; height: 3px; border-radius: 2px; }
      .tile .main { width: 48px; height: 36px; border-radius: 12px; color: var(--primary-text-color);
        background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
      .tile .main.go { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
      .tile .main.ask { color: var(--error-color); background: color-mix(in srgb, var(--error-color) 20%, transparent); }
      .tile .main:focus-visible { outline-offset: 2px; }
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
