const PH_BOUNDS =
  "&minlatitude=4.6&maxlatitude=21.1&minlongitude=116.9&maxlongitude=126.6";
const USGS_BASE_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson" +
  PH_BOUNDS +
  "&orderby=time&limit=100";

let map = L.map("map").setView([12.8797, 121.774], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let quakeLayer = L.layerGroup().addTo(map);
let impactCircle = null;
let markers = [];
let isFiltering = false; // prevent double filter runs

function calculateImpactRadius(mag, depth) {
  if (mag <= 0) return 0;

  // Calculate base radius in km
  const baseRadius = Math.pow(10, 0.5 * mag - 1.8);

  // Apply depth attenuation
  const radiusKm = baseRadius * Math.exp(-0.015 * depth);

  // Convert to meters
  return radiusKm * 1000;
}

function getImpactZoneColor(magnitude) {
  if (magnitude >= 6) {
    return {
      color: "rgba(217, 83, 79, 1)",
      fillColor: "rgba(217, 83, 79, 0.25)",
    };
  } else if (magnitude >= 5) {
    return {
      color: "rgba(243, 156, 18, 1)",
      fillColor: "rgba(243, 156, 18, 0.2)",
    };
  } else if (magnitude >= 4) {
    return {
      color: "rgba(241, 196, 15, 1)",
      fillColor: "rgba(241, 196, 15, 0.15)",
    };
  } else {
    return {
      color: "rgba(52, 152, 219, 1)",
      fillColor: "rgba(52, 152, 219, 0.1)",
    };
  }
}

function getIntensityLabel(magnitude) {
  if (magnitude >= 6) {
    return "High Impact (Magnitude ≥ 6)";
  } else if (magnitude >= 5) {
    return "Moderate Impact (Magnitude 5–5.9)";
  } else if (magnitude >= 4) {
    return "Light Impact (Magnitude 4–4.9)";
  } else if (magnitude >= 2.5) {
    return "Minor Impact (Magnitude 2.5–3.9)";
  } else {
    return "Very Minor Impact (Magnitude < 2.5)";
  }
}

function createRippleIcon(magnitude) {
  const maxRadius = magnitude * 15;
  let centerColor, rippleColor;

  if (magnitude >= 6) {
    centerColor = "rgba(217, 83, 79, 1)";
    rippleColor = "rgba(217, 83, 79, 0.7)";
  } else if (magnitude >= 5) {
    centerColor = "rgba(243, 156, 18, 1)";
    rippleColor = "rgba(243, 156, 18, 0.7)";
  } else if (magnitude >= 4) {
    centerColor = "rgba(241, 196, 15, 1)";
    rippleColor = "rgba(241, 196, 15, 0.7)";
  } else if (magnitude >= 2.5) {
    centerColor = "rgba(52, 152, 219, 1)";
    rippleColor = "rgba(52, 152, 219, 0.7)";
  } else {
    centerColor = "rgba(128,128,128, 1)";
    rippleColor = "rgba(128,128,128, 0.5)";
  }

  // Generate a unique ID to avoid style collision
  const uniqueId = 'quake' + Date.now() + Math.floor(Math.random() * 1000);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <style>
        .center-${uniqueId} { fill: ${centerColor}; }
        .ripple-${uniqueId} { fill: none; stroke: ${rippleColor}; stroke-width: 3; opacity: 0; animation: rippleWave-${uniqueId} 2s infinite; }
        .ripple-${uniqueId}:nth-child(2) { animation-delay: 1s; }
        @keyframes rippleWave-${uniqueId} {
          0% { r: 10; opacity: 0.6; }
          70% { opacity: 0.1; }
          100% { r: ${maxRadius}; opacity: 0; }
        }
      </style>
      <circle class="ripple-${uniqueId}" cx="100" cy="100" r="10"></circle>
      <circle class="ripple-${uniqueId}" cx="100" cy="100" r="10"></circle>
      <circle class="center-${uniqueId}" cx="100" cy="100" r="10"></circle>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [maxRadius, maxRadius],
    iconAnchor: [maxRadius / 2, maxRadius / 2],
    popupAnchor: [0, -maxRadius / 2],
  });
}


function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function updateQuakeCount(count) {
  document.getElementById("quake-count").textContent = `${count} earthquakes.`;
}

function clearImpactCircle() {
  if (impactCircle) {
    map.removeLayer(impactCircle);
    impactCircle = null;
  }
}

function clearQuakes() {
  quakeLayer.clearLayers();
  markers = [];
  clearImpactCircle();
  document.getElementById("info-panel").innerHTML = "";
}

function addEarthquakeToList(id, props) {
  const list = document.getElementById("info-panel");
  const quakeEl = document.createElement("div");
  quakeEl.className = "quake-item";
  quakeEl.dataset.id = id;

  const header = document.createElement("div");
  header.className = "quake-header";
  const magSpan = document.createElement("span");
  magSpan.className = "quake-mag";
  magSpan.textContent = props.mag.toFixed(1);

  const colors = getImpactZoneColor(props.mag);

  magSpan.style.backgroundColor = colors.color;
  magSpan.textContent = props.mag.toFixed(1);
  const placeSpan = document.createElement("span");
  placeSpan.className = "quake-place";
  placeSpan.textContent = props.place;
  header.appendChild(magSpan);
  header.appendChild(placeSpan);

  const details = document.createElement("div");
  details.className = "quake-details";
  const timeSpan = document.createElement("span");
  timeSpan.className = "quake-time";
  timeSpan.textContent = formatDateTime(new Date(props.time));
  const depthSpan = document.createElement("span");
  depthSpan.className = "quake-depth";
  depthSpan.textContent = `${props.depth.toFixed(1)} km`;
  details.appendChild(timeSpan);
  details.appendChild(depthSpan);

  quakeEl.appendChild(header);
  quakeEl.appendChild(details);

  quakeEl.addEventListener("click", () => {
    const marker = markers.find((m) => m.id === id);
    if (marker) {
      map.setView(marker.getLatLng(), 11);
      marker.openPopup();
    }

    if (window.innerWidth <= 768) {
      sidebar.classList.add("hidden");
      setTimeout(() => map.invalidateSize(), 350);
    }
  });

  list.appendChild(quakeEl);
}

async function loadEarthquakes() {
  clearQuakes();
  const response = await fetch(USGS_BASE_URL);
  const data = await response.json();

  updateQuakeCount(data.features.length);

  data.features.forEach((feature) => {
    const coords = feature.geometry.coordinates;
    const props = feature.properties;
    const icon = createRippleIcon(props.mag);
    const marker = L.marker([coords[1], coords[0]], { icon: icon });
    marker.id = feature.id;
    const depth = coords[2];
    const magnitude = props.mag;
    const place = props.place;

    const intensityLabel = getIntensityLabel(magnitude);
    const popupContent = `
  <div><strong>${place}</strong></div>
  <div>Magnitude: ${magnitude.toFixed(1)}</div>
  <div>Depth: ${depth.toFixed(1)} km</div>
  <div>Time: ${formatDateTime(new Date(props.time))}</div>
  <div><strong>Intensity:</strong> ${intensityLabel}</div>
`;
    marker.bindPopup(popupContent);
    marker.on("popupopen", () => {
      clearImpactCircle();
      const radius = calculateImpactRadius(magnitude, depth);
      const { color, fillColor } = getImpactZoneColor(magnitude);
      impactCircle = L.circle([coords[1], coords[0]], {
        radius: radius,
        color: color,
        fillColor: fillColor,
        fillOpacity: 0.25,
        weight: 2,
        dashArray: "6",
      }).addTo(map);
    });
    marker.on("popupclose", clearImpactCircle);

    marker.addTo(quakeLayer);
    markers.push(marker);

    addEarthquakeToList(feature.id, {
      mag: magnitude,
      place: place,
      time: props.time,
      depth: depth,
    });
  });

  if (document.getElementById("show-on-map").checked) {
    applyMapFilter();
  }
}

function isSameDate(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

async function loadEarthquakes() {
  clearQuakes();
  const response = await fetch(USGS_BASE_URL);
  const data = await response.json();

  updateQuakeCount(data.features.length);

  data.features.forEach((feature) => {
    const coords = feature.geometry.coordinates;
    const props = feature.properties;
    const icon = createRippleIcon(props.mag);
    const marker = L.marker([coords[1], coords[0]], { icon: icon });
    marker.id = feature.id;
    const depth = coords[2];
    const magnitude = props.mag;
    const place = props.place;

    const intensityLabel = getIntensityLabel(magnitude);
    const popupContent = `
  <div><strong>${place}</strong></div>
  <div>Magnitude: ${magnitude.toFixed(1)}</div>
  <div>Depth: ${depth.toFixed(1)} km</div>
  <div>Time: ${formatDateTime(new Date(props.time))}</div>
  <div><strong>Intensity:</strong> ${intensityLabel}</div>
`;
    marker.bindPopup(popupContent);
    marker.on("popupopen", () => {
      clearImpactCircle();
      const radius = calculateImpactRadius(magnitude, depth);
      const { color, fillColor } = getImpactZoneColor(magnitude);
      impactCircle = L.circle([coords[1], coords[0]], {
        radius: radius,
        color: color,
        fillColor: fillColor,
        fillOpacity: 0.25,
        weight: 2,
        dashArray: "6",
      }).addTo(map);
    });
    marker.on("popupclose", clearImpactCircle);

    marker.addTo(quakeLayer);
    markers.push(marker);

    addEarthquakeToList(feature.id, {
      mag: magnitude,
      place: place,
      time: props.time,
      depth: depth,
    });
  });

  if (document.getElementById("show-on-map").checked) {
    applyMapFilter();
  }
  showDangerIconForLatestToday(data.features);
}

function isSameDate(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function showDangerIconForLatestToday(features) {
  const dangerIcon = document.getElementById("danger-icon");
  const today = new Date();

  // Filter quakes that happened today
  const todayQuakes = features.filter((f) => {
    const quakeDate = new Date(f.properties.time);
    return isSameDate(quakeDate, today);
  });

  const sorted = [...features].sort(
    (a, b) => b.properties.time - a.properties.time
  );
  const latestOverall = sorted[0];
  const latestToday = todayQuakes.length > 0 ? todayQuakes[0] : null;

  if (!latestOverall) {
    dangerIcon.style.display = "none";
    dangerIcon.classList.remove("blink");
    dangerIcon.onclick = null;
    return;
  }

  dangerIcon.style.display = "block";

  if (latestToday) {
    dangerIcon.classList.add("blink");
  } else {
    dangerIcon.classList.remove("blink");
  }

  dangerIcon.onclick = () => {
    const targetQuake = latestToday || latestOverall;
    const marker = markers.find((m) => m.id === targetQuake.id);
    if (!marker) {
      console.warn(
        "Danger icon: Marker not found for quake id",
        targetQuake.id
      );
      return;
    }
    map.setView(marker.getLatLng(), 11);
    setTimeout(() => marker.openPopup(), 250);
  };
}

function applyMapFilter() {
  if (isFiltering) return;
  isFiltering = true;

  const filterActive = document.getElementById("show-on-map").checked;
  const list = document.getElementById("info-panel");
  const quakeItems = list.children;
  let visibleCount = 0;

  for (let item of quakeItems) {
    if (filterActive) {
      const marker = markers.find((m) => m.id === item.dataset.id);
      if (marker && map.getBounds().contains(marker.getLatLng())) {
        item.style.display = "";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    } else {
      item.style.display = "";
      visibleCount++;
    }
  }

  const totalCount = quakeItems.length;
  const quakeCountEl = document.getElementById("quake-count");
  if (filterActive) {
    quakeCountEl.textContent = `${visibleCount} of ${totalCount} earthquakes in map area.`;
  } else {
    quakeCountEl.textContent = `${totalCount} earthquakes.`;
  }

  isFiltering = false;
}

document
  .getElementById("show-on-map")
  .addEventListener("change", applyMapFilter);
map.on("moveend", () => {
  if (document.getElementById("show-on-map").checked) applyMapFilter();
});

const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggle-btn");
toggleBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
  setTimeout(() => map.invalidateSize(), 350);
});

const TIMER_DURATION = 300000;
const canvas = document.getElementById("timer-clock");
const ctx = canvas.getContext("2d");
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = Math.min(centerX, centerY) - 5;

let startTime = localStorage.getItem("timerStartTime");
if (startTime) {
  startTime = Number(startTime);
} else {
  startTime = Date.now();
  localStorage.setItem("timerStartTime", startTime);
}

function drawClockSmooth(elapsedMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 2;
  ctx.stroke();

  const elapsedFraction = Math.min(elapsedMs / TIMER_DURATION, 1);
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + elapsedFraction * 2 * Math.PI;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();

  const handX = centerX + radius * Math.cos(endAngle);
  const handY = centerY + radius * Math.sin(endAngle);
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(handX, handY);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();
}

function animateTimer() {
  const now = Date.now();
  let elapsed = now - startTime;

  if (elapsed >= TIMER_DURATION) {
    startTime = now;
    localStorage.setItem("timerStartTime", startTime);
    loadEarthquakes();
    elapsed = 0;
  }

  drawClockSmooth(elapsed);
  requestAnimationFrame(animateTimer);
}

loadEarthquakes();
requestAnimationFrame(animateTimer);

let userMarker = null;
let trackingLocation = false;
let watchId = null;
let accuracyCircle = null;
let followUser = true;
const LOCATION_BTN = document.getElementById("location-btn");
const ALERT_MODAL = document.getElementById("alert-modal");
const ALERT_CLOSE = document.getElementById("alert-modal-close");
const ALERT_SOUND_TOGGLE = document.getElementById("alert-sound-toggle");
const ALERT_SIREN = document.getElementById("alert-siren");
const RED_EDGES = document.getElementById("red-feathered-edges");

const ALERT_DISTANCE_THRESHOLD_METERS = 50000;

const LOCATION_WARNING = document.createElement("div");
LOCATION_WARNING.id = "location-warning";
LOCATION_WARNING.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: rgba(255, 0, 0, 0.8);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  max-width: 300px;
  z-index: 12000;
  display: none;
  box-shadow: 0 0 10px rgba(255,0,0,0.7);
  cursor: default;
`;
LOCATION_WARNING.textContent =
  "Location access is needed for earthquake alerts and other features to work properly. Please allow location access.";
document.body.appendChild(LOCATION_WARNING);

function showLocationWarning() {
  LOCATION_WARNING.style.display = "block";
}

function hideLocationWarning() {
  LOCATION_WARNING.style.display = "none";
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  function toRad(x) {
    return (x * Math.PI) / 180;
  }
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toggleLocationTracking() {
  if (trackingLocation) {
    stopTracking();
  } else {
    startTracking();
  }
}

function startTracking() {
  if (!navigator.geolocation) {
    showModal(
      "Geolocation Not Supported",
      "Your browser does not support location services. Please try a different browser."
    );
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      hideLocationWarning();

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      updateUserLocation(lat, lng, accuracy);

      if (followUser) {
        map.setView([lat, lng], 15);
        followUser = false;
      }

      throttleCheckNearbyQuake(lat, lng);
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        showLocationWarning(); // your existing div-based warning
      } else if (err.code === err.TIMEOUT) {
        showModal(
          "Location Timeout",
          "Location request timed out. Please try again."
        );
      } else {
        showModal(
          "Location Error",
          "Unable to retrieve your location: " + err.message
        );
      }
      stopTracking();
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );

  trackingLocation = true;
  LOCATION_BTN.style.color = "#4CAF50"; // green when active
  LOCATION_BTN.title = "Stop tracking your location";
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (userMarker) {
    userMarker.setOpacity(0.5);
  }
  if (accuracyCircle) {
    accuracyCircle.remove();
    accuracyCircle = null;
  }

  trackingLocation = false;
  LOCATION_BTN.style.color = "white";
  LOCATION_BTN.title = "Start tracking your location";
  followUser = true;
}

function updateUserLocation(lat, lng, accuracy) {
  if (!userMarker) {
    userMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/14035/14035451.png",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      }),
      title: "Your Location",
    }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
    userMarker.setOpacity(1.0);
  }

  if (!accuracyCircle) {
    accuracyCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: "#136aec",
      fillColor: "#136aec",
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng([lat, lng]);
    accuracyCircle.setRadius(accuracy);
  }
}

let lastQuakeCheck = 0;
function throttleCheckNearbyQuake(lat, lng) {
  const now = Date.now();
  if (now - lastQuakeCheck > 15000) {
    checkNearbyQuake(lat, lng);
    lastQuakeCheck = now;
  }
}

function checkNearbyQuake(userLat, userLng) {
  if (!markers.length) return;

  if (typeof checkNearbyQuake.counter === "undefined")
    checkNearbyQuake.counter = 0;
  checkNearbyQuake.counter++;
  console.log("checkNearbyQuake called count:", checkNearbyQuake.counter);

  const latestQuakeMarker = markers.reduce((latest, marker) => {
    return !latest || marker.options.time > latest.options.time
      ? marker
      : latest;
  }, null);

  const latestQuake = markers[markers.length - 1];
  if (!latestQuake) return;

  const quakeLatLng = latestQuake.getLatLng();

  const dist = getDistanceMeters(
    userLat,
    userLng,
    quakeLatLng.lat,
    quakeLatLng.lng
  );

  if (dist <= ALERT_DISTANCE_THRESHOLD_METERS) {
    showAlertModal();
  } else {
    hideAlertModal();
  }
}

function showAlertModal() {
  if (ALERT_MODAL.style.display === "flex") return;
  ALERT_MODAL.style.display = "flex";
  RED_EDGES.style.display = "block";
  ALERT_SIREN.play().catch((err) => {
    console.warn("Autoplay failed:", err);
  });

  ALERT_SOUND_TOGGLE.textContent = "Stop Siren";
}

// Hide alert modal and stop siren sound
function hideAlertModal() {
  if (ALERT_MODAL.style.display === "none") return;
  ALERT_MODAL.style.display = "none";
  ALERT_SIREN.pause();
  ALERT_SIREN.currentTime = 0;
}

// Toggle siren play/pause from modal button
ALERT_SOUND_TOGGLE.addEventListener("click", () => {
  if (ALERT_SIREN.paused) {
    ALERT_SIREN.play();
    ALERT_SOUND_TOGGLE.textContent = "Stop Siren";
  } else {
    ALERT_SIREN.pause();
    ALERT_SOUND_TOGGLE.textContent = "Play Siren";
  }
});

ALERT_CLOSE.addEventListener("click", hideAlertModal);
LOCATION_BTN.addEventListener("click", toggleLocationTracking);

const SIREN_BTN = document.getElementById("sirenIcon");

SIREN_BTN.addEventListener("click", () => {
  if (ALERT_SIREN.paused) {
    ALERT_SIREN.play();
    ALERT_SOUND_TOGGLE.textContent = "Stop Siren";
    SIREN_BTN.style.filter = "invert(0%)";
    RED_EDGES.style.display = "block";
  } else {
    ALERT_SIREN.pause();
    ALERT_SIREN.currentTime = 0;
    ALERT_SOUND_TOGGLE.textContent = "Play Siren";
    SIREN_BTN.style.filter = "invert(100%)";
    RED_EDGES.style.display = "none";
  }
});

function showLocationWarning() {
  const warning = document.getElementById("location-warning");
  if (warning) warning.style.display = "block";
}

function hideLocationWarning() {
  const warning = document.getElementById("location-warning");
  if (warning) warning.style.display = "none";
}

watchId = navigator.geolocation.watchPosition(
  (pos) => {
    hideLocationWarning();
  },
  (err) => {
    if (err.code === err.PERMISSION_DENIED) {
      showLocationWarning();
    } else {
      showModal(
        "Location Error",
        "Unable to retrieve your location: " + err.message
      );
    }
    trackingLocation = false;
    LOCATION_BTN.style.color = "white";
  },
  { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
);

function showModal(title, message) {
  const modal = document.getElementById("location-modal");
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-message").innerText = message;
  modal.style.display = "flex"; // show modal
}

function hideModal() {
  document.getElementById("location-modal").style.display = "none";
}

// Close button
document.querySelector(".modal-close").onclick = hideModal;
// Close when clicking outside
window.onclick = (e) => {
  if (e.target.id === "location-modal") hideModal();
};
