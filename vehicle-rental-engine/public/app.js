const storageKey = "urbanride-token";

const state = {
  token: localStorage.getItem(storageKey) || "",
  bootstrap: null,
  user: null,
  vehicles: [],
  reviews: [],
  promotions: [],
  addOns: [],
  bookings: [],
  tickets: [],
  admin: null,
  paymentContext: null,
  pendingVehicleAfterAuth: null,
  selectedVehicleId: null,
};

const refs = {
  authModal: document.querySelector("#authModal"),
  bookingModal: document.querySelector("#bookingModal"),
  reviewModal: document.querySelector("#reviewModal"),
  authForm: document.querySelector("#authForm"),
  bookingForm: document.querySelector("#bookingForm"),
  reviewForm: document.querySelector("#reviewForm"),
  supportForm: document.querySelector("#supportForm"),
  filterForm: document.querySelector("#filterForm"),
  statsStrip: document.querySelector("#statsStrip"),
  promoGrid: document.querySelector("#promoGrid"),
  vehicleGrid: document.querySelector("#vehicleGrid"),
  bookingList: document.querySelector("#bookingList"),
  paymentPanel: document.querySelector("#paymentPanel"),
  reviewGrid: document.querySelector("#reviewGrid"),
  supportList: document.querySelector("#supportList"),
  adminPanel: document.querySelector("#adminPanel"),
  authStatus: document.querySelector("#authStatus"),
  loginBtn: document.querySelector("#loginBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  showLoginTabBtn: document.querySelector("#showLoginTabBtn"),
  showRegisterTabBtn: document.querySelector("#showRegisterTabBtn"),
  authModeInput: document.querySelector("#authMode"),
  authNameWrap: document.querySelector("#authNameWrap"),
  authPhoneWrap: document.querySelector("#authPhoneWrap"),
  toastRegion: document.querySelector("#toastRegion"),
  bookingVehicleTitle: document.querySelector("#bookingVehicleTitle"),
  bookingVehicleId: document.querySelector("#bookingVehicleId"),
  bookingAddOnList: document.querySelector("#bookingAddOnList"),
  quotePreview: document.querySelector("#quotePreview"),
  reviewBookingId: document.querySelector("#reviewBookingId"),
  refreshBookingsBtn: document.querySelector("#refreshBookingsBtn"),
  refreshAdminBtn: document.querySelector("#refreshAdminBtn"),
};

function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...options,
    headers,
  }).then(async (response) => {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "string" ? payload : payload?.error || `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload;
  });
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function shortDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fullDateTime(value) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  refs.toastRegion.append(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function openModal(name) {
  const modal = document.querySelector(`#${name}Modal`);
  modal?.classList.remove("hidden");
}

function closeModal(name) {
  const modal = document.querySelector(`#${name}Modal`);
  modal?.classList.add("hidden");
}

function setAuthMode(mode) {
  const isRegister = mode === "register";
  refs.authModeInput.value = mode;
  refs.showLoginTabBtn.classList.toggle("active", !isRegister);
  refs.showRegisterTabBtn.classList.toggle("active", isRegister);
  refs.authNameWrap.classList.toggle("hidden", !isRegister);
  refs.authPhoneWrap.classList.toggle("hidden", !isRegister);
}

function saveToken(token) {
  state.token = token || "";
  if (state.token) {
    localStorage.setItem(storageKey, state.token);
  } else {
    localStorage.removeItem(storageKey);
  }
}

function getVehicle(vehicleId) {
  return state.vehicles.find((vehicle) => vehicle.id === vehicleId) || state.admin?.vehicles?.find((vehicle) => vehicle.id === vehicleId);
}

function getBooking(bookingId) {
  return state.bookings.find((booking) => booking.id === bookingId) || state.admin?.bookings?.find((booking) => booking.id === bookingId);
}

function hasReviewForBooking(bookingId) {
  return state.reviews.some((review) => review.bookingId === bookingId);
}

function setDefaultBookingDates() {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  start.setDate(today.getDate() + 1);
  end.setDate(today.getDate() + 3);
  refs.bookingForm.elements.startDate.value = start.toISOString().slice(0, 10);
  refs.bookingForm.elements.endDate.value = end.toISOString().slice(0, 10);
}

function renderStats() {
  const stats = state.bootstrap?.stats;
  if (!stats) {
    refs.statsStrip.innerHTML = "";
    return;
  }

  refs.statsStrip.innerHTML = `
    <div class="stat-card">
      <strong>${stats.totalVehicles}</strong>
      <span>vehicles in the live fleet</span>
    </div>
    <div class="stat-card">
      <strong>${stats.activeCities}</strong>
      <span>cities covered by the platform</span>
    </div>
    <div class="stat-card">
      <strong>${stats.completedBookings}</strong>
      <span>completed sample journeys</span>
    </div>
    <div class="stat-card">
      <strong>${stats.averageRating}</strong>
      <span>average review score</span>
    </div>
  `;
}

function renderPromotions() {
  refs.promoGrid.innerHTML = state.promotions
    .map(
      (promo) => `
        <article class="promo-card">
          <strong>${escapeHtml(promo.code)}</strong>
          <h4>${escapeHtml(promo.title)}</h4>
          <p>Minimum subtotal: ${currency(promo.minSubtotal || 0)}</p>
        </article>
      `
    )
    .join("");
}

function renderVehicles() {
  if (!state.vehicles.length) {
    refs.vehicleGrid.innerHTML = `<div class="empty-state">No vehicles match the current filters. Try widening the date or category search.</div>`;
    return;
  }

  refs.vehicleGrid.innerHTML = state.vehicles
    .map((vehicle) => {
      const unavailable = vehicle.status === "maintenance";
      const features = (vehicle.features || []).slice(0, 3).map((feature) => `<span class="pill">${escapeHtml(feature)}</span>`).join("");
      return `
        <article class="vehicle-card ${escapeHtml(vehicle.color || "sunset")}">
          <div class="vehicle-top">
            <div>
              <span class="status-badge ${vehicle.featured ? "confirmed" : "open"}">${escapeHtml(vehicle.badge || "Available")}</span>
              <h4>${escapeHtml(vehicle.name)}</h4>
              <p class="muted">${escapeHtml(vehicle.category)} in ${escapeHtml(vehicle.city)}</p>
            </div>
            <div class="pill">${vehicle.rating} ★</div>
          </div>
          <p class="vehicle-description">${escapeHtml(vehicle.description)}</p>
          <div class="pill-row">
            <span class="pill">${escapeHtml(vehicle.transmission)}</span>
            <span class="pill">${escapeHtml(vehicle.fuel)}</span>
            <span class="pill">${escapeHtml(vehicle.seats)} seats</span>
            <span class="pill">${escapeHtml(vehicle.mileage)}</span>
          </div>
          <div class="pill-row">${features}</div>
          <div class="vehicle-footer">
            <div class="price-block">
              <strong>${currency(vehicle.pricePerDay)}</strong>
              <span>per day · deposit ${currency(vehicle.securityDeposit)}</span>
            </div>
            <button class="button ${unavailable ? "ghost" : "primary"}" type="button" data-action="book" data-id="${vehicle.id}" ${
              unavailable ? "disabled" : ""
            }>${unavailable ? "In maintenance" : "Rent now"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBookings() {
  if (!state.user) {
    refs.bookingList.innerHTML = `<div class="empty-state">Sign in to create bookings, see invoices, and manage payment status.</div>`;
    return;
  }

  if (!state.bookings.length) {
    refs.bookingList.innerHTML = `<div class="empty-state">No bookings yet. Pick a vehicle to start a rental.</div>`;
    return;
  }

  refs.bookingList.innerHTML = state.bookings
    .map((booking) => {
      const canReview = booking.status === "completed" && !hasReviewForBooking(booking.id);
      return `
        <article class="booking-card">
          <div class="booking-header">
            <div>
              <p class="eyebrow">${escapeHtml(booking.vehicle?.category || "Vehicle")}</p>
              <h4>${escapeHtml(booking.vehicle?.name || "Vehicle")}</h4>
            </div>
            <div class="inline-actions">
              <span class="status-badge ${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span>
              <span class="status-badge ${escapeHtml(booking.paymentStatus)}">${escapeHtml(booking.paymentStatus)}</span>
            </div>
          </div>
          <div class="booking-meta">
            <span class="pill">${shortDate(booking.startDate)} to ${shortDate(booking.endDate)}</span>
            <span class="pill">${escapeHtml(booking.pickupLocation)}</span>
            <span class="pill">Total ${currency(booking.quote?.grandTotal)}</span>
          </div>
          <p class="muted">Created ${fullDateTime(booking.createdAt)}</p>
          <div class="booking-actions">
            ${
              booking.paymentStatus !== "paid"
                ? `<button class="button primary small" type="button" data-action="pay" data-id="${booking.id}">Pay with QR</button>`
                : ""
            }
            ${
              ["pending-payment", "confirmed"].includes(booking.status)
                ? `<button class="button ghost small" type="button" data-action="cancel-booking" data-id="${booking.id}">Cancel booking</button>`
                : ""
            }
            ${
              booking.paymentStatus === "paid"
                ? `<button class="button secondary small" type="button" data-action="invoice" data-id="${booking.id}">Download invoice</button>`
                : ""
            }
            ${
              canReview
                ? `<button class="button ghost small" type="button" data-action="review" data-id="${booking.id}">Leave review</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPaymentPanel() {
  if (!state.paymentContext) {
    refs.paymentPanel.innerHTML = `<div class="empty-state">Select a booking to generate its payment QR and invoice.</div>`;
    return;
  }

  const booking = getBooking(state.paymentContext.bookingId);
  refs.paymentPanel.innerHTML = `
    <article class="payment-card">
      <div class="row-between">
        <div>
          <p class="eyebrow">Booking ${escapeHtml(state.paymentContext.bookingId)}</p>
          <h4>${escapeHtml(booking?.vehicle?.name || "Vehicle payment")}</h4>
          <p class="payment-note">Scan the QR with any UPI app or mark the payment as received for this demo flow.</p>
        </div>
        <span class="status-badge ${escapeHtml(booking?.paymentStatus || "pending")}">${escapeHtml(booking?.paymentStatus || "pending")}</span>
      </div>
      <div class="qr-grid">
        <img src="${escapeHtml(state.paymentContext.qrImageUrl)}" alt="UPI QR code for payment" />
        <div class="stack-list">
          <div>
            <p class="eyebrow">Amount</p>
            <h4>${currency(state.paymentContext.amount)}</h4>
          </div>
          <div>
            <p class="eyebrow">UPI ID</p>
            <p>${escapeHtml(state.paymentContext.upiId)}</p>
          </div>
          <div>
            <p class="eyebrow">UPI payload</p>
            <p class="muted">${escapeHtml(state.paymentContext.qrPayload)}</p>
          </div>
          <div class="booking-actions">
            ${
              booking?.paymentStatus !== "paid"
                ? `<button class="button primary small" type="button" data-action="confirm-payment" data-id="${state.paymentContext.bookingId}">I have paid</button>`
                : ""
            }
            <button class="button secondary small" type="button" data-action="invoice" data-id="${state.paymentContext.bookingId}">Download invoice</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderReviews() {
  if (!state.reviews.length) {
    refs.reviewGrid.innerHTML = `<div class="empty-state">Reviews will show up here once trips are completed.</div>`;
    return;
  }

  refs.reviewGrid.innerHTML = state.reviews
    .slice(0, 6)
    .map(
      (review) => `
        <article class="review-card">
          <div class="row-between">
            <div>
              <p class="eyebrow">${escapeHtml(review.vehicleName || "Rental")}</p>
              <h4>${escapeHtml(review.title || "Great experience")}</h4>
            </div>
            <span class="stars">${"★".repeat(Number(review.rating || 5))}</span>
          </div>
          <p>${escapeHtml(review.comment || "")}</p>
          <div class="booking-meta">
            <span class="pill">${escapeHtml(review.customerName || "Customer")}</span>
            <span class="pill">${shortDate(review.createdAt)}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSupport() {
  const disabled = !state.user;
  Array.from(refs.supportForm.elements).forEach((field) => {
    if (field.tagName) {
      field.disabled = disabled;
    }
  });

  if (!state.user) {
    refs.supportList.innerHTML = `<div class="empty-state">Sign in to raise or track support tickets.</div>`;
    return;
  }

  if (!state.tickets.length) {
    refs.supportList.innerHTML = `<div class="empty-state">No support tickets yet.</div>`;
    return;
  }

  refs.supportList.innerHTML = state.tickets
    .map(
      (ticket) => `
        <article class="ticket-card">
          <div class="row-between">
            <div>
              <h4>${escapeHtml(ticket.subject)}</h4>
              <p class="muted">${escapeHtml(ticket.message)}</p>
            </div>
            <div class="inline-actions">
              <span class="status-badge ${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span>
              <span class="status-badge ${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span>
            </div>
          </div>
          <p class="muted">Updated ${fullDateTime(ticket.updatedAt)}</p>
          ${ticket.notes ? `<p><strong>Admin note:</strong> ${escapeHtml(ticket.notes)}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function renderAdmin() {
  const isAdmin = state.user?.role === "admin";
  refs.refreshAdminBtn.classList.toggle("hidden", !isAdmin);

  if (!isAdmin || !state.admin) {
    refs.adminPanel.innerHTML = `<div class="empty-state">Admin tools unlock when you sign in with the demo admin account.</div>`;
    return;
  }

  refs.adminPanel.innerHTML = `
    <div class="admin-metrics">
      <div class="metric">
        <strong>${currency(state.admin.stats.monthlyRevenue)}</strong>
        <span>Total paid booking volume</span>
      </div>
      <div class="metric">
        <strong>${state.admin.stats.pendingPayments}</strong>
        <span>Pending payments</span>
      </div>
      <div class="metric">
        <strong>${state.admin.stats.activeBookings}</strong>
        <span>Active trips</span>
      </div>
      <div class="metric">
        <strong>${state.admin.stats.utilization}%</strong>
        <span>Current utilization</span>
      </div>
    </div>

    <div class="admin-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Fleet creation</p>
          <h3>Add a vehicle</h3>
        </div>
      </div>
      <form id="adminVehicleForm" class="filter-grid">
        <label>
          <span>Name</span>
          <input name="name" type="text" placeholder="Kia Seltos HTX" required />
        </label>
        <label>
          <span>Category</span>
          <input name="category" type="text" placeholder="SUV" required />
        </label>
        <label>
          <span>City</span>
          <input name="city" type="text" placeholder="Bengaluru" required />
        </label>
        <label>
          <span>Fuel</span>
          <input name="fuel" type="text" placeholder="Petrol" required />
        </label>
        <label>
          <span>Transmission</span>
          <input name="transmission" type="text" placeholder="Automatic" required />
        </label>
        <label>
          <span>Seats</span>
          <input name="seats" type="number" min="2" value="5" required />
        </label>
        <label>
          <span>Price / day</span>
          <input name="pricePerDay" type="number" min="500" step="100" required />
        </label>
        <label>
          <span>Deposit</span>
          <input name="securityDeposit" type="number" min="1000" step="100" required />
        </label>
        <label>
          <span>Mileage or range</span>
          <input name="mileage" type="text" placeholder="17 km/l" />
        </label>
        <label>
          <span>Travel range note</span>
          <input name="range" type="text" placeholder="Weekend road trips" />
        </label>
        <label>
          <span>Badge</span>
          <input name="badge" type="text" placeholder="New fleet" />
        </label>
        <label>
          <span>Color token</span>
          <select name="color">
            <option value="sunset">sunset</option>
            <option value="ember">ember</option>
            <option value="midnight">midnight</option>
            <option value="aurora">aurora</option>
            <option value="copper">copper</option>
            <option value="clay">clay</option>
          </select>
        </label>
        <label style="grid-column: 1 / -1;">
          <span>Description</span>
          <textarea name="description" rows="3" placeholder="Describe this vehicle and when renters should choose it."></textarea>
        </label>
        <button class="button primary" type="submit">Add vehicle</button>
      </form>
    </div>

    <div class="table-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Operations</p>
          <h3>Recent bookings</h3>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Booking</th>
            <th>Customer</th>
            <th>Window</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.bookings
            .map((booking) => {
              const actionButtons = [];
              if (booking.status === "confirmed") {
                actionButtons.push(
                  `<button class="button ghost small" type="button" data-action="admin-booking-status" data-id="${booking.id}" data-status="active">Mark active</button>`
                );
              }
              if (booking.status === "active") {
                actionButtons.push(
                  `<button class="button ghost small" type="button" data-action="admin-booking-status" data-id="${booking.id}" data-status="completed">Mark complete</button>`
                );
              }
              if (["pending-payment", "confirmed"].includes(booking.status)) {
                actionButtons.push(
                  `<button class="button ghost small" type="button" data-action="admin-booking-status" data-id="${booking.id}" data-status="cancelled">Cancel</button>`
                );
              }
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(booking.vehicle?.name || booking.id)}</strong><br />
                    <span class="muted">${escapeHtml(booking.id)}</span>
                  </td>
                  <td>${escapeHtml(booking.customer?.name || "Customer")}</td>
                  <td>${shortDate(booking.startDate)} to ${shortDate(booking.endDate)}</td>
                  <td>
                    <span class="status-badge ${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span>
                    <span class="status-badge ${escapeHtml(booking.paymentStatus)}">${escapeHtml(booking.paymentStatus)}</span>
                  </td>
                  <td>
                    <div class="inline-actions">
                      ${actionButtons.join("")}
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="admin-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Fleet</p>
          <h3>Vehicle status</h3>
        </div>
      </div>
      <div class="stack-list">
        ${state.admin.vehicles
          .map(
            (vehicle) => `
              <article class="ticket-card">
                <div class="row-between">
                  <div>
                    <h4>${escapeHtml(vehicle.name)}</h4>
                    <p class="muted">${escapeHtml(vehicle.city)} · ${escapeHtml(vehicle.category)} · ${currency(vehicle.pricePerDay)}/day</p>
                  </div>
                  <div class="inline-actions">
                    <span class="status-badge ${escapeHtml(vehicle.status)}">${escapeHtml(vehicle.status)}</span>
                    <button
                      class="button ghost small"
                      type="button"
                      data-action="toggle-vehicle-status"
                      data-id="${vehicle.id}"
                      data-status="${vehicle.status === "available" ? "maintenance" : "available"}"
                    >${vehicle.status === "available" ? "Send to maintenance" : "Mark available"}</button>
                  </div>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </div>

    <div class="admin-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Support queue</p>
          <h3>Tickets</h3>
        </div>
      </div>
      <div class="stack-list">
        ${state.admin.tickets
          .map(
            (ticket) => `
              <article class="ticket-card">
                <div class="row-between">
                  <div>
                    <h4>${escapeHtml(ticket.subject)}</h4>
                    <p class="muted">${escapeHtml(ticket.customer?.name || "Customer")} · ${escapeHtml(ticket.message)}</p>
                  </div>
                  <div class="inline-actions">
                    <span class="status-badge ${escapeHtml(ticket.priority)}">${escapeHtml(ticket.priority)}</span>
                    <span class="status-badge ${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span>
                  </div>
                </div>
                <div class="inline-actions">
                  ${
                    ticket.status !== "resolved"
                      ? `<button class="button ghost small" type="button" data-action="admin-ticket-status" data-id="${ticket.id}" data-status="resolved">Resolve</button>`
                      : ""
                  }
                  <button class="button ghost small" type="button" data-action="admin-ticket-status" data-id="${ticket.id}" data-status="open">Reopen</button>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderAuth() {
  const isLoggedIn = Boolean(state.user);
  refs.loginBtn.classList.toggle("hidden", isLoggedIn);
  refs.logoutBtn.classList.toggle("hidden", !isLoggedIn);
  refs.refreshBookingsBtn.classList.toggle("hidden", !state.user);
  refs.authStatus.textContent = isLoggedIn
    ? `Signed in as ${state.user.name} (${state.user.role})`
    : "Not signed in";
}

function renderAll() {
  renderAuth();
  renderStats();
  renderPromotions();
  renderVehicles();
  renderBookings();
  renderPaymentPanel();
  renderReviews();
  renderSupport();
  renderAdmin();
}

async function loadVehiclesFromFilters() {
  const params = new URLSearchParams();
  const values = formDataToObject(refs.filterForm);

  Object.entries(values).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const payload = await api(`/api/vehicles?${params.toString()}`);
  state.vehicles = payload.vehicles;
  renderVehicles();
}

async function loadAuthenticatedData() {
  if (!state.user) {
    state.bookings = [];
    state.tickets = [];
    state.admin = null;
    state.paymentContext = null;
    renderAll();
    return;
  }

  const requests = [api("/api/bookings"), api("/api/tickets")];
  if (state.user.role === "admin") {
    requests.push(api("/api/admin/dashboard"));
  }

  const [bookingsPayload, ticketsPayload, adminPayload] = await Promise.all(requests);

  state.bookings = bookingsPayload.bookings || [];
  state.tickets = ticketsPayload.tickets || [];
  state.admin = adminPayload || null;

  const pending = state.bookings.find((booking) => booking.paymentStatus !== "paid");
  if (pending) {
    await loadPaymentContext(pending.id, false);
  } else if (state.paymentContext && !getBooking(state.paymentContext.bookingId)) {
    state.paymentContext = null;
  }

  renderAll();
}

async function bootstrapApp() {
  try {
    const payload = await api("/api/bootstrap");
    state.bootstrap = payload;
    state.user = payload.user;
    state.vehicles = payload.vehicles || [];
    state.reviews = payload.reviews || [];
    state.promotions = payload.promotions || [];
    state.addOns = payload.addOns || [];

    await loadAuthenticatedData();
    renderAll();
  } catch (error) {
    showToast(error.message);
  }
}

function populateAddOnChoices(vehicleId) {
  const vehicle = getVehicle(vehicleId);
  const allowedAddOns = state.addOns.filter((item) => vehicle?.addOnsAllowed?.includes(item.code));

  refs.bookingAddOnList.innerHTML = allowedAddOns
    .map(
      (item) => `
        <label class="checkbox-option">
          <input type="checkbox" name="addOnCodes" value="${escapeHtml(item.code)}" />
          <span>
            <strong>${escapeHtml(item.label)}</strong><br />
            ${escapeHtml(item.description)} · ${currency(item.unitPrice)} ${item.billing === "perDay" ? "/ day" : "flat"}
          </span>
        </label>
      `
    )
    .join("");
}

function openBookingForVehicle(vehicleId) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) {
    return;
  }

  refs.bookingVehicleTitle.textContent = `Book ${vehicle.name}`;
  refs.bookingVehicleId.value = vehicle.id;
  refs.bookingForm.elements.pickupLocation.value = `${vehicle.city} Central Hub`;
  refs.bookingForm.elements.dropoffLocation.value = `${vehicle.city} Central Hub`;
  refs.bookingForm.elements.couponCode.value = "";
  refs.quotePreview.textContent = "Select dates and add-ons to calculate the rental total.";
  populateAddOnChoices(vehicle.id);
  setDefaultBookingDates();
  openModal("booking");
}

async function previewQuote() {
  const values = formDataToObject(refs.bookingForm);
  const addOnCodes = [...refs.bookingForm.querySelectorAll('input[name="addOnCodes"]:checked')].map((input) => input.value);

  const payload = await api("/api/quote", {
    method: "POST",
    body: JSON.stringify({
      vehicleId: values.vehicleId,
      startDate: values.startDate,
      endDate: values.endDate,
      addOnCodes,
      couponCode: values.couponCode,
    }),
  });

  refs.quotePreview.innerHTML = `
    <strong>${payload.quote.rentalDays} rental day${payload.quote.rentalDays > 1 ? "s" : ""}</strong><br />
    Base: ${currency(payload.quote.baseAmount)}<br />
    Add-ons: ${currency(payload.quote.addOnsAmount)}<br />
    Service fee: ${currency(payload.quote.serviceFee)}<br />
    Discount: ${currency(payload.quote.discount)}${payload.quote.discountMessage ? ` <span class="muted">(${escapeHtml(payload.quote.discountMessage)})</span>` : ""}<br />
    Tax: ${currency(payload.quote.tax)}<br />
    Refundable deposit: ${currency(payload.quote.securityDeposit)}<br />
    <strong>Grand total: ${currency(payload.quote.grandTotal)}</strong>
  `;
}

async function loginWithCredentials(email, password) {
  const payload = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveToken(payload.token);
  state.user = payload.user;
  closeModal("auth");
  showToast(`Welcome back, ${payload.user.name}.`);
  await bootstrapApp();

  if (state.pendingVehicleAfterAuth) {
    openBookingForVehicle(state.pendingVehicleAfterAuth);
    state.pendingVehicleAfterAuth = null;
  }
}

async function loadPaymentContext(bookingId, rerender = true) {
  state.paymentContext = await api(`/api/bookings/${bookingId}/payment/qr`);
  if (rerender) {
    renderPaymentPanel();
    document.querySelector("#journeys")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function cancelBooking(bookingId) {
  await api(`/api/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled" }),
  });
  showToast("Booking cancelled.");
  await bootstrapApp();
}

async function updateAdminBookingStatus(bookingId, status) {
  await api(`/api/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  showToast(`Booking moved to ${status}.`);
  await bootstrapApp();
}

async function confirmPayment(bookingId) {
  await api(`/api/bookings/${bookingId}/payment/confirm`, {
    method: "POST",
  });
  showToast("Payment confirmed.");
  await bootstrapApp();
  await loadPaymentContext(bookingId);
}

async function downloadInvoice(bookingId) {
  const response = await api(`/api/bookings/${bookingId}/invoice`);
  const blob = new Blob([response], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${bookingId}-invoice.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function submitReview() {
  const values = formDataToObject(refs.reviewForm);
  await api("/api/reviews", {
    method: "POST",
    body: JSON.stringify({
      bookingId: values.bookingId,
      rating: Number(values.rating),
      title: values.title,
      comment: values.comment,
    }),
  });
  showToast("Review published.");
  refs.reviewForm.reset();
  closeModal("review");
  await bootstrapApp();
}

async function submitTicket() {
  if (!state.user) {
    openModal("auth");
    showToast("Please sign in to contact support.");
    return;
  }

  const values = formDataToObject(refs.supportForm);
  await api("/api/tickets", {
    method: "POST",
    body: JSON.stringify(values),
  });
  refs.supportForm.reset();
  showToast("Support ticket raised.");
  await bootstrapApp();
}

async function submitAdminVehicle(form) {
  const values = formDataToObject(form);
  await api("/api/vehicles", {
    method: "POST",
    body: JSON.stringify({
      ...values,
      pricePerDay: Number(values.pricePerDay),
      securityDeposit: Number(values.securityDeposit),
      seats: Number(values.seats),
      addOnsAllowed: state.addOns.map((item) => item.code),
      features: ["Bluetooth audio", "Fast booking ready", "Fleet maintained"],
    }),
  });
  form.reset();
  showToast("Vehicle added to fleet.");
  await bootstrapApp();
}

async function updateTicketStatus(ticketId, status) {
  await api(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  showToast(`Ticket marked ${status}.`);
  await bootstrapApp();
}

async function updateVehicleStatus(vehicleId, status) {
  await api(`/api/vehicles/${vehicleId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  showToast(`Vehicle moved to ${status}.`);
  await bootstrapApp();
}

async function submitBooking() {
  if (!state.user) {
    closeModal("booking");
    openModal("auth");
    showToast("Please sign in before creating a booking.");
    return;
  }

  const values = formDataToObject(refs.bookingForm);
  const addOnCodes = [...refs.bookingForm.querySelectorAll('input[name="addOnCodes"]:checked')].map((input) => input.value);
  const payload = await api("/api/bookings", {
    method: "POST",
    body: JSON.stringify({
      vehicleId: values.vehicleId,
      startDate: values.startDate,
      endDate: values.endDate,
      pickupLocation: values.pickupLocation,
      dropoffLocation: values.dropoffLocation,
      couponCode: values.couponCode,
      addOnCodes,
    }),
  });

  closeModal("booking");
  refs.bookingForm.reset();
  showToast("Booking created. Finish payment to confirm it.");
  await bootstrapApp();
  await loadPaymentContext(payload.booking.id);
}

function handleDocumentClick(event) {
  const actionElement = event.target.closest("[data-action]");
  const closeModalElement = event.target.closest("[data-close-modal]");

  if (closeModalElement) {
    closeModal(closeModalElement.dataset.closeModal);
    return;
  }

  if (!actionElement) {
    return;
  }

  const { action, id, status } = actionElement.dataset;

  if (action === "book") {
    if (!state.user) {
      state.pendingVehicleAfterAuth = id;
      openModal("auth");
      showToast("Sign in to continue with booking.");
      return;
    }
    openBookingForVehicle(id);
  }

  if (action === "pay") {
    loadPaymentContext(id).catch((error) => showToast(error.message));
  }

  if (action === "confirm-payment") {
    confirmPayment(id).catch((error) => showToast(error.message));
  }

  if (action === "cancel-booking") {
    cancelBooking(id).catch((error) => showToast(error.message));
  }

  if (action === "invoice") {
    downloadInvoice(id).catch((error) => showToast(error.message));
  }

  if (action === "review") {
    refs.reviewBookingId.value = id;
    openModal("review");
  }

  if (action === "admin-booking-status") {
    updateAdminBookingStatus(id, status).catch((error) => showToast(error.message));
  }

  if (action === "admin-ticket-status") {
    updateTicketStatus(id, status).catch((error) => showToast(error.message));
  }

  if (action === "toggle-vehicle-status") {
    updateVehicleStatus(id, status).catch((error) => showToast(error.message));
  }
}

async function handleDocumentSubmit(event) {
  const form = event.target;

  if (form === refs.authForm) {
    event.preventDefault();
    const values = formDataToObject(form);

    try {
      if (values.mode === "register") {
        const payload = await api("/api/register", {
          method: "POST",
          body: JSON.stringify(values),
        });
        saveToken(payload.token);
        state.user = payload.user;
        closeModal("auth");
        showToast(`Welcome, ${payload.user.name}.`);
        await bootstrapApp();
        if (state.pendingVehicleAfterAuth) {
          openBookingForVehicle(state.pendingVehicleAfterAuth);
          state.pendingVehicleAfterAuth = null;
        }
      } else {
        await loginWithCredentials(values.email, values.password);
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  if (form === refs.bookingForm) {
    event.preventDefault();
    submitBooking().catch((error) => showToast(error.message));
  }

  if (form === refs.supportForm) {
    event.preventDefault();
    submitTicket().catch((error) => showToast(error.message));
  }

  if (form === refs.reviewForm) {
    event.preventDefault();
    submitReview().catch((error) => showToast(error.message));
  }

  if (form.id === "adminVehicleForm") {
    event.preventDefault();
    submitAdminVehicle(form).catch((error) => showToast(error.message));
  }
}

function attachListeners() {
  refs.loginBtn.addEventListener("click", () => {
    setAuthMode("login");
    openModal("auth");
  });

  refs.logoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // Ignore logout API errors and clear client state.
    }
    saveToken("");
    state.user = null;
    state.bookings = [];
    state.tickets = [];
    state.admin = null;
    state.paymentContext = null;
    showToast("You have been logged out.");
    await bootstrapApp();
  });

  refs.showLoginTabBtn.addEventListener("click", () => setAuthMode("login"));
  refs.showRegisterTabBtn.addEventListener("click", () => setAuthMode("register"));

  refs.filterForm.addEventListener("input", () => {
    loadVehiclesFromFilters().catch((error) => showToast(error.message));
  });
  refs.filterForm.addEventListener("change", () => {
    loadVehiclesFromFilters().catch((error) => showToast(error.message));
  });

  document.querySelector("#heroBrowseBtn").addEventListener("click", () => {
    document.querySelector("#fleet")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("#demoCustomerBtn").addEventListener("click", () => {
    loginWithCredentials("aisha@urbanride.demo", "aisha123").catch((error) => showToast(error.message));
  });

  document.querySelector("#demoAdminBtn").addEventListener("click", () => {
    loginWithCredentials("admin@urbanride.demo", "admin123").catch((error) => showToast(error.message));
  });

  refs.refreshBookingsBtn.addEventListener("click", () => {
    bootstrapApp().catch((error) => showToast(error.message));
  });

  refs.refreshAdminBtn.addEventListener("click", () => {
    bootstrapApp().catch((error) => showToast(error.message));
  });

  document.querySelector("#previewQuoteBtn").addEventListener("click", () => {
    previewQuote().catch((error) => showToast(error.message));
  });

  document.querySelector("#previewQuoteBottomBtn").addEventListener("click", () => {
    previewQuote().catch((error) => showToast(error.message));
  });

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("submit", handleDocumentSubmit);
}

async function init() {
  setAuthMode("login");
  setDefaultBookingDates();
  attachListeners();
  await bootstrapApp();
}

init();
