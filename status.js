(function (global) {
  "use strict";

  const keyForLocale = locale => ({ "pt-BR": "ptBr", "es-ES": "esEs", "en-US": "enUs" })[locale];
  const suffixForLocale = locale => ({ "pt-BR": "PtBr", "es-ES": "EsEs", "en-US": "EnUs" })[locale];

  function createMonitor(options) {
    let pending = false;
    let timer;

    async function check() {
      if (pending) return false;
      pending = true;
      const controller = new options.AbortController();
      const timeout = options.setTimeout(() => controller.abort(), options.timeoutMs);

      try {
        const response = await options.fetch(options.url, {
          cache: "no-store",
          headers: { Accept: "text/plain" },
          signal: controller.signal
        });
        options.onResult(response.ok ? "operational" : "unavailable", new Date());
      } catch {
        options.onResult("unavailable", new Date());
      } finally {
        options.clearTimeout(timeout);
        pending = false;
      }
      return true;
    }

    function start() {
      check();
      timer = options.setInterval(check, options.intervalMs);
    }

    function stop() {
      if (timer !== undefined) options.clearInterval(timer);
    }

    return { check, start, stop };
  }

  function initialize(document) {
    const root = document.querySelector(".page");
    const card = document.querySelector(".status-card");
    const statusLabels = document.querySelectorAll("[data-status-label], [data-component-status]");
    const lastCheck = document.querySelector("[data-last-check]");
    let locale = "pt-BR";
    let currentState = "checking";
    let checkedAt = null;

    function translatedStatus() {
      return root.dataset[`status${currentState[0].toUpperCase()}${currentState.slice(1)}${suffixForLocale(locale)}`];
    }

    function render() {
      document.documentElement.lang = locale;
      document.querySelectorAll("[data-i18n]").forEach(element => {
        element.textContent = element.dataset[keyForLocale(locale)];
      });
      document.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
        element.setAttribute("aria-label", element.dataset[keyForLocale(locale)]);
      });
      document.querySelectorAll("[data-language]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.language === locale));
      });
      statusLabels.forEach(element => { element.textContent = translatedStatus(); });
      card.dataset.state = currentState;
      lastCheck.textContent = checkedAt
        ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(checkedAt)
        : "-";
    }

    document.querySelectorAll("[data-language]").forEach(button => {
      button.addEventListener("click", () => {
        locale = button.dataset.language;
        render();
      });
    });

    const monitor = createMonitor({
      url: root.dataset.statusUrl,
      timeoutMs: 8000,
      intervalMs: 60000,
      fetch: global.fetch.bind(global),
      AbortController: global.AbortController,
      setTimeout: global.setTimeout.bind(global),
      clearTimeout: global.clearTimeout.bind(global),
      setInterval: global.setInterval.bind(global),
      clearInterval: global.clearInterval.bind(global),
      onResult(state, date) {
        currentState = state;
        checkedAt = date;
        render();
      }
    });

    render();
    monitor.start();
    return monitor;
  }

  const api = { createMonitor, initialize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global.document) initialize(global.document);
})(typeof window !== "undefined" ? window : globalThis);
