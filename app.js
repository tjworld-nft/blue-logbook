const STORAGE_KEY = "blue-logbook-data-v1";

const state = {
  logs: [],
  filters: {
    query: "",
    area: ""
  },
  settings: {
    ownerName: "",
    bookName: "Blue Logbook"
  },
  draftPhotos: [],
  draftLocation: null,
  pickerMap: null,
  pickerMarker: null,
  overviewMap: null,
  overviewLayer: null
};

const fields = [
  "date",
  "diveNumber",
  "area",
  "site",
  "weather",
  "airTemp",
  "waterTemp",
  "visibility",
  "maxDepth",
  "gas",
  "bottomTime",
  "timeIn",
  "timeOut",
  "tank",
  "startPressure",
  "endPressure",
  "current",
  "waveHeight",
  "weight",
  "suit",
  "entryType",
  "buddy",
  "guide",
  "marineLife",
  "notes"
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  bindEvents();
  hydrateSettings();
  renderAll();
  resetForm();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});

function bindEvents() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $("#ownerName").addEventListener("input", saveSettings);
  $("#bookName").addEventListener("input", saveSettings);
  $("#newLogButton").addEventListener("click", () => {
    resetForm();
    showView("entryView");
  });
  $("#logSearch").addEventListener("input", () => {
    state.filters.query = $("#logSearch").value.trim();
    renderLogs();
  });
  $("#areaFilter").addEventListener("change", () => {
    state.filters.area = $("#areaFilter").value;
    renderLogs();
  });
  $("#clearSearchButton").addEventListener("click", clearFilters);
  $("#copyLastButton").addEventListener("click", copyLastLog);
  $("#locateButton").addEventListener("click", locateUser);
  $("#clearLocationButton").addEventListener("click", clearLocation);
  $("#photos").addEventListener("change", handlePhotos);
  $("#logForm").addEventListener("submit", saveLog);
  $("#timeIn").addEventListener("input", updateDurationPreview);
  $("#timeOut").addEventListener("input", updateDurationPreview);
  $("#closeDetailButton").addEventListener("click", closeDetail);
  $("#cancelEditButton").addEventListener("click", () => {
    resetForm();
    showView("logsView");
  });
  $("#exportButton").addEventListener("click", exportBackup);
  $("#importFile").addEventListener("change", importBackup);
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    state.logs = Array.isArray(data.logs) ? data.logs : [];
    state.settings = { ...state.settings, ...(data.settings || {}) };
  } catch {
    state.logs = [];
  }
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ logs: state.logs, settings: state.settings })
  );
}

function hydrateSettings() {
  $("#ownerName").value = state.settings.ownerName || "";
  $("#bookName").value = state.settings.bookName || "Blue Logbook";
  document.title = state.settings.bookName || "Blue Logbook";
}

function saveSettings() {
  state.settings.ownerName = $("#ownerName").value.trim();
  state.settings.bookName = $("#bookName").value.trim() || "Blue Logbook";
  document.title = state.settings.bookName;
  persist();
}

function showView(viewId) {
  $$(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.view === viewId));
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));

  if (viewId === "entryView") {
    initPickerMap();
  }
  if (viewId === "mapView") {
    setTimeout(renderOverviewMap, 80);
  }
}

function renderAll() {
  renderStats();
  renderAreaFilter();
  renderLogs();
  renderMapList();
}

function renderStats() {
  const totalMinutes = state.logs.reduce((sum, log) => sum + parseMinutes(log.bottomTime), 0);
  const deepest = state.logs.reduce((max, log) => Math.max(max, Number(log.maxDepth || 0)), 0);
  const sites = new Set(state.logs.map((log) => log.site || log.area).filter(Boolean));

  $("#stats").innerHTML = [
    statHtml(state.logs.length, "記録した本数"),
    statHtml(`${totalMinutes || 0}分`, "合計潜水時間"),
    statHtml(deepest ? `${deepest}m` : "0m", "最大深度")
  ].join("") + statHtml(sites.size, "潜った場所");
}

function statHtml(value, label) {
  return `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

function renderLogs() {
  const list = $("#logList");
  list.innerHTML = "";

  if (!state.logs.length) {
    $("#filterStatus").textContent = "";
    list.innerHTML = `<div class="empty">まだログがありません。「新規ログ」から最初のダイビングを記録できます。</div>`;
    return;
  }

  const logs = filteredLogs();
  $("#filterStatus").textContent = filterStatusText(logs.length);

  if (!logs.length) {
    list.innerHTML = `<div class="empty">条件に合うログがありません。地域やキーワードを変えて探してみてください。</div>`;
    return;
  }

  logs.forEach((log) => {
    list.appendChild(createLogCard(log));
  });
}

function renderAreaFilter() {
  const select = $("#areaFilter");
  const selected = state.filters.area;
  const areas = [...new Set(state.logs.map((log) => log.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));

  select.innerHTML = `<option value="">すべての地域</option>` + areas
    .map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`)
    .join("");

  if (areas.includes(selected)) {
    select.value = selected;
  } else {
    state.filters.area = "";
    select.value = "";
  }
}

function createLogCard(log) {
  const node = $("#logCardTemplate").content.firstElementChild.cloneNode(true);
  const title = [log.area, log.site].filter(Boolean).join(" / ") || "未設定のポイント";
  const photo = node.querySelector(".log-card__photo");

  photo.src = log.photos?.[0] || "assets/ocean-hero.png";
  photo.alt = title;
  node.querySelector("h3").textContent = title;
  node.querySelector(".log-card__date").textContent = formatDate(log.date);
  node.querySelector(".log-card__number").textContent = log.diveNumber ? `No. ${log.diveNumber}` : "";
  node.querySelector(".log-card__notes").textContent = log.notes || log.marineLife || "";
  node.querySelector(".log-card__facts").innerHTML = factsHtml(log);

  node.querySelector(".view-log").addEventListener("click", () => viewLog(log.id));
  node.querySelector(".edit-log").addEventListener("click", () => editLog(log.id));
  node.querySelector(".duplicate-log").addEventListener("click", () => duplicateLog(log.id));
  node.querySelector(".delete-log").addEventListener("click", () => deleteLog(log.id));
  return node;
}

function factsHtml(log) {
  const facts = [
    ["深度", log.maxDepth ? `${log.maxDepth}m` : ""],
    ["時間", log.bottomTime ? `${log.bottomTime}分` : ""],
    ["Time", log.timeIn && log.timeOut ? `${log.timeIn}-${log.timeOut}` : ""],
    ["ガス", log.gas || ""],
    ["水温", log.waterTemp ? `${log.waterTemp}度` : ""],
    ["透明度", log.visibility || ""],
    ["バディ", log.buddy || ""]
  ].filter(([, value]) => value);

  return facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function renderMapList() {
  const list = $("#mapLogList");
  const located = sortedLogs().filter((log) => log.location);
  list.innerHTML = located.length
    ? located.map((log) => `<div class="empty">${escapeHtml(formatDate(log.date))} ${escapeHtml(log.site || log.area || "未設定のポイント")}</div>`).join("")
    : `<div class="empty">位置情報つきのログがまだありません。入力画面で現在地を取得するか、地図をタップして保存できます。</div>`;
}

function sortedLogs() {
  return [...state.logs].sort((a, b) => (b.date || "").localeCompare(a.date || "") || Number(b.diveNumber || 0) - Number(a.diveNumber || 0));
}

function filteredLogs() {
  const query = normalizeSearchText(state.filters.query);
  return sortedLogs().filter((log) => {
    const areaMatches = !state.filters.area || log.area === state.filters.area;
    if (!areaMatches) return false;
    if (!query) return true;

    const searchable = [
      log.area,
      log.site,
      log.buddy,
      log.guide,
      log.marineLife,
      log.notes,
      log.weather,
      log.gas,
      log.current,
      log.waveHeight,
      log.entryType,
      log.suit,
      log.tank
    ].map(normalizeSearchText).join(" ");

    return searchable.includes(query);
  });
}

function filterStatusText(count) {
  if (!state.filters.query && !state.filters.area) return "";
  const parts = [];
  if (state.filters.area) parts.push(`地域: ${state.filters.area}`);
  if (state.filters.query) parts.push(`検索: ${state.filters.query}`);
  return `${parts.join(" / ")} / ${count}件`;
}

function clearFilters() {
  state.filters.query = "";
  state.filters.area = "";
  $("#logSearch").value = "";
  $("#areaFilter").value = "";
  renderLogs();
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function resetForm() {
  $("#logForm").reset();
  $("#logId").value = "";
  $("#date").value = today();
  $("#diveNumber").value = nextDiveNumber();
  updateDurationPreview();
  state.draftPhotos = [];
  state.draftLocation = null;
  $("#entryTitle").textContent = "ログを入力";
  renderPhotoPreview();
  updateLocationText();
  updatePickerMarker();
}

function editLog(id) {
  const log = state.logs.find((item) => item.id === id);
  if (!log) return;

  $("#logId").value = log.id;
  fields.forEach((name) => {
    $(`#${name}`).value = log[name] ?? "";
  });
  updateDurationPreview();
  state.draftPhotos = [...(log.photos || [])];
  state.draftLocation = log.location || null;
  $("#entryTitle").textContent = "ログを編集";
  renderPhotoPreview();
  showView("entryView");
  updateLocationText();
  updatePickerMarker();
}

function viewLog(id) {
  const log = state.logs.find((item) => item.id === id);
  if (!log) return;

  const title = [log.area, log.site].filter(Boolean).join(" / ") || "未設定のポイント";
  $("#detailTitle").textContent = title;
  $("#detailBody").innerHTML = detailHtml(log);
  $("#detailDialog").showModal();
}

function closeDetail() {
  $("#detailDialog").close();
}

function deleteLog(id) {
  const log = state.logs.find((item) => item.id === id);
  if (!log) return;

  const title = [log.area, log.site].filter(Boolean).join(" / ") || "このログ";
  const ok = window.confirm(`${title}を削除します。バックアップしていない場合、この端末から元に戻せません。削除しますか？`);
  if (!ok) return;

  state.logs = state.logs.filter((item) => item.id !== id);
  persist();
  renderAll();
}

function duplicateLog(id) {
  const source = state.logs.find((item) => item.id === id);
  if (!source) return;
  fillFromSource(source);
  showView("entryView");
}

function copyLastLog() {
  const source = sortedLogs()[0];
  if (!source) return;
  fillFromSource(source);
}

function fillFromSource(source) {
  $("#logId").value = "";
  fields.forEach((name) => {
    $(`#${name}`).value = source[name] ?? "";
  });
  $("#date").value = today();
  $("#diveNumber").value = nextDiveNumber();
  updateDurationPreview();
  state.draftPhotos = [];
  state.draftLocation = source.location || null;
  $("#entryTitle").textContent = "コピーから新規作成";
  renderPhotoPreview();
  updateLocationText();
  updatePickerMarker();
}

function saveLog(event) {
  event.preventDefault();
  const id = $("#logId").value || crypto.randomUUID();
  const payload = { id, updatedAt: new Date().toISOString() };

  fields.forEach((name) => {
    payload[name] = $(`#${name}`).value.trim();
  });

  const calculatedDuration = calculateDurationMinutes(payload.timeIn, payload.timeOut);
  if (calculatedDuration !== null) {
    payload.bottomTime = String(calculatedDuration);
  }

  payload.photos = [...state.draftPhotos];
  payload.location = state.draftLocation;

  const index = state.logs.findIndex((log) => log.id === id);
  if (index >= 0) {
    state.logs[index] = payload;
  } else {
    state.logs.push(payload);
  }

  persist();
  renderAll();
  resetForm();
  showView("logsView");
}

function updateDurationPreview() {
  const minutes = calculateDurationMinutes($("#timeIn").value, $("#timeOut").value);
  const display = minutes === null ? "--分" : `${minutes}分`;
  $("#bottomTime").value = minutes === null ? "" : String(minutes);
  $("#durationPreview").textContent = display;
}

function calculateDurationMinutes(timeIn, timeOut) {
  if (!timeIn || !timeOut) return null;

  const start = timeToMinutes(timeIn);
  const end = timeToMinutes(timeOut);
  if (start === null || end === null) return null;

  const duration = end >= start ? end - start : end + 24 * 60 - start;
  return duration > 0 ? duration : null;
}

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function detailHtml(log) {
  const photos = (log.photos || [])
    .map((src) => `<img src="${src}" alt="${escapeHtml(log.site || "ログ写真")}">`)
    .join("");
  const rows = [
    ["日付", formatDate(log.date)],
    ["ダイブ番号", log.diveNumber ? `No. ${log.diveNumber}` : ""],
    ["エリア", log.area],
    ["ポイント名", log.site],
    ["Time in", log.timeIn],
    ["Time out", log.timeOut],
    ["潜水時間", log.bottomTime ? `${log.bottomTime}分` : ""],
    ["天気", log.weather],
    ["気温", log.airTemp ? `${log.airTemp}度` : ""],
    ["水温", log.waterTemp ? `${log.waterTemp}度` : ""],
    ["透明度", log.visibility],
    ["最大深度", log.maxDepth ? `${log.maxDepth}m` : ""],
    ["使用ガス", log.gas],
    ["タンク", log.tank],
    ["開始圧", log.startPressure],
    ["終了圧", log.endPressure],
    ["流れ", log.current],
    ["波高", log.waveHeight],
    ["ウエイト", log.weight],
    ["スーツ", log.suit],
    ["エントリー", log.entryType],
    ["バディ", log.buddy],
    ["ガイド", log.guide],
    ["見た生き物", log.marineLife],
    ["メモ", log.notes],
    ["位置", log.location ? `${log.location.lat}, ${log.location.lng}` : ""]
  ].filter(([, value]) => value);

  return `
    ${photos ? `<div class="detail-photos">${photos}</div>` : ""}
    <dl class="detail-list">
      ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
  `;
}

function initPickerMap() {
  if (!window.L || state.pickerMap) {
    updatePickerMarker();
    return;
  }

  state.pickerMap = L.map("pickerMap", { zoomControl: false }).setView([35.0, 139.0], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.pickerMap);

  state.pickerMap.on("click", (event) => setLocation(event.latlng.lat, event.latlng.lng));
  updatePickerMarker();
  setTimeout(() => state.pickerMap.invalidateSize(), 120);
}

function locateUser() {
  if (!window.isSecureContext) {
    updateLocationText("現在地取得にはHTTPSのURLが必要です。公開時はhttps://で配布してください。今は地図をタップして場所を指定できます。");
    return;
  }

  if (!navigator.geolocation) {
    updateLocationText("このブラウザでは現在地取得が使えません。地図をタップして場所を指定してください。");
    return;
  }

  updateLocationText("現在地を取得しています。");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation(position.coords.latitude, position.coords.longitude);
    },
    (error) => {
      const messages = {
        1: "位置情報が許可されていません。ブラウザや端末の位置情報設定を許可するか、地図をタップして場所を指定してください。",
        2: "現在地を特定できませんでした。屋外で再試行するか、地図をタップして場所を指定してください。",
        3: "現在地取得がタイムアウトしました。もう一度試すか、地図をタップして場所を指定してください。"
      };
      updateLocationText(messages[error.code] || "現在地を取得できませんでした。地図をタップして場所を指定してください。");
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

function setLocation(lat, lng) {
  state.draftLocation = {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
  updateLocationText();
  updatePickerMarker();
}

function clearLocation() {
  state.draftLocation = null;
  updateLocationText();
  updatePickerMarker();
}

function updateLocationText(message) {
  $("#locationText").textContent = message || (state.draftLocation
    ? `保存する位置: ${state.draftLocation.lat}, ${state.draftLocation.lng}`
    : "地図をタップ、またはピンを動かして場所を修正できます。");
}

function updatePickerMarker() {
  if (!state.pickerMap || !window.L) return;

  if (!state.draftLocation) {
    if (state.pickerMarker) {
      state.pickerMap.removeLayer(state.pickerMarker);
      state.pickerMarker = null;
    }
    return;
  }

  const latLng = [state.draftLocation.lat, state.draftLocation.lng];
  if (!state.pickerMarker) {
    state.pickerMarker = L.marker(latLng, { draggable: true }).addTo(state.pickerMap);
    state.pickerMarker.on("dragend", (event) => {
      const pos = event.target.getLatLng();
      setLocation(pos.lat, pos.lng);
    });
  } else {
    state.pickerMarker.setLatLng(latLng);
  }
  state.pickerMap.setView(latLng, Math.max(state.pickerMap.getZoom(), 13));
}

function renderOverviewMap() {
  if (!window.L) return;
  if (!state.overviewMap) {
    state.overviewMap = L.map("overviewMap").setView([35.0, 139.0], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.overviewMap);
    state.overviewLayer = L.layerGroup().addTo(state.overviewMap);
  }

  state.overviewLayer.clearLayers();
  const points = state.logs.filter((log) => log.location);
  points.forEach((log) => {
    const title = [log.area, log.site].filter(Boolean).join(" / ") || "未設定のポイント";
    L.marker([log.location.lat, log.location.lng])
      .bindPopup(`<b>${escapeHtml(title)}</b><br>${escapeHtml(formatDate(log.date))}`)
      .addTo(state.overviewLayer);
  });

  setTimeout(() => state.overviewMap.invalidateSize(), 80);
  if (points.length) {
    const bounds = L.latLngBounds(points.map((log) => [log.location.lat, log.location.lng]));
    state.overviewMap.fitBounds(bounds.pad(0.25));
  }
}

async function handlePhotos(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const dataUrl = await compressImage(file, 1400, 0.78);
    state.draftPhotos.push(dataUrl);
  }
  event.target.value = "";
  renderPhotoPreview();
}

function renderPhotoPreview() {
  const preview = $("#photoPreview");
  preview.innerHTML = "";
  state.draftPhotos.forEach((src, index) => {
    const tile = document.createElement("div");
    tile.className = "photo-tile";
    tile.innerHTML = `<img src="${src}" alt="追加した写真"><button type="button">削除</button>`;
    tile.querySelector("button").addEventListener("click", () => {
      state.draftPhotos.splice(index, 1);
      renderPhotoPreview();
    });
    preview.appendChild(tile);
  });
}

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function exportBackup() {
  const data = {
    app: "Blue Logbook",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    logs: state.logs
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const name = state.settings.ownerName || "my";
  link.href = url;
  link.download = `blue-logbook-${name}-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  $("#backupStatus").textContent = "バックアップを書き出しました。ファイルアプリ、Google Drive、iCloud Driveなどに保管してください。";
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.logs)) throw new Error("Invalid backup");
      state.logs = data.logs;
      state.settings = { ...state.settings, ...(data.settings || {}) };
      persist();
      hydrateSettings();
      renderAll();
      $("#backupStatus").textContent = "バックアップを読み込みました。";
    } catch {
      $("#backupStatus").textContent = "読み込めませんでした。Blue Logbookのバックアップファイルを選んでください。";
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function nextDiveNumber() {
  const max = state.logs.reduce((value, log) => Math.max(value, parseMinutes(log.diveNumber)), 0);
  return max + 1;
}

function parseMinutes(value) {
  const number = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "日付未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
