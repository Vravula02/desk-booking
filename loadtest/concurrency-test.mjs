// Concurrent double-booking test.
// Fires N simultaneous POST /bookings for the SAME slot and checks that exactly one succeeds.
// Run against your LOCAL API:  node loadtest/concurrency-test.mjs
// Options (environment variables): BASE_URL, CONCURRENCY, ROUNDS, RESOURCE_NAME, TEST_EMAIL, TEST_PASSWORD

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.TEST_EMAIL || "employee@example.com";
const PASSWORD = process.env.TEST_PASSWORD || "Employee123!";
const CONCURRENCY = Number(process.env.CONCURRENCY || 50);
const ROUNDS = Number(process.env.ROUNDS || 5);
const RESOURCE_NAME = process.env.RESOURCE_NAME || "Desk 2";

if (BASE.includes("azurecontainerapps.io") && process.env.ALLOW_LIVE !== "yes") {
  console.error(
    "Refusing to run against the live API. Set ALLOW_LIVE=yes to override, and keep CONCURRENCY low."
  );
  process.exit(1);
}

async function call(path, options = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function main() {
  const login = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200) throw new Error(`Login failed (${login.status})`);
  const token = login.body.token;

  const resources = await call("/resources", {}, token);
  const resource = resources.body.find((r) => r.name === RESOURCE_NAME);
  if (!resource) throw new Error(`Resource "${RESOURCE_NAME}" not found`);

  console.log(`Target: ${BASE}`);
  console.log(`Resource: ${resource.name}, ${CONCURRENCY} simultaneous requests per round, ${ROUNDS} rounds\n`);

  const createdIds = [];
  const latencies = [];
  let failedRounds = 0;
  let totalRequests = 0;
  let totalCreated = 0;
  let totalConflicts = 0;
  let totalOther = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    // A different future slot each round, so rounds don't interfere with each other
    const start = new Date(Date.now() + (30 + round) * 24 * 3600 * 1000);
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3600 * 1000);

    const startedAt = performance.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (_, i) => {
        const t0 = performance.now();
        const res = await call(
          "/bookings",
          {
            method: "POST",
            body: JSON.stringify({
              resourceId: resource.id,
              title: `LOAD-${round}-${i}`,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
            }),
          },
          token
        );
        return { status: res.status, ms: performance.now() - t0, id: res.body && res.body.id };
      })
    );
    const elapsed = performance.now() - startedAt;

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const other = results.filter((r) => r.status !== 201 && r.status !== 409);

    created.forEach((r) => r.id && createdIds.push(r.id));
    results.forEach((r) => latencies.push(r.ms));

    totalRequests += results.length;
    totalCreated += created.length;
    totalConflicts += conflicts.length;
    totalOther += other.length;

    const ok = created.length === 1 && other.length === 0;
    if (!ok) failedRounds++;

    console.log(
      `Round ${round}: ${created.length} created, ${conflicts.length} conflicts (409), ` +
        `${other.length} other, ${elapsed.toFixed(0)} ms total  ${ok ? "PASS" : "FAIL"}`
    );
    if (other.length > 0) {
      const codes = [...new Set(other.map((r) => r.status))].join(", ");
      console.log(`  Unexpected status codes: ${codes}`);
    }
  }

  // Clean up: cancel every booking the test created
  for (const id of createdIds) {
    await call(`/bookings/${id}/cancel`, { method: "POST" }, token);
  }

  const sorted = latencies.sort((a, b) => a - b);
  console.log("\nSummary");
  console.log(`  Requests sent:        ${totalRequests}`);
  console.log(`  Bookings created:     ${totalCreated} (expected ${ROUNDS})`);
  console.log(`  Conflicts (409):      ${totalConflicts}`);
  console.log(`  Unexpected statuses:  ${totalOther}`);
  console.log(
    `  Latency p50 / p95 / p99: ${percentile(sorted, 50).toFixed(0)} / ${percentile(sorted, 95).toFixed(0)} / ${percentile(sorted, 99).toFixed(0)} ms`
  );
  console.log(`  Rounds passed:        ${ROUNDS - failedRounds} of ${ROUNDS}`);
  console.log(`  Test bookings cancelled: ${createdIds.length}`);

  process.exit(failedRounds === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});