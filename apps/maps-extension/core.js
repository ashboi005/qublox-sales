(function () {
  const mapsHosts = new Set(["www.google.com", "www.google.co.in", "maps.google.com"]);
  function isMapsUrl(value) {
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        mapsHosts.has(u.hostname) &&
        (u.pathname.startsWith("/maps") || u.hostname === "maps.google.com")
      );
    } catch {
      return false;
    }
  }
  function workspaceOrigin(value) {
    const u = new URL(value);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/" ||
      !(
        u.protocol === "https:" ||
        (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))
      )
    )
      throw new Error("Use your HTTPS workspace origin, or http://localhost:3001 for development.");
    return u.origin;
  }
  function placeKey(value) {
    const u = new URL(value);
    const id =
      u.searchParams.get("cid") ||
      u.searchParams.get("query_place_id") ||
      u.pathname.match(/!1s(0x[\da-f]+:0x[\da-f]+|ChI[\w-]+)/i)?.[1] ||
      u.pathname.match(/!16s([^!?#]+)/)?.[1];
    return id ? `place:${decodeURIComponent(id)}` : `${u.hostname}${u.pathname}`;
  }
  function record(value) {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      value.name.length > 160 ||
      !isMapsUrl(value.url) ||
      value.url.length > 2048 ||
      typeof value.scrapedAt !== "string" ||
      value.scrapedAt.length > 40 ||
      !Number.isFinite(Date.parse(value.scrapedAt))
    )
      throw new Error("The collected place is malformed.");
    const item = { name: value.name.trim(), url: value.url, scrapedAt: value.scrapedAt };
    for (const key of ["phone", "website", "address", "rating", "reviews", "captureStatus"])
      item[key] =
        typeof value[key] === "string" ? value[key].slice(0, key === "website" ? 2048 : 500) : "";
    if (item.website) {
      const u = new URL(item.website);
      if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
        throw new Error("Invalid business website.");
    }
    item.warnings = Array.isArray(value.warnings)
      ? value.warnings
          .filter((v) => typeof v === "string")
          .slice(0, 4)
          .map((v) => v.slice(0, 200))
      : [];
    return item;
  }
  function csv(records) {
    const fields = [
      "name",
      "phone",
      "website",
      "address",
      "rating",
      "reviews",
      "url",
      "scrapedAt",
      "captureStatus",
    ];
    const escape = (value) => {
      let s = String(value || "");
      if (/^\s*[=+@\-]|^[\t\r\n]/.test(s)) s = `'${s}`;
      return `"${s.replaceAll('"', '""')}"`;
    };
    return [fields, ...records.map((r) => fields.map((f) => r[f]))]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");
  }
  globalThis.QubloxExtension = { isMapsUrl, workspaceOrigin, placeKey, record, csv };
})();
