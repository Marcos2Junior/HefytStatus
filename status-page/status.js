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
      options.onPending(true);
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
        options.onPending(false);
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
    const lastCheck = document.querySelector("[data-last-check]");
    const nextCheck = document.querySelector("[data-next-check]");
    const checkAgain = document.querySelector("[data-check-again]");
    let locale = "pt-BR";
    let currentState = "checking";
    let checkedAt = null;
    let monitor;

    function template(name, value) { return root.dataset[`${name}${suffixForLocale(locale)}`].replace("{value}", value); }
    function relativePast(date) {
      if (!date) return "-";
      const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
      if (seconds < 2) return template("relativeNow", "");
      if (seconds < 60) return template("relativeSeconds", seconds);
      const minutes = Math.floor(seconds / 60);
      return minutes === 1 ? template("relativeMinute", 1) : template("relativeMinutes", minutes);
    }
    function relativeFuture(date) {
      if (!date) return "-";
      const seconds = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
      return seconds > 59 ? template("nextMinute", 1) : template("nextSeconds", seconds);
    }
    function translatedStatus() { return root.dataset[`status${currentState[0].toUpperCase()}${currentState.slice(1)}${suffixForLocale(locale)}`]; }
    function render() {
      document.documentElement.lang = locale;
      document.querySelectorAll("[data-i18n]").forEach(element => { element.textContent = element.dataset[keyForLocale(locale)]; });
      document.querySelectorAll("[data-i18n-aria-label]").forEach(element => { element.setAttribute("aria-label", element.dataset[keyForLocale(locale)]); });
      document.querySelectorAll("[data-language]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.language === locale)); });
      statusHeading.textContent = translatedStatus();
      componentStatus.textContent = translatedStatus();
      statusMessage.textContent = statusMessage.dataset[`${currentState}${suffixForLocale(locale)}`];
      banner.dataset.state = currentState;
      lastCheck.textContent = relativePast(checkedAt);
      nextCheck.textContent = relativeFuture(monitor && monitor.getNextCheckAt());
    }

    document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => { locale = button.dataset.language; render(); }));
    monitor = createMonitor({
      url: root.dataset.statusUrl,
      timeoutMs: 8000,
      intervalMs: 60000,
      minimumRetryMs: 5000,
      fetch: global.fetch.bind(global),
      AbortController: global.AbortController,
      setTimeout: global.setTimeout.bind(global),
      clearTimeout: global.clearTimeout.bind(global),
      now: Date.now,
      onPending(isPending) { checkAgain.disabled = isPending; },
      onSchedule() { render(); },
      onResult(state, date) { currentState = state; checkedAt = date; render(); }
    });
    checkAgain.addEventListener("click", async () => {
      checkAgain.disabled = true;
      await monitor.check();
      global.setTimeout(() => { checkAgain.disabled = false; }, 5000);
    });
    document.querySelector("[data-year]").textContent = new Date().getFullYear();
    global.setInterval(render, 1000);
    render();
    monitor.start();
    return monitor;
  }

  const api = { createMonitor, initialize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global.document) initialize(global.document);
})(typeof window !== "undefined" ? window : globalThis);
