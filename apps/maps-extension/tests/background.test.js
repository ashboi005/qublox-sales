import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { unzipSync } from "fflate";
import { buildExtension, extensionFiles } from "../../../scripts/build-extension";

const core = readFileSync(new URL("../core.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../background.js", import.meta.url), "utf8");
function harness(local = {}, session = {}) {
  let listener;
  const sent = [];
  const events = new Set();
  let timer;
  const area = (data) => ({
    get: async (key) => ({ [key]: structuredClone(data[key]) }),
    set: async (value) => {
      Object.assign(data, structuredClone(value));
    },
    remove: async (key) => {
      delete data[key];
    },
  });
  const context = {
    URL,
    crypto,
    Date,
    structuredClone,
    importScripts() {},
    setInterval: (fn) => {
      timer = fn;
      return 1;
    },
    clearInterval: () => {
      timer = null;
    },
    location: { origin: "https://sales.example.com" },
    chrome: {
      runtime: {
        id: "test-extension",
        getURL: (path) => `chrome-extension://test-extension/${path}`,
        onMessage: {
          addListener: (fn) => {
            listener = fn;
          },
        },
        sendMessage: async (value) => {
          sent.push(value);
        },
      },
      storage: { local: area(local), session: area(session) },
      tabs: {
        onUpdated: { addListener() {} },
        onRemoved: { addListener() {} },
        get: async (id) => ({ id, url: "https://sales.example.com/", status: "complete" }),
        sendMessage: async () => ({ isRunning: false }),
        create: async () => ({ id: 42 }),
      },
      permissions: { contains: async () => true },
      scripting: {
        executeScript: async (options) => {
          sent.push(options);
        },
      },
    },
  };
  context.window = {
    postMessage: (value) => sent.push(value),
    addEventListener: (_, fn) => events.add(fn),
    removeEventListener: (_, fn) => events.delete(fn),
  };
  runInNewContext(core, context);
  runInNewContext(worker, context);
  const maps = {
    id: "test-extension",
    tab: { id: 1, url: "https://www.google.com/maps/search/hotels" },
  };
  const popup = { id: "test-extension", url: "chrome-extension://test-extension/popup.html" };
  return {
    context,
    local,
    session,
    sent,
    events,
    maps,
    popup,
    send: (message, sender = maps) => new Promise((resolve) => listener(message, sender, resolve)),
    tick: () => timer?.(),
  };
}
const place = (id) => ({
  name: `Hotel ${id}`,
  url: `https://www.google.com/maps?cid=${id}`,
  website: "",
  phone: "",
  scrapedAt: "2026-11-05T10:00:00.000Z",
});

test("concurrent saves persist, deduplicate, and survive a service-worker restart", async () => {
  const h = harness();
  await Promise.all([
    h.send({ action: "savePlace", record: place(1) }),
    h.send({ action: "savePlace", record: place(2) }),
  ]);
  expect(h.local.places).toHaveLength(2);
  await h.send({ action: "savePlace", record: { ...place(1), phone: "01234 567890" } });
  const resumed = harness(h.local);
  expect((await resumed.send({ action: "getPlaces" })).records).toHaveLength(2);
  expect(h.local.places[0].phone).toBe("01234 567890");
});
test("untrusted senders and malformed records cannot change the saved collection", async () => {
  const h = harness();
  expect(
    (await h.send({ action: "savePlace", record: place(1) }, { id: "other" })).error,
  ).toBeTruthy();
  expect(
    (
      await h.send({
        action: "savePlace",
        record: { ...place(1), url: "https://evil.example/maps" },
      })
    ).error,
  ).toBeTruthy();
  expect(h.local.places).toBeUndefined();
});
test("workspace destinations require HTTPS or explicit loopback HTTP", () => {
  const { workspaceOrigin, isMapsUrl, csv } = harness().context.QubloxExtension;
  for (const value of [
    "http://evil.example",
    "https://u:p@example.com",
    "https://example.com/path",
    "https://example.com/?x=1",
  ])
    expect(() => workspaceOrigin(value)).toThrow();
  expect(workspaceOrigin("http://localhost:3001")).toBe("http://localhost:3001");
  expect(isMapsUrl("https://www.google.com.evil.example/maps")).toBe(false);
  expect(csv([{ name: "=1+1", phone: "+919876543210" }])).toContain('"\'=1+1"');
});
test("the workspace bridge requires matching origin and nonce, then stops after acknowledgment", async () => {
  const h = harness();
  const nonce = crypto.randomUUID();
  h.context.bridge([place(1)], nonce, Date.now() + 10000, "https://sales.example.com");
  const dispatch = (data, origin = "https://sales.example.com") => {
    for (const receive of [...h.events]) receive({ source: h.context.window, origin, data });
  };
  expect(h.sent[0].kind).toBe("available");
  dispatch({ source: "qublox-sales", kind: "request", nonce }, "https://evil.example");
  dispatch({ source: "qublox-sales", kind: "request", nonce: "wrong" });
  expect(h.sent.filter((x) => x.kind === "records")).toHaveLength(0);
  dispatch({ source: "qublox-sales", kind: "request", nonce });
  expect(h.sent.filter((x) => x.kind === "records")).toHaveLength(1);
  dispatch({ source: "qublox-sales", kind: "received", nonce });
  expect(h.events.size).toBe(0);
});
test("transfer targets only the granted origin and keeps records out of URLs", async () => {
  const h = harness({ places: [place(1)] });
  expect(
    (await h.send({ action: "transfer", origin: "https://sales.example.com" }, h.popup)).ok,
  ).toBe(true);
  const injection = h.sent.find((x) => x.target);
  expect(injection.target.tabId).toBe(42);
  expect(injection.world).toBe("ISOLATED");
  expect(h.session["transfer:42"].records).toHaveLength(1);
});
test("packaged download contains only the extension runtime files", async () => {
  await buildExtension();
  const entries = Object.keys(
    unzipSync(
      new Uint8Array(
        await Bun.file(
          new URL("../../web/public/qublox-maps-extension.zip", import.meta.url),
        ).arrayBuffer(),
      ),
    ),
  );
  expect(entries.sort()).toEqual([...extensionFiles].sort());
  expect(entries.some((p) => /tests|\.env|node_modules/.test(p))).toBe(false);
});

test("a navigation between tab inspection and injection cannot disclose the batch elsewhere", () => {
  const h = harness();
  h.context.location.origin = "https://other-granted.example";
  h.context.bridge(
    [place(1)],
    crypto.randomUUID(),
    Date.now() + 10000,
    "https://sales.example.com",
  );
  expect(h.sent).toHaveLength(0);
  expect(h.events.size).toBe(0);
});
