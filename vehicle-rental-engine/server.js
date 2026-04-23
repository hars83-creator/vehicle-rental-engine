import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "store.json");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const ADD_ON_CATALOG = [
  {
    code: "insurance",
    label: "Premium insurance",
    billing: "perDay",
    unitPrice: 299,
    description: "Zero-depreciation style coverage for dents and scratches.",
  },
  {
    code: "helmet",
    label: "Helmet pair",
    billing: "flat",
    unitPrice: 249,
    description: "Two sanitized ISI-certified helmets for bike rentals.",
  },
  {
    code: "gps",
    label: "GPS navigation",
    billing: "perDay",
    unitPrice: 149,
    description: "Dedicated navigation device preloaded with local maps.",
  },
  {
    code: "child-seat",
    label: "Child seat",
    billing: "flat",
    unitPrice: 399,
    description: "Suitable for family and airport bookings.",
  },
  {
    code: "extra-km",
    label: "Extended distance pack",
    billing: "flat",
    unitPrice: 799,
    description: "Add an extra 250 kilometers to the included distance.",
  },
  {
    code: "doorstep",
    label: "Doorstep pickup",
    billing: "flat",
    unitPrice: 499,
    description: "We deliver and collect the vehicle from your address.",
  },
];

const COMPANY = {
  name: "UrbanRide Rentals",
  supportPhone: "+91 98765 43210",
  supportEmail: "help@urbanride.demo",
  upiId: "urbanride-rentals@upi",
  cityCoverage: ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"],
};

let storeCache = null;
let writeQueue = Promise.resolve();

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function shiftDays(baseDate, offset) {
  const clone = new Date(baseDate);
  clone.setDate(clone.getDate() + offset);
  return toDateOnly(clone);
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function notFound(res, message = "Not found") {
  sendJson(res, 404, { error: message });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function buildVehicleSeeds() {
  return [
    {
      id: "veh-safari",
      name: "Tata Safari XZA+",
      category: "SUV",
      city: "Bengaluru",
      pricePerDay: 4899,
      securityDeposit: 6000,
      transmission: "Automatic",
      fuel: "Diesel",
      seats: 7,
      mileage: "14 km/l",
      range: "Unlimited city rides",
      featured: true,
      status: "available",
      rating: 4.8,
      trips: 128,
      color: "sunset",
      badge: "Family favorite",
      description: "Roomy SUV built for highway trips, airport runs, and long family weekends.",
      features: ["Panoramic sunroof", "Ventilated seats", "Wireless Android Auto", "Reverse camera"],
      addOnsAllowed: ["insurance", "gps", "child-seat", "extra-km", "doorstep"],
    },
    {
      id: "veh-thar",
      name: "Mahindra Thar LX",
      category: "Adventure",
      city: "Delhi",
      pricePerDay: 5299,
      securityDeposit: 7000,
      transmission: "Automatic",
      fuel: "Petrol",
      seats: 4,
      mileage: "11 km/l",
      range: "Weekend trail ready",
      featured: true,
      status: "available",
      rating: 4.7,
      trips: 96,
      color: "ember",
      badge: "Off-road pick",
      description: "Bold off-road SUV for mountain getaways, road trips, and standout city drives.",
      features: ["4x4 drivetrain", "Convertible roof", "Hill-hold assist", "Touchscreen infotainment"],
      addOnsAllowed: ["insurance", "gps", "extra-km", "doorstep"],
    },
    {
      id: "veh-city",
      name: "Honda City ZX",
      category: "Sedan",
      city: "Mumbai",
      pricePerDay: 3499,
      securityDeposit: 4500,
      transmission: "Automatic",
      fuel: "Petrol",
      seats: 5,
      mileage: "18 km/l",
      range: "Airport and business trips",
      featured: false,
      status: "available",
      rating: 4.6,
      trips: 164,
      color: "midnight",
      badge: "Business class",
      description: "Comfortable premium sedan with excellent mileage and a quiet cabin.",
      features: ["Lane watch camera", "Rear AC vents", "Cruise control", "8-inch display"],
      addOnsAllowed: ["insurance", "gps", "child-seat", "doorstep"],
    },
    {
      id: "veh-creta-ev",
      name: "Hyundai Creta EV",
      category: "Electric",
      city: "Hyderabad",
      pricePerDay: 4699,
      securityDeposit: 6500,
      transmission: "Automatic",
      fuel: "Electric",
      seats: 5,
      mileage: "460 km range",
      range: "Fast-charging enabled",
      featured: true,
      status: "available",
      rating: 4.9,
      trips: 58,
      color: "aurora",
      badge: "EV spotlight",
      description: "Smooth electric SUV with premium interior and excellent range for urban fleets.",
      features: ["Fast charge support", "ADAS", "Connected car tech", "Bose audio"],
      addOnsAllowed: ["insurance", "gps", "child-seat", "doorstep"],
    },
    {
      id: "veh-activa",
      name: "Honda Activa 125",
      category: "Scooter",
      city: "Pune",
      pricePerDay: 899,
      securityDeposit: 1500,
      transmission: "Automatic",
      fuel: "Petrol",
      seats: 2,
      mileage: "50 km/l",
      range: "Quick city errands",
      featured: false,
      status: "available",
      rating: 4.5,
      trips: 312,
      color: "copper",
      badge: "Daily commuter",
      description: "Fuel-efficient scooter for city commutes, college rides, and short errands.",
      features: ["LED headlamp", "Silent start", "External fuel lid", "Smart key"],
      addOnsAllowed: ["helmet", "extra-km", "doorstep"],
    },
    {
      id: "veh-himalayan",
      name: "Royal Enfield Himalayan 450",
      category: "Bike",
      city: "Chennai",
      pricePerDay: 1899,
      securityDeposit: 2500,
      transmission: "Manual",
      fuel: "Petrol",
      seats: 2,
      mileage: "30 km/l",
      range: "Touring setup",
      featured: false,
      status: "available",
      rating: 4.8,
      trips: 141,
      color: "clay",
      badge: "Touring legend",
      description: "Adventure motorcycle tuned for weekend escapes and scenic long-distance routes.",
      features: ["Ride-by-wire", "Switchable ABS", "Navigation pod", "Long-travel suspension"],
      addOnsAllowed: ["helmet", "insurance", "extra-km", "doorstep"],
    },
  ];
}

function buildSeedStore() {
  const today = new Date();

  const adminId = "usr-admin";
  const customerId = "usr-aisha";
  const customerTwoId = "usr-rohan";

  const safariBookingId = "book-seed-upcoming";
  const cityBookingId = "book-seed-completed";

  return {
    meta: {
      createdAt: nowIso(),
      company: COMPANY,
    },
    sessions: [],
    coupons: [
      {
        code: "SAVE10",
        type: "percent",
        value: 10,
        maxDiscount: 2000,
        minSubtotal: 3000,
        title: "10% off on your first premium booking",
        active: true,
      },
      {
        code: "WEEKEND500",
        type: "flat",
        value: 500,
        minSubtotal: 2500,
        title: "Flat 500 off for quick weekend trips",
        active: true,
      },
      {
        code: "EVBOOST",
        type: "percent",
        value: 12,
        maxDiscount: 1800,
        minSubtotal: 3500,
        title: "Special discount on EV rentals",
        active: true,
      },
    ],
    users: [
      {
        id: adminId,
        role: "admin",
        name: "Priya Fleet",
        email: "admin@urbanride.demo",
        phone: "+91 90000 11111",
        passwordHash: hashPassword("admin123"),
        createdAt: nowIso(),
      },
      {
        id: customerId,
        role: "customer",
        name: "Aisha Khan",
        email: "aisha@urbanride.demo",
        phone: "+91 98111 22222",
        passwordHash: hashPassword("aisha123"),
        createdAt: nowIso(),
      },
      {
        id: customerTwoId,
        role: "customer",
        name: "Rohan Mehta",
        email: "rohan@urbanride.demo",
        phone: "+91 98222 33333",
        passwordHash: hashPassword("rohan123"),
        createdAt: nowIso(),
      },
    ],
    vehicles: buildVehicleSeeds(),
    bookings: [
      {
        id: safariBookingId,
        userId: customerId,
        vehicleId: "veh-safari",
        startDate: shiftDays(today, 2),
        endDate: shiftDays(today, 5),
        pickupLocation: "Indiranagar Hub",
        dropoffLocation: "Kempegowda Airport",
        couponCode: "SAVE10",
        addOns: [
          { code: "insurance", label: "Premium insurance", billing: "perDay", quantity: 1, unitPrice: 299 },
          { code: "doorstep", label: "Doorstep pickup", billing: "flat", quantity: 1, unitPrice: 499 },
        ],
        quote: {
          rentalDays: 3,
          baseAmount: 14697,
          addOnsAmount: 1396,
          serviceFee: 199,
          discount: 1629,
          tax: 2640,
          securityDeposit: 6000,
          grandTotal: 23303,
        },
        status: "confirmed",
        paymentStatus: "paid",
        createdAt: nowIso(),
        paidAt: nowIso(),
        timeline: [
          { at: nowIso(), label: "Booking placed" },
          { at: nowIso(), label: "Payment confirmed" },
          { at: nowIso(), label: "Pickup scheduled" },
        ],
      },
      {
        id: cityBookingId,
        userId: customerTwoId,
        vehicleId: "veh-city",
        startDate: shiftDays(today, -10),
        endDate: shiftDays(today, -7),
        pickupLocation: "BKC Business Bay",
        dropoffLocation: "BKC Business Bay",
        couponCode: null,
        addOns: [
          { code: "gps", label: "GPS navigation", billing: "perDay", quantity: 1, unitPrice: 149 },
        ],
        quote: {
          rentalDays: 3,
          baseAmount: 10497,
          addOnsAmount: 447,
          serviceFee: 199,
          discount: 0,
          tax: 2006,
          securityDeposit: 4500,
          grandTotal: 17649,
        },
        status: "completed",
        paymentStatus: "paid",
        createdAt: nowIso(),
        paidAt: nowIso(),
        timeline: [
          { at: nowIso(), label: "Booking placed" },
          { at: nowIso(), label: "Vehicle delivered" },
          { at: nowIso(), label: "Trip completed" },
        ],
      },
    ],
    reviews: [
      {
        id: "review-seed-1",
        userId: customerTwoId,
        vehicleId: "veh-city",
        bookingId: cityBookingId,
        rating: 5,
        title: "Smooth airport-to-boardroom rental",
        comment: "Pickup was on time, the sedan was spotless, and the billing was transparent.",
        createdAt: nowIso(),
      },
      {
        id: "review-seed-2",
        userId: customerId,
        vehicleId: "veh-himalayan",
        bookingId: null,
        rating: 4,
        title: "Great weekend ride",
        comment: "The bike was well maintained and the support team helped with route tips.",
        createdAt: nowIso(),
      },
    ],
    tickets: [
      {
        id: "ticket-seed-1",
        userId: customerId,
        subject: "Need early morning pickup",
        message: "Can the Tata Safari be delivered by 6:30 AM instead of 8:00 AM?",
        priority: "medium",
        status: "open",
        notes: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
  };
}

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });

  try {
    await access(storePath);
  } catch {
    await writeFile(storePath, JSON.stringify(buildSeedStore(), null, 2), "utf-8");
  }
}

async function loadStore() {
  if (storeCache) {
    return storeCache;
  }

  await ensureStore();
  const raw = await readFile(storePath, "utf-8");
  storeCache = JSON.parse(raw);
  return storeCache;
}

async function saveStore(store) {
  storeCache = store;
  writeQueue = writeQueue.then(() => writeFile(storePath, JSON.stringify(store, null, 2), "utf-8"));
  await writeQueue;
}

function getAddOnByCode(code) {
  return ADD_ON_CATALOG.find((item) => item.code === code);
}

function rentalDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const milliseconds = end.getTime() - start.getTime();
  const days = Math.ceil(milliseconds / (1000 * 60 * 60 * 24));
  return Number.isFinite(days) && days > 0 ? days : 0;
}

function getDiscount(coupons, couponCode, taxableSubtotal, vehicle) {
  if (!couponCode) {
    return { coupon: null, discount: 0, message: null };
  }

  const coupon = coupons.find((entry) => entry.code.toUpperCase() === couponCode.toUpperCase() && entry.active);

  if (!coupon) {
    return { coupon: null, discount: 0, message: "Coupon code is invalid or inactive." };
  }

  if (coupon.code === "EVBOOST" && vehicle.category !== "Electric") {
    return { coupon, discount: 0, message: "EVBOOST applies only to electric vehicles." };
  }

  if (taxableSubtotal < coupon.minSubtotal) {
    return {
      coupon,
      discount: 0,
      message: `Coupon requires a minimum subtotal of INR ${coupon.minSubtotal}.`,
    };
  }

  let discount = 0;

  if (coupon.type === "percent") {
    discount = Math.round((taxableSubtotal * coupon.value) / 100);
    if (coupon.maxDiscount) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else if (coupon.type === "flat") {
    discount = coupon.value;
  }

  return { coupon, discount, message: null };
}

function normalizeAddOns(addOnCodes = [], vehicle = null) {
  const uniqueCodes = [...new Set(addOnCodes.filter(Boolean))];

  return uniqueCodes
    .map((code) => getAddOnByCode(code))
    .filter(Boolean)
    .filter((item) => !vehicle || vehicle.addOnsAllowed.includes(item.code))
    .map((item) => ({
      code: item.code,
      label: item.label,
      billing: item.billing,
      quantity: 1,
      unitPrice: item.unitPrice,
    }));
}

function calculateQuote({ vehicle, coupons, startDate, endDate, addOnCodes = [], couponCode = "" }) {
  const rentalDays = rentalDaysBetween(startDate, endDate);

  if (!vehicle) {
    return { ok: false, error: "Vehicle not found." };
  }

  if (!rentalDays) {
    return { ok: false, error: "Select a valid date range with at least one rental day." };
  }

  const addOns = normalizeAddOns(addOnCodes, vehicle);
  const baseAmount = vehicle.pricePerDay * rentalDays;
  const addOnsAmount = addOns.reduce((sum, item) => {
    if (item.billing === "perDay") {
      return sum + item.unitPrice * rentalDays * item.quantity;
    }

    return sum + item.unitPrice * item.quantity;
  }, 0);
  const serviceFee = 199;
  const taxableSubtotal = baseAmount + addOnsAmount + serviceFee;
  const discountMeta = getDiscount(coupons, couponCode, taxableSubtotal, vehicle);
  const netSubtotal = Math.max(taxableSubtotal - discountMeta.discount, 0);
  const tax = Math.round(netSubtotal * 0.18);
  const securityDeposit = vehicle.securityDeposit;
  const grandTotal = netSubtotal + tax + securityDeposit;

  return {
    ok: true,
    addOns,
    quote: {
      rentalDays,
      baseAmount,
      addOnsAmount,
      serviceFee,
      discount: discountMeta.discount,
      discountMessage: discountMeta.message,
      tax,
      securityDeposit,
      grandTotal,
      subtotalBeforeTax: netSubtotal,
    },
  };
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

function isVehicleAvailable(store, vehicleId, startDate, endDate, ignoredBookingId = null) {
  const blockedStatuses = new Set(["pending-payment", "confirmed", "active"]);

  return !store.bookings.some((booking) => {
    if (booking.id === ignoredBookingId) {
      return false;
    }

    if (booking.vehicleId !== vehicleId) {
      return false;
    }

    if (!blockedStatuses.has(booking.status)) {
      return false;
    }

    return dateRangesOverlap(startDate, endDate, booking.startDate, booking.endDate);
  });
}

function getVehicleMap(store) {
  return new Map(store.vehicles.map((vehicle) => [vehicle.id, vehicle]));
}

function getUserMap(store) {
  return new Map(store.users.map((user) => [user.id, user]));
}

function enrichBooking(store, booking) {
  const vehicleMap = getVehicleMap(store);
  const userMap = getUserMap(store);
  return {
    ...booking,
    vehicle: vehicleMap.get(booking.vehicleId) || null,
    customer: sanitizeUser(userMap.get(booking.userId) || null),
  };
}

function publicStats(store) {
  const totalVehicles = store.vehicles.length;
  const activeCities = new Set(store.vehicles.map((vehicle) => vehicle.city)).size;
  const completedBookings = store.bookings.filter((booking) => booking.status === "completed").length;
  const averageRating = store.reviews.length
    ? (store.reviews.reduce((sum, review) => sum + review.rating, 0) / store.reviews.length).toFixed(1)
    : "0.0";

  return {
    totalVehicles,
    activeCities,
    completedBookings,
    averageRating,
  };
}

function buildBootstrapPayload(store, user = null) {
  return {
    company: store.meta.company,
    addOns: ADD_ON_CATALOG,
    promotions: store.coupons.filter((coupon) => coupon.active),
    stats: publicStats(store),
    vehicles: store.vehicles,
    reviews: store.reviews
      .map((review) => {
        const customer = store.users.find((userEntry) => userEntry.id === review.userId);
        const vehicle = store.vehicles.find((vehicleEntry) => vehicleEntry.id === review.vehicleId);
        return {
          ...review,
          customerName: customer?.name || "Customer",
          vehicleName: vehicle?.name || "Vehicle",
        };
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    user: sanitizeUser(user),
    demoLogins: {
      admin: { email: "admin@urbanride.demo", password: "admin123" },
      customer: { email: "aisha@urbanride.demo", password: "aisha123" },
    },
  };
}

function createSession(store, userId) {
  const token = randomUUID();
  store.sessions = store.sessions.filter((session) => session.userId !== userId);
  store.sessions.push({
    token,
    userId,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  });
  return token;
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length);
}

function getAuthContext(store, req) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return { token: null, session: null, user: null };
  }

  const session = store.sessions.find((entry) => entry.token === token) || null;
  if (!session) {
    return { token, session: null, user: null };
  }

  session.lastSeenAt = nowIso();
  const user = store.users.find((entry) => entry.id === session.userId) || null;
  return { token, session, user };
}

function requireAuth(store, req, res) {
  const context = getAuthContext(store, req);
  if (!context.user) {
    sendJson(res, 401, { error: "Authentication required." });
    return null;
  }
  return context;
}

function requireAdmin(context, res) {
  if (!context?.user || context.user.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required." });
    return false;
  }
  return true;
}

function matchesVehicleFilters(vehicle, query) {
  const search = (query.search || "").trim().toLowerCase();
  const category = (query.category || "").trim().toLowerCase();
  const city = (query.city || "").trim().toLowerCase();
  const transmission = (query.transmission || "").trim().toLowerCase();
  const fuel = (query.fuel || "").trim().toLowerCase();
  const seatsMin = Number(query.seatsMin || 0);

  if (search) {
    const blob = [vehicle.name, vehicle.category, vehicle.city, vehicle.description, ...(vehicle.features || [])]
      .join(" ")
      .toLowerCase();

    if (!blob.includes(search)) {
      return false;
    }
  }

  if (category && vehicle.category.toLowerCase() !== category) {
    return false;
  }

  if (city && vehicle.city.toLowerCase() !== city) {
    return false;
  }

  if (transmission && vehicle.transmission.toLowerCase() !== transmission) {
    return false;
  }

  if (fuel && vehicle.fuel.toLowerCase() !== fuel) {
    return false;
  }

  if (seatsMin && vehicle.seats < seatsMin) {
    return false;
  }

  return true;
}

function sortVehicles(vehicles, sortBy) {
  const sorted = [...vehicles];

  switch (sortBy) {
    case "price-asc":
      sorted.sort((left, right) => left.pricePerDay - right.pricePerDay);
      break;
    case "price-desc":
      sorted.sort((left, right) => right.pricePerDay - left.pricePerDay);
      break;
    case "rating":
      sorted.sort((left, right) => right.rating - left.rating);
      break;
    default:
      sorted.sort((left, right) => Number(right.featured) - Number(left.featured) || right.rating - left.rating);
      break;
  }

  return sorted;
}

function buildUpiPayload(store, booking) {
  const vehicle = store.vehicles.find((entry) => entry.id === booking.vehicleId);
  const bookingLabel = `${vehicle?.name || "Vehicle"} ${booking.id}`;
  const note = `Rental payment for ${bookingLabel}`;
  const amount = booking.quote?.grandTotal || 0;

  return `upi://pay?pa=${encodeURIComponent(store.meta.company.upiId)}&pn=${encodeURIComponent(
    store.meta.company.name
  )}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR&tn=${encodeURIComponent(note)}`;
}

function buildQrImageUrl(payload) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`;
}

function buildInvoiceText(store, booking) {
  const vehicle = store.vehicles.find((entry) => entry.id === booking.vehicleId);
  const customer = store.users.find((entry) => entry.id === booking.userId);

  return [
    "UrbanRide Rentals Invoice",
    "==========================",
    `Invoice date: ${new Date().toLocaleString("en-IN")}`,
    `Booking ID: ${booking.id}`,
    `Customer: ${customer?.name || "Customer"}`,
    `Vehicle: ${vehicle?.name || "Vehicle"}`,
    `Rental period: ${booking.startDate} to ${booking.endDate}`,
    `Pickup: ${booking.pickupLocation}`,
    `Dropoff: ${booking.dropoffLocation}`,
    "",
    "Amount Summary",
    `Base rent: INR ${booking.quote.baseAmount}`,
    `Add-ons: INR ${booking.quote.addOnsAmount}`,
    `Service fee: INR ${booking.quote.serviceFee}`,
    `Discount: INR ${booking.quote.discount}`,
    `Tax: INR ${booking.quote.tax}`,
    `Security deposit: INR ${booking.quote.securityDeposit}`,
    `Grand total: INR ${booking.quote.grandTotal}`,
    "",
    `Payment status: ${booking.paymentStatus}`,
    `Booking status: ${booking.status}`,
    "",
    `Support: ${store.meta.company.supportPhone} | ${store.meta.company.supportEmail}`,
  ].join("\n");
}

async function serveStaticFile(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    notFound(res);
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      notFound(res);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    const fallback = path.join(publicDir, "index.html");
    try {
      await access(fallback);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      createReadStream(fallback).pipe(res);
    } catch {
      notFound(res);
    }
  }
}

async function handleApi(req, res, url, store) {
  const pathname = url.pathname;
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/bootstrap") {
    const context = getAuthContext(store, req);
    sendJson(res, 200, buildBootstrapPayload(store, context.user));
    return true;
  }

  if (method === "GET" && pathname === "/api/vehicles") {
    const availableFrom = url.searchParams.get("availableFrom");
    const availableTo = url.searchParams.get("availableTo");
    const sort = url.searchParams.get("sort") || "featured";

    const filtered = store.vehicles.filter((vehicle) => matchesVehicleFilters(vehicle, Object.fromEntries(url.searchParams)));
    const availableFiltered =
      availableFrom && availableTo
        ? filtered.filter((vehicle) => isVehicleAvailable(store, vehicle.id, availableFrom, availableTo))
        : filtered;

    sendJson(res, 200, { vehicles: sortVehicles(availableFiltered, sort) });
    return true;
  }

  if (method === "GET" && pathname === "/api/reviews") {
    sendJson(res, 200, { reviews: buildBootstrapPayload(store).reviews });
    return true;
  }

  if (method === "POST" && pathname === "/api/register") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();

    if (!email || !password || !name) {
      sendJson(res, 400, { error: "Name, email, and password are required." });
      return true;
    }

    if (store.users.some((user) => user.email.toLowerCase() === email)) {
      sendJson(res, 409, { error: "An account with this email already exists." });
      return true;
    }

    const user = {
      id: `usr-${randomUUID().slice(0, 8)}`,
      role: "customer",
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      createdAt: nowIso(),
    };

    store.users.push(user);
    const token = createSession(store, user.id);
    await saveStore(store);
    sendJson(res, 201, { token, user: sanitizeUser(user) });
    return true;
  }

  if (method === "POST" && pathname === "/api/login") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = store.users.find((entry) => entry.email.toLowerCase() === email);

    if (!user || user.passwordHash !== hashPassword(password)) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return true;
    }

    const token = createSession(store, user.id);
    await saveStore(store);
    sendJson(res, 200, { token, user: sanitizeUser(user) });
    return true;
  }

  if (method === "POST" && pathname === "/api/logout") {
    const token = getTokenFromRequest(req);
    if (token) {
      store.sessions = store.sessions.filter((entry) => entry.token !== token);
      await saveStore(store);
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "GET" && pathname === "/api/me") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    sendJson(res, 200, { user: sanitizeUser(context.user) });
    return true;
  }

  if (method === "POST" && pathname === "/api/quote") {
    const body = await parseBody(req);
    const vehicle = store.vehicles.find((entry) => entry.id === body.vehicleId);
    const result = calculateQuote({
      vehicle,
      coupons: store.coupons,
      startDate: body.startDate,
      endDate: body.endDate,
      addOnCodes: Array.isArray(body.addOnCodes) ? body.addOnCodes : [],
      couponCode: body.couponCode || "",
    });

    if (!result.ok) {
      sendJson(res, 400, { error: result.error });
      return true;
    }

    if (!isVehicleAvailable(store, body.vehicleId, body.startDate, body.endDate)) {
      sendJson(res, 409, { error: "Vehicle is unavailable for the selected dates." });
      return true;
    }

    sendJson(res, 200, result);
    return true;
  }

  if (method === "GET" && pathname === "/api/bookings") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const bookings =
      context.user.role === "admin"
        ? store.bookings.map((booking) => enrichBooking(store, booking))
        : store.bookings.filter((booking) => booking.userId === context.user.id).map((booking) => enrichBooking(store, booking));

    bookings.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    sendJson(res, 200, { bookings });
    return true;
  }

  if (method === "POST" && pathname === "/api/bookings") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const body = await parseBody(req);
    const vehicle = store.vehicles.find((entry) => entry.id === body.vehicleId);
    const result = calculateQuote({
      vehicle,
      coupons: store.coupons,
      startDate: body.startDate,
      endDate: body.endDate,
      addOnCodes: Array.isArray(body.addOnCodes) ? body.addOnCodes : [],
      couponCode: body.couponCode || "",
    });

    if (!result.ok) {
      sendJson(res, 400, { error: result.error });
      return true;
    }

    if (!isVehicleAvailable(store, body.vehicleId, body.startDate, body.endDate)) {
      sendJson(res, 409, { error: "Vehicle is no longer available for those dates." });
      return true;
    }

    const booking = {
      id: `book-${randomUUID().slice(0, 8)}`,
      userId: context.user.id,
      vehicleId: vehicle.id,
      startDate: body.startDate,
      endDate: body.endDate,
      pickupLocation: String(body.pickupLocation || "Main city hub").trim(),
      dropoffLocation: String(body.dropoffLocation || "Main city hub").trim(),
      couponCode: body.couponCode ? String(body.couponCode).trim().toUpperCase() : null,
      addOns: result.addOns,
      quote: result.quote,
      status: "pending-payment",
      paymentStatus: "pending",
      createdAt: nowIso(),
      timeline: [{ at: nowIso(), label: "Booking placed" }],
    };

    store.bookings.push(booking);
    await saveStore(store);
    sendJson(res, 201, { booking: enrichBooking(store, booking) });
    return true;
  }

  const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  const bookingStatusMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/status$/);
  const bookingPaymentQrMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/payment\/qr$/);
  const bookingPaymentConfirmMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/payment\/confirm$/);
  const bookingInvoiceMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/invoice$/);
  const ticketMatch = pathname.match(/^\/api\/tickets\/([^/]+)$/);
  const vehicleMatch = pathname.match(/^\/api\/vehicles\/([^/]+)$/);

  if (method === "PATCH" && bookingStatusMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const booking = store.bookings.find((entry) => entry.id === bookingStatusMatch[1]);
    if (!booking) {
      notFound(res, "Booking not found.");
      return true;
    }

    const body = await parseBody(req);
    const nextStatus = String(body.status || "").trim();
    const isOwner = booking.userId === context.user.id;

    if (context.user.role !== "admin") {
      if (!isOwner || nextStatus !== "cancelled") {
        sendJson(res, 403, { error: "You can only cancel your own booking." });
        return true;
      }

      if (!["pending-payment", "confirmed"].includes(booking.status)) {
        sendJson(res, 400, { error: "Only upcoming bookings can be cancelled." });
        return true;
      }
    }

    const allowedStatuses = ["pending-payment", "confirmed", "active", "completed", "cancelled"];
    if (!allowedStatuses.includes(nextStatus)) {
      sendJson(res, 400, { error: "Unsupported booking status." });
      return true;
    }

    booking.status = nextStatus;
    booking.timeline.push({ at: nowIso(), label: `Status updated to ${nextStatus}` });
    await saveStore(store);
    sendJson(res, 200, { booking: enrichBooking(store, booking) });
    return true;
  }

  if (method === "GET" && bookingPaymentQrMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const booking = store.bookings.find((entry) => entry.id === bookingPaymentQrMatch[1]);
    if (!booking) {
      notFound(res, "Booking not found.");
      return true;
    }

    if (context.user.role !== "admin" && booking.userId !== context.user.id) {
      sendJson(res, 403, { error: "You do not have access to this booking." });
      return true;
    }

    const payload = buildUpiPayload(store, booking);
    sendJson(res, 200, {
      bookingId: booking.id,
      amount: booking.quote.grandTotal,
      upiId: store.meta.company.upiId,
      qrPayload: payload,
      qrImageUrl: buildQrImageUrl(payload),
    });
    return true;
  }

  if (method === "POST" && bookingPaymentConfirmMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const booking = store.bookings.find((entry) => entry.id === bookingPaymentConfirmMatch[1]);
    if (!booking) {
      notFound(res, "Booking not found.");
      return true;
    }

    if (context.user.role !== "admin" && booking.userId !== context.user.id) {
      sendJson(res, 403, { error: "You do not have access to this booking." });
      return true;
    }

    booking.paymentStatus = "paid";
    if (booking.status === "pending-payment") {
      booking.status = "confirmed";
    }
    booking.paidAt = nowIso();
    booking.timeline.push({ at: nowIso(), label: "Payment confirmed" });
    await saveStore(store);
    sendJson(res, 200, { booking: enrichBooking(store, booking) });
    return true;
  }

  if (method === "GET" && bookingInvoiceMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const booking = store.bookings.find((entry) => entry.id === bookingInvoiceMatch[1]);
    if (!booking) {
      notFound(res, "Booking not found.");
      return true;
    }

    if (context.user.role !== "admin" && booking.userId !== context.user.id) {
      sendJson(res, 403, { error: "You do not have access to this invoice." });
      return true;
    }

    sendText(res, 200, buildInvoiceText(store, booking));
    return true;
  }

  if (method === "POST" && pathname === "/api/reviews") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const body = await parseBody(req);
    const bookingId = String(body.bookingId || "");
    const booking = store.bookings.find((entry) => entry.id === bookingId && entry.userId === context.user.id);

    if (!booking) {
      sendJson(res, 404, { error: "Booking not found." });
      return true;
    }

    if (booking.status !== "completed") {
      sendJson(res, 400, { error: "Reviews can be added only after trip completion." });
      return true;
    }

    if (store.reviews.some((review) => review.bookingId === bookingId)) {
      sendJson(res, 409, { error: "A review already exists for this booking." });
      return true;
    }

    const rating = Number(body.rating || 0);
    if (!rating || rating < 1 || rating > 5) {
      sendJson(res, 400, { error: "Rating must be between 1 and 5." });
      return true;
    }

    const review = {
      id: `review-${randomUUID().slice(0, 8)}`,
      userId: context.user.id,
      vehicleId: booking.vehicleId,
      bookingId,
      rating,
      title: String(body.title || "Great trip").slice(0, 60),
      comment: String(body.comment || "").slice(0, 240),
      createdAt: nowIso(),
    };

    store.reviews.push(review);

    const vehicle = store.vehicles.find((entry) => entry.id === booking.vehicleId);
    if (vehicle) {
      const vehicleReviews = store.reviews.filter((entry) => entry.vehicleId === vehicle.id);
      vehicle.rating = Number(
        (vehicleReviews.reduce((sum, entry) => sum + entry.rating, 0) / vehicleReviews.length).toFixed(1)
      );
    }

    await saveStore(store);
    sendJson(res, 201, { review });
    return true;
  }

  if (method === "GET" && pathname === "/api/tickets") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const tickets =
      context.user.role === "admin"
        ? store.tickets.map((ticket) => ({ ...ticket, customer: sanitizeUser(store.users.find((user) => user.id === ticket.userId)) }))
        : store.tickets.filter((ticket) => ticket.userId === context.user.id);

    tickets.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
    sendJson(res, 200, { tickets });
    return true;
  }

  if (method === "POST" && pathname === "/api/tickets") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const body = await parseBody(req);
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const priority = String(body.priority || "medium");

    if (!subject || !message) {
      sendJson(res, 400, { error: "Subject and message are required." });
      return true;
    }

    const ticket = {
      id: `ticket-${randomUUID().slice(0, 8)}`,
      userId: context.user.id,
      subject,
      message,
      priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
      status: "open",
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    store.tickets.push(ticket);
    await saveStore(store);
    sendJson(res, 201, { ticket });
    return true;
  }

  if (method === "PATCH" && ticketMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    if (!requireAdmin(context, res)) {
      return true;
    }

    const ticket = store.tickets.find((entry) => entry.id === ticketMatch[1]);
    if (!ticket) {
      notFound(res, "Ticket not found.");
      return true;
    }

    const body = await parseBody(req);
    if (body.status) {
      ticket.status = String(body.status);
    }
    if (body.priority) {
      ticket.priority = String(body.priority);
    }
    if (body.notes !== undefined) {
      ticket.notes = String(body.notes);
    }
    ticket.updatedAt = nowIso();
    await saveStore(store);
    sendJson(res, 200, { ticket });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/dashboard") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    if (!requireAdmin(context, res)) {
      return true;
    }

    const paidBookings = store.bookings.filter((booking) => booking.paymentStatus === "paid");
    const monthlyRevenue = paidBookings.reduce((sum, booking) => sum + (booking.quote?.grandTotal || 0), 0);
    const vehiclesNeedingAttention = store.vehicles.filter((vehicle) => vehicle.status === "maintenance").length;
    const utilization = Math.round((store.bookings.filter((booking) => ["confirmed", "active"].includes(booking.status)).length /
      Math.max(store.vehicles.length, 1)) * 100);

    sendJson(res, 200, {
      stats: {
        monthlyRevenue,
        pendingPayments: store.bookings.filter((booking) => booking.paymentStatus === "pending").length,
        activeBookings: store.bookings.filter((booking) => booking.status === "active").length,
        openTickets: store.tickets.filter((ticket) => ticket.status !== "resolved").length,
        utilization,
        vehiclesNeedingAttention,
      },
      bookings: store.bookings.map((booking) => enrichBooking(store, booking)).slice(-8).reverse(),
      tickets: store.tickets
        .map((ticket) => ({ ...ticket, customer: sanitizeUser(store.users.find((user) => user.id === ticket.userId)) }))
        .slice(-8)
        .reverse(),
      vehicles: store.vehicles,
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/vehicles") {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    if (!requireAdmin(context, res)) {
      return true;
    }

    const body = await parseBody(req);
    const vehicle = {
      id: `veh-${randomUUID().slice(0, 8)}`,
      name: String(body.name || "").trim(),
      category: String(body.category || "SUV").trim(),
      city: String(body.city || "Bengaluru").trim(),
      pricePerDay: Number(body.pricePerDay || 0),
      securityDeposit: Number(body.securityDeposit || 0),
      transmission: String(body.transmission || "Automatic").trim(),
      fuel: String(body.fuel || "Petrol").trim(),
      seats: Number(body.seats || 4),
      mileage: String(body.mileage || "").trim(),
      range: String(body.range || "").trim(),
      featured: Boolean(body.featured),
      status: String(body.status || "available"),
      rating: Number(body.rating || 4.5),
      trips: Number(body.trips || 0),
      color: String(body.color || "ember"),
      badge: String(body.badge || "New fleet").trim(),
      description: String(body.description || "").trim(),
      features: Array.isArray(body.features) ? body.features.map(String).filter(Boolean) : [],
      addOnsAllowed: Array.isArray(body.addOnsAllowed) ? body.addOnsAllowed.map(String).filter(Boolean) : [],
    };

    if (!vehicle.name || !vehicle.pricePerDay || !vehicle.securityDeposit) {
      sendJson(res, 400, { error: "Vehicle name, daily price, and security deposit are required." });
      return true;
    }

    store.vehicles.push(vehicle);
    await saveStore(store);
    sendJson(res, 201, { vehicle });
    return true;
  }

  if (method === "PUT" && vehicleMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    if (!requireAdmin(context, res)) {
      return true;
    }

    const vehicle = store.vehicles.find((entry) => entry.id === vehicleMatch[1]);
    if (!vehicle) {
      notFound(res, "Vehicle not found.");
      return true;
    }

    const body = await parseBody(req);
    const editableFields = [
      "name",
      "category",
      "city",
      "pricePerDay",
      "securityDeposit",
      "transmission",
      "fuel",
      "seats",
      "mileage",
      "range",
      "featured",
      "status",
      "rating",
      "trips",
      "color",
      "badge",
      "description",
      "features",
      "addOnsAllowed",
    ];

    for (const field of editableFields) {
      if (body[field] !== undefined) {
        vehicle[field] = body[field];
      }
    }

    await saveStore(store);
    sendJson(res, 200, { vehicle });
    return true;
  }

  if (method === "GET" && bookingMatch) {
    const context = requireAuth(store, req, res);
    if (!context) {
      return true;
    }

    const booking = store.bookings.find((entry) => entry.id === bookingMatch[1]);
    if (!booking) {
      notFound(res, "Booking not found.");
      return true;
    }

    if (context.user.role !== "admin" && booking.userId !== context.user.id) {
      sendJson(res, 403, { error: "You do not have access to this booking." });
      return true;
    }

    sendJson(res, 200, { booking: enrichBooking(store, booking) });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const store = await loadStore();

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      });
      res.end();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url, store);
      if (!handled) {
        notFound(res, "API route not found.");
      }
      return;
    }

    await serveStaticFile(req, res, url.pathname);
  } catch (error) {
    if (error.message === "Invalid JSON body") {
      sendJson(res, 400, { error: error.message });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`UrbanRide Rentals is running on http://${HOST}:${PORT}`);
});
