// Simulator ESP32 (1 tenant, 2 colokan, satu sensor arus total).
// Berperilaku seperti firmware asli, termasuk pemutusan saat arus melebihi alokasi.
//
//   npm run simulate -- --key bazar-esp32-2026
//   npm run simulate -- --key bazar-esp32-2026 --device ESP32-002 --no-spike
//   npm run simulate -- --url https://nama-project.vercel.app --key RAHASIA
//
// Beban simulasi: colokan 1 ±1,1 A, colokan 2 ±0,6 A (total ±1,7 A = mendekati 2 A).
// Setiap 2 menit, alat tambahan dicolok selama 20 detik (+0,6 A) sehingga total melewati 2 A.

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BASE = opt("url", "http://localhost:3000").replace(/\/$/, "");
const DEVICE_ID = opt("device", "ESP32-001").toUpperCase();
const DEVICE_KEY = opt("key", process.env.DEVICE_KEY || "");
const SPIKES = !args.includes("--no-spike");
const URL = `${BASE}/api/tenants/${DEVICE_ID}/readings`;

const SAMPLE_MS = 500;
let limitA = 2;
let intervalMs = 10_000;
let command = [true, false];
let tripped = false;
let awaitingAck = false;
let overCount = 0;
let tripCurrent = 0;
let last = { v: 12.1, a: 0 };
const started = Date.now();

const relayOn = (i) => command[i] && !tripped;

function sampleLoad() {
  const t = (Date.now() - started) / 1000;
  let a = 0;
  if (relayOn(0)) {
    a += 1.1 + Math.sin(t / 15) * 0.08 + (Math.random() - 0.5) * 0.06;
    if (SPIKES && t % 120 > 100) a += 0.6;   // alat tambahan di colokan 1
  }
  if (relayOn(1)) a += 0.6 + (Math.random() - 0.5) * 0.04;
  return { v: 12.1 - a * 0.05 + (Math.random() - 0.5) * 0.02, a };
}

setInterval(() => {
  last = sampleLoad();
  const anyOn = relayOn(0) || relayOn(1);
  if (anyOn && last.a > limitA) overCount++;
  else overCount = 0;
  if (overCount >= 3 && !tripped) {
    tripped = true;
    awaitingAck = true;
    tripCurrent = last.a;
    console.log(`!! OVER-LIMIT ${last.a.toFixed(2)} A > ${limitA} A, kedua colokan diputus`);
  }
}, SAMPLE_MS);

async function report() {
  const body = {
    voltage: +last.v.toFixed(2),
    current: +last.a.toFixed(3),
    outlet1: relayOn(0) ? "ON" : "OFF",
    outlet2: relayOn(1) ? "ON" : "OFF",
    tripped,
    ...(tripped && { tripCurrent: +tripCurrent.toFixed(3) }),
  };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(DEVICE_KEY && { "X-Device-Key": DEVICE_KEY }) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status !== 201) throw new Error(`${res.status} ${data.error ?? ""}`);

    const cmd = data.command;
    limitA = cmd.limitA;
    intervalMs = cmd.intervalMs;
    const c = [cmd.outlet1 === "ON", cmd.outlet2 === "ON"];
    if (tripped) {
      if (!c[0] && !c[1]) awaitingAck = false;
      else if (!awaitingAck) {
        tripped = false;
        overCount = 0;
        console.log(">> Disambungkan ulang oleh pengelola");
      }
    }
    command = c;
    console.log(`${DEVICE_ID}  ${body.voltage.toFixed(2)} V  ${body.current.toFixed(2)} A  ` +
      `colokan1=${relayOn(0) ? "ON " : "OFF"} colokan2=${relayOn(1) ? "ON " : "OFF"}  alokasi=${limitA} A`);
  } catch (e) {
    console.log(`Gagal kirim: ${e.message}`);
  }
  setTimeout(report, intervalMs);
}

console.log(`Simulator ${DEVICE_ID} -> ${URL} (Ctrl+C untuk berhenti)`);
setTimeout(report, 1000);
