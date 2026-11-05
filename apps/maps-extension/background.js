importScripts("core.js");
const { isMapsUrl, workspaceOrigin, placeKey, record } = globalThis.QubloxExtension;
let writes = Promise.resolve();
function serialized(task) {
  const result = writes.then(task);
  writes = result.catch(() => {});
  return result;
}
async function getPlaces() {
  return (await chrome.storage.local.get("places")).places || [];
}

// Injected only into the exact workspace origin the user granted access to.
function bridge(records, nonce, expiresAt, expectedOrigin) {
  // Check again inside the executing document: navigation may race injection.
  if (location.origin !== expectedOrigin) return;
  if (globalThis.__qubloxImportNonce === nonce) return;
  globalThis.__qubloxImportNonce = nonce;
  const origin = expectedOrigin;
  const offer = () => {
    if (Date.now() >= expiresAt) {
      cleanup();
      return;
    }
    window.postMessage(
      { source: "qublox-maps", kind: "available", nonce, count: records.length },
      origin,
    );
  };
  const receive = (event) => {
    if (
      event.source !== window ||
      event.origin !== origin ||
      event.data?.source !== "qublox-sales" ||
      event.data.nonce !== nonce
    )
      return;
    if (event.data.kind === "request")
      window.postMessage({ source: "qublox-maps", kind: "records", nonce, records }, origin);
    if (event.data.kind === "received") {
      cleanup();
      void chrome.runtime.sendMessage({ action: "finishTransfer", nonce }).catch(() => {});
    }
  };
  function cleanup() {
    clearInterval(timer);
    window.removeEventListener("message", receive);
  }
  const timer = setInterval(offer, 1000);
  window.addEventListener("message", receive);
  offer();
}
async function inject(tabId) {
  const key = `transfer:${tabId}`;
  const transfer = (await chrome.storage.session.get(key))[key];
  if (!transfer) return;
  if (Date.now() >= transfer.expiresAt) {
    await chrome.storage.session.remove(key);
    return;
  }
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).origin !== transfer.origin) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: bridge,
    args: [transfer.records, transfer.nonce, transfer.expiresAt, transfer.origin],
  });
}
async function handle(request, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error("Unknown extension sender.");
  const popup = sender.url === chrome.runtime.getURL("popup.html");
  const maps = sender.tab && isMapsUrl(sender.tab.url);
  if (request.action === "finishTransfer") {
    if (!sender.tab) throw new Error("No destination tab.");
    const key = `transfer:${sender.tab.id}`;
    const item = (await chrome.storage.session.get(key))[key];
    if (item && item.nonce === request.nonce && new URL(sender.tab.url).origin === item.origin)
      await chrome.storage.session.remove(key);
    return { ok: true };
  }
  if (!popup && !maps) throw new Error("Open the collector on Google Maps.");
  if (request.action === "getPlaces") return { records: await getPlaces() };
  if (request.action === "savePlace" && maps)
    return serialized(async () => {
      const item = record(request.record);
      const records = await getPlaces();
      const index = records.findIndex((r) => placeKey(r.url) === placeKey(item.url));
      if (index >= 0) records[index] = item;
      else {
        if (records.length >= 100)
          throw new Error(
            "The collection holds 100 places. Import or export it before clearing it.",
          );
        records.push(item);
      }
      await chrome.storage.local.set({ places: records });
      return { records };
    });
  if (request.action === "claimCollection" && maps)
    return serialized(async () => {
      const previous = (await chrome.storage.session.get("activeTab")).activeTab;
      if (previous && previous !== sender.tab.id) {
        const running = await chrome.tabs
          .sendMessage(previous, { action: "getStatus" })
          .catch(() => null);
        if (running?.isRunning)
          throw new Error("Collection is already running in another Maps tab. Stop it first.");
      }
      await chrome.storage.session.set({ activeTab: sender.tab.id });
      return { ok: true };
    });
  if (request.action === "releaseCollection" && maps)
    return serialized(async () => {
      if ((await chrome.storage.session.get("activeTab")).activeTab === sender.tab.id)
        await chrome.storage.session.remove("activeTab");
      return { ok: true };
    });
  if (request.action === "resetPlaces" && (popup || maps))
    return serialized(async () => {
      const active = (await chrome.storage.session.get("activeTab")).activeTab;
      if (active) {
        const state = await chrome.tabs
          .sendMessage(active, { action: "getStatus" })
          .catch(() => null);
        if (state?.isRunning) throw new Error("Stop the active collection first.");
      }
      await chrome.storage.local.set({ places: [] });
      return { ok: true };
    });
  if (request.action === "transfer" && popup) {
    const origin = workspaceOrigin(request.origin);
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] })))
      throw new Error("Grant access to your workspace before transferring.");
    const records = (await getPlaces()).map(record);
    if (!records.length) throw new Error("Collect at least one place first.");
    const tab = await chrome.tabs.create({ url: `${origin}/?mapsImport=1`, active: true });
    await chrome.storage.session.set({
      [`transfer:${tab.id}`]: {
        origin,
        records,
        nonce: crypto.randomUUID(),
        expiresAt: Date.now() + 15 * 60 * 1000,
      },
    });
    if ((await chrome.tabs.get(tab.id)).status === "complete") await inject(tab.id);
    return { ok: true };
  }
  throw new Error("Unknown collector command.");
}
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  handle(request, sender).then(respond, (error) => respond({ error: error.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "complete") void inject(tabId).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`transfer:${tabId}`);
});
