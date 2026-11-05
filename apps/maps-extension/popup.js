/* global QubloxExtension, chrome */
const $ = (id) => document.getElementById(id);
let running = false;
function warn(error) {
  $("warning").textContent = error.message || String(error);
  $("warning").hidden = false;
}
async function background(action, extra = {}) {
  const result = await chrome.runtime.sendMessage({ action, ...extra });
  if (result?.error) throw new Error(result.error);
  return result;
}
async function content(action, extra = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!QubloxExtension.isMapsUrl(tab?.url))
    throw new Error("Open a Google Maps search or business profile first.");
  try {
    return await chrome.tabs.sendMessage(tab.id, { action, ...extra });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["core.js", "content.js"],
    });
    return chrome.tabs.sendMessage(tab.id, { action, ...extra });
  }
}
async function refresh() {
  const { records } = await background("getPlaces");
  let state;
  try {
    state = await content("getStatus");
  } catch {
    /* Export/transfer also work away from Maps. */
  }
  running = Boolean(state?.isRunning);
  $("count").textContent = `${records.length} ${records.length === 1 ? "place" : "places"} saved`;
  $("status").textContent =
    state?.message || "Saved collection is available. Open Maps to collect more.";
  if (state?.error) warn(state.error);
  $("start").disabled = running;
  $("stop").disabled = !running;
  $("limit").disabled = running;
  for (const name of ["json", "csv", "transfer", "reset"])
    $(name).disabled = running || !records.length;
}
function command(id, action, extra = () => ({})) {
  $(id).addEventListener("click", async () => {
    try {
      $("warning").hidden = true;
      const result = await content(action, extra());
      if (result?.error) throw new Error(result.error);
      await refresh();
    } catch (error) {
      warn(error);
    }
  });
}
command("start", "startScraping", () => ({ limit: Number($("limit").value) }));
command("stop", "stopScraping");
$("reset").addEventListener("click", async () => {
  if (
    !confirm(
      "Clear this saved collection? Imported prospects in Qublox will remain. Export a copy first if needed.",
    )
  )
    return;
  try {
    await background("resetPlaces");
    try {
      await content("resetData");
    } catch {}
    await refresh();
  } catch (error) {
    warn(error);
  }
});
for (const format of ["json", "csv"])
  $(format).addEventListener("click", async () => {
    try {
      const { records } = await background("getPlaces");
      const body =
        format === "json"
          ? JSON.stringify(records, null, 2)
          : "\uFEFF" + QubloxExtension.csv(records);
      const url = URL.createObjectURL(
        new Blob([body], {
          type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `qublox-maps.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      warn(error);
    }
  });
$("transfer").addEventListener("click", async () => {
  try {
    const origin = QubloxExtension.workspaceOrigin($("workspace").value);
    if (!(await chrome.permissions.request({ origins: [`${origin}/*`] })))
      throw new Error("Workspace permission was declined. JSON export is still available.");
    await chrome.storage.local.set({ workspace: origin });
    await background("transfer", { origin });
  } catch (error) {
    warn(error);
  }
});
void chrome.storage.local.get("workspace").then((value) => {
  if (value.workspace) $("workspace").value = value.workspace;
});
void refresh().catch(warn);
setInterval(() => {
  void refresh().catch(warn);
}, 1000);
