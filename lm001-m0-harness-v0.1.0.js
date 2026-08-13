(() => {
  "use strict";

  const BUILD = "m0-harness-v0.1.0";
  const ROOT_SELECTOR = "[data-lm001-m0-root]";
  const STORAGE_KEY = "lm001:m0:harness:v0.1.0";
  const CSS_SENTINEL = "lm001-m0-css-v0-1-0";
  const SCRIPT_URL = document.currentScript?.src || null;

  const state = window.__LM001_M0_HARNESS__ ||= {
    bootstrapCalls: 0,
    mounts: 0,
    listeners: 0,
    teardowns: 0,
    mountedRoots: new Set()
  };

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function setText(root, key, value) {
    const el = root.querySelector(`[data-m0="${key}"]`);
    if (el) el.textContent = String(value);
  }

  async function cssProbe(root) {
    for (let i = 0; i < 100; i++) {
      const value = getComputedStyle(root)
        .getPropertyValue("--lm001-m0-css-sentinel")
        .trim();

      if (value === CSS_SENTINEL) return true;
      await pause(50);
    }
    return false;
  }

  async function corsProbe() {
    if (!SCRIPT_URL) {
      return { ok: false, message: "Harness script URL unavailable" };
    }

    try {
      const response = await fetch(SCRIPT_URL, {
        cache: "no-store",
        mode: "cors"
      });

      return {
        ok: response.ok,
        message: `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  }

  function storageProbe() {
    try {
      const priorRaw = localStorage.getItem(STORAGE_KEY);
      const prior = priorRaw ? JSON.parse(priorRaw) : null;

      const current = {
        build: BUILD,
        loadCount: (prior?.loadCount || 0) + 1,
        timestamp: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

      return {
        writeRead: true,
        restored: Boolean(prior && prior.build === BUILD),
        loadCount: current.loadCount
      };
    } catch (error) {
      return {
        writeRead: false,
        restored: false,
        error: error.message
      };
    }
  }

  async function mathJaxProbe(node) {
    try {
      if (!window.MathJax) {
        throw new Error("MathJax not available");
      }

      if (window.MathJax.startup?.promise) {
        await window.MathJax.startup.promise;
      }

      if (typeof window.MathJax.typesetPromise !== "function") {
        throw new Error("typesetPromise unavailable");
      }

      node.textContent = "\\(3x + 2 \\le 14\\)";
      await window.MathJax.typesetPromise([node]);

      return Boolean(node.querySelector("mjx-container"));
    } catch (error) {
      console.error("[LM001 M0] MathJax probe failed:", error);
      return false;
    }
  }

  function renderPanel(root) {
    root.innerHTML = `
      <h2>LM001 M0 Platform Harness</h2>
      <p>Inert Squarespace deployment smoke test. This is not an LM001 learner activity.</p>

      <div class="lm001-m0-grid" role="status" aria-live="polite">
        <div class="lm001-m0-label">Harness build</div>
        <div data-m0="build">${BUILD}</div>

        <div class="lm001-m0-label">Shared JavaScript</div>
        <div data-m0="js">PASS — external harness executed</div>

        <div class="lm001-m0-label">Shared CSS</div>
        <div data-m0="css">CHECKING…</div>

        <div class="lm001-m0-label">External fetch / CORS</div>
        <div data-m0="cors">CHECKING…</div>

        <div class="lm001-m0-label">MathJax 4 / CommonHTML</div>
        <div data-m0="mathjax">CHECKING…</div>

        <div class="lm001-m0-label">localStorage write/read</div>
        <div data-m0="storage-write">CHECKING…</div>

        <div class="lm001-m0-label">localStorage reload restore</div>
        <div data-m0="storage-restore">CHECKING…</div>

        <div class="lm001-m0-label">Bootstrap idempotency</div>
        <div data-m0="idempotency">CHECKING…</div>

        <div class="lm001-m0-label">Active LM001 roots</div>
        <div data-m0="roots">CHECKING…</div>

        <div class="lm001-m0-label">Active harness listeners</div>
        <div data-m0="listeners">CHECKING…</div>
      </div>

      <div class="lm001-m0-math">
        <strong>Math test:</strong>
        <span data-m0="math">3x + 2 ≤ 14</span>
      </div>

      <div class="lm001-m0-actions">
        <button type="button" data-action="bootstrap">Re-run bootstrap</button>
        <button type="button" data-action="teardown">Teardown + remount</button>
      </div>

      <pre class="lm001-m0-log" data-m0="log"></pre>
    `;
  }

  function updateDiagnostics(root) {
    const rootCount = document.querySelectorAll(ROOT_SELECTOR).length;

    setText(root, "roots", rootCount);
    setText(root, "listeners", state.listeners);

    const pass =
      state.mountedRoots.size === 1 &&
      state.listeners === 2;

    setText(
      root,
      "idempotency",
      pass
        ? `PASS — ${state.bootstrapCalls} bootstrap call(s), 1 active mount`
        : `FAIL — ${state.mountedRoots.size} active mount(s)`
    );

    setText(
      root,
      "log",
      JSON.stringify(
        {
          build: BUILD,
          bootstrapCalls: state.bootstrapCalls,
          activeMounts: state.mountedRoots.size,
          activeListeners: state.listeners,
          teardowns: state.teardowns,
          rootCount
        },
        null,
        2
      )
    );
  }

  async function mount(root) {
    if (state.mountedRoots.has(root)) {
      updateDiagnostics(root);
      return;
    }

    renderPanel(root);

    state.mountedRoots.add(root);
    state.mounts++;

    const bootstrapButton =
      root.querySelector('[data-action="bootstrap"]');

    const teardownButton =
      root.querySelector('[data-action="teardown"]');

    bootstrapButton.addEventListener("click", bootstrap);

    teardownButton.addEventListener("click", async () => {
      teardown(root);
      await bootstrap();
    });

    state.listeners += 2;

    const cssOK = await cssProbe(root);
    setText(
      root,
      "css",
      cssOK
        ? "PASS — external stylesheet applied"
        : "FAIL — CSS sentinel not found"
    );

    const cors = await corsProbe();
    setText(
      root,
      "cors",
      cors.ok
        ? `PASS — ${cors.message}`
        : `FAIL — ${cors.message}`
    );

    const storage = storageProbe();

    setText(
      root,
      "storage-write",
      storage.writeRead
        ? "PASS"
        : `FAIL — ${storage.error}`
    );

    setText(
      root,
      "storage-restore",
      storage.restored
        ? `PASS — prior load restored (load ${storage.loadCount})`
        : "FIRST LOAD — reload this page once"
    );

    const mathOK = await mathJaxProbe(
      root.querySelector('[data-m0="math"]')
    );

    setText(
      root,
      "mathjax",
      mathOK
        ? "PASS — CommonHTML output detected"
        : "FAIL — MathJax output not detected"
    );

    updateDiagnostics(root);
  }

  function teardown(root) {
    if (!state.mountedRoots.has(root)) return;

    state.mountedRoots.delete(root);
    state.listeners = Math.max(0, state.listeners - 2);
    state.teardowns++;
  }

  async function bootstrap() {
    state.bootstrapCalls++;

    const roots =
      Array.from(document.querySelectorAll(ROOT_SELECTOR));

    if (!roots.length) {
      console.info(
        `[${BUILD}] No ${ROOT_SELECTOR} found; no-op.`
      );
      return;
    }

    for (const root of roots) {
      await mount(root);
    }
  }

  window.LM001M0Harness = {
    bootstrap,
    teardown,
    getDiagnostics() {
      return {
        build: BUILD,
        bootstrapCalls: state.bootstrapCalls,
        activeMounts: state.mountedRoots.size,
        activeListeners: state.listeners,
        teardowns: state.teardowns,
        rootCount:
          document.querySelectorAll(ROOT_SELECTOR).length
      };
    }
  };

  const start = async () => {
    await bootstrap();

    // Intentional second call:
    // proves bootstrap is idempotent.
    await bootstrap();
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }
})();
