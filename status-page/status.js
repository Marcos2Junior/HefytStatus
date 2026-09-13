(function (global) {
  "use strict";
  const keyForLocale = locale => ({ "pt-BR": "ptBr", "es-ES": "esEs", "en-US": "enUs" })[locale];
  const suffixForLocale = locale => ({ "pt-BR": "PtBr", "es-ES": "EsEs", "en-US": "EnUs" })[locale];

  function createMonitor(options) {
    let pending = false;
    let timer;
    let nextCheckAt = null;
    let lastAttemptAt = -Infinity;

    function schedule() {
      if (timer !== undefined) options.clearTimeout(timer);
      nextCheckAt = new Date(options.now() + options.intervalMs);
      options.onSchedule(nextCheckAt);
      timer = options.setTimeout(check, options.intervalMs);
    }

    async function check() {
      const now = options.now();
      if (pending || now - lastAttemptAt < options.minimumRetryMs) return false;
      pending = true;
      lastAttemptAt = now;
      if (options.onPending) options.onPending(true);
      const controller = new options.AbortController();
      const timeout = options.setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await options.fetch(options.url, { cache: "no-store", headers: { Accept: "text/plain" }, signal: controller.signal });
        options.onResult(response.status === 200 ? "operational" : "unavailable", new Date(options.now()));
      } catch {
        options.onResult("unknown", new Date(options.now()));
      } finally {
        options.clearTimeout(timeout);
        pending = false;
        if (options.onPending) options.onPending(false);
        schedule();
      }
      return true;
    }

    function start() { check(); }
    function stop() { if (timer !== undefined) options.clearTimeout(timer); }
    function getNextCheckAt() { return nextCheckAt; }
    return { check, start, stop, getNextCheckAt };
  }

  function initialize(document) {
    const root = document.querySelector(".page");
    const banner = document.querySelector(".status-banner");
    const statusHeading = document.querySelector("[data-status-heading]");
    const statusMessage = document.querySelector("[data-status-message]");
    const componentStatus = document.querySelector("[data-component-status]");
    const monitoringLabel = document.querySelector("[data-monitoring-label]");
    const monitoringDetail = document.querySelector("[data-monitoring-detail]");
    let locale = "pt-BR";
    let currentState = "checking";
    let checkedAt = null;
    let monitor;

    function translatedStatus() { return root.dataset[`status${currentState[0].toUpperCase()}${currentState.slice(1)}${suffixForLocale(locale)}`]; }
    function translatedComponentStatus() {
      return currentState === "unknown"
        ? root.dataset[`componentUnknown${suffixForLocale(locale)}`]
        : translatedStatus();
    }
    function render() {
      document.documentElement.lang = locale;
      document.querySelectorAll("[data-i18n]").forEach(element => { element.textContent = element.dataset[keyForLocale(locale)]; });
      document.querySelectorAll("[data-i18n-aria-label]").forEach(element => { element.setAttribute("aria-label", element.dataset[keyForLocale(locale)]); });
      document.querySelectorAll("[data-language]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.language === locale)); });
      statusHeading.textContent = translatedStatus();
      componentStatus.textContent = translatedComponentStatus();
      statusMessage.textContent = statusMessage.dataset[`${currentState}${suffixForLocale(locale)}`];
      monitoringLabel.textContent = root.dataset[`monitoring${suffixForLocale(locale)}`];
      monitoringDetail.textContent = root.dataset[`monitoringDetail${suffixForLocale(locale)}`];
      banner.dataset.state = currentState;
    }

    document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => { locale = button.dataset.language; render(); }));
    monitor = createMonitor({
      url: root.dataset.statusUrl,
      timeoutMs: 8000,
      intervalMs: 30000,
      minimumRetryMs: 5000,
      fetch: global.fetch.bind(global),
      AbortController: global.AbortController,
      setTimeout: global.setTimeout.bind(global),
      clearTimeout: global.clearTimeout.bind(global),
      now: Date.now,
      onSchedule() { render(); },
      onResult(state, date) { currentState = state; checkedAt = date; render(); }
    });
    document.querySelector("[data-year]").textContent = new Date().getFullYear();
    render();
    monitor.start();
    return monitor;
  }

  const api = { createMonitor, initialize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global.document) initialize(global.document);
})(typeof window !== "undefined" ? window : globalThis);
