/**
 * sort-memory.js
 * Sortierpräferenz speichern (Settings: mdm_rememberSort, opt-in).
 *
 * Quelle: Original Solo Tool „Letzte Sortierung speichern"
 * (/tmp/opencode/mydealz-Manager/Solo Tools/) — portiert auf SettingsStore.
 *
 * Live verifiziert 2026-09-11 (mydealz.de):
 *   - Listings: <select name="time_frame"> mit popular/recent (JS-Navigation,
 *     kein GET-Redirect, kein Formular) → Auswahl wird pro Pfad gespeichert und
 *     beim nächsten Besuch wieder angewendet (change-Event dispatchen).
 *   - Suche: form[action*="/search"] existiert; beim Submit wird ein hidden
 *     input[name="sortBy"] mit dem gespeicherten Wert injiziert
 *     (identisch zum Original-Tool).
 *
 * Depends on: SettingsStore
 * Exports:    SortMemory
 */

const SortMemory = (() => {

  let _enabled = false;

  function _stateKey(selectName) {
    return location.pathname + '|' + selectName;
  }

  function init() {
    // Nix Async — Settings kommen via update() aus content.js nach SettingsStore.init()
  }

  /** Vom App-Lifecycle aufgerufen (nach SettingsStore.init() und reprocess()). */
  function update(settings) {
    _enabled = !!settings.mdm_rememberSort;
    if (!_enabled) return;
    _applySaved(settings);
    _hook(settings);
  }

  /** Gespeicherte Sortierung anwenden (Listing-Selects). */
  function _applySaved(settings) {
    document.querySelectorAll('select[name="time_frame"], select[name="sortBy"]').forEach(function(sel) {
      if (sel.dataset.mdmSortApplied === '1') return;
      sel.dataset.mdmSortApplied = '1';

      const saved = settings.mdm_lastSortState?.[_stateKey(sel.name)];
      if (!saved) return;
      const current = sel.options[sel.selectedIndex]?.value;
      if (current === saved) return;

      const opt = Array.from(sel.options).find(o => o.value === saved);
      if (!opt) return;
      opt.selected = true;
      // change dispatchen: der Pepper-Router reagiert auf change (JS-Navigation).
      // Falls die Plattform das Event ignoriert, bleibt die Auswahl sichtbar
      // gesetzt — kein Fehlerfall.
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /** Change-Events speichern + Suchformular-Submit verdrahten. */
  function _hook(settings) {
    document.querySelectorAll('select[name="time_frame"], select[name="sortBy"]').forEach(function(sel) {
      if (sel.dataset.mdmSortHooked === '1') return;
      sel.dataset.mdmSortHooked = '1';
      sel.addEventListener('change', function() {
        if (!_enabled) return;
        SettingsStore.setLastSort(_stateKey(sel.name), sel.value);
      });
    });

    // Suchformular: gespeicherte Sortierung beim Submit mitschicken
    // (Port des Original-Solo-Tools; Selektor live verifiziert)
    document.querySelectorAll('form[action*="/search"]').forEach(function(form) {
      if (form.dataset.mdmSortHooked === '1') return;
      form.dataset.mdmSortHooked = '1';
      form.addEventListener('submit', function() {
        if (!_enabled) return;
        const saved = settings.mdm_lastSortState?.[location.pathname + '|sortBy'];
        if (!saved) return;
        let input = form.querySelector('input[name="sortBy"]');
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'sortBy';
          form.appendChild(input);
        }
        input.value = saved;
      });
    });
  }

  return { init, update };

})();

if (typeof module !== 'undefined') module.exports = { SortMemory };
