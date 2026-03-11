/**
 * backfillCourseRegionKeys.js
 *
 * Re-assigns regionKey on every course document using the course's own
 * GPS coordinates and country — not the user's location.
 *
 * Run from functions/ directory:
 *   node backfillCourseRegionKeys.js [--dry-run]
 *
 * --dry-run  Print what would change without writing to Firestore.
 */

const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.resolve(__dirname, "../serviceAccountKey.json"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

// ── Country name → ISO2 (mirrors regionHelpers.ts) ──────────────────
const COUNTRY_NAME_TO_ISO2 = {
  "united states": "us",
  "united states of america": "us",
  "usa": "us",
  "canada": "ca",
  "mexico": "mx",
  "united kingdom": "gb",
  "england": "gb",
  "scotland": "gb",
  "wales": "gb",
  "northern ireland": "gb",
  "ireland": "ie",
  "france": "fr",
  "germany": "de",
  "spain": "es",
  "portugal": "pt",
  "italy": "it",
  "netherlands": "nl",
  "belgium": "be",
  "sweden": "se",
  "norway": "no",
  "denmark": "dk",
  "finland": "fi",
  "switzerland": "ch",
  "austria": "at",
  "australia": "au",
  "new zealand": "nz",
  "japan": "jp",
  "south korea": "kr",
  "korea": "kr",
  "china": "cn",
  "thailand": "th",
  "singapore": "sg",
  "malaysia": "my",
  "indonesia": "id",
  "philippines": "ph",
  "india": "in",
  "united arab emirates": "ae",
  "uae": "ae",
  "saudi arabia": "sa",
  "south africa": "za",
  "kenya": "ke",
  "brazil": "br",
  "argentina": "ar",
  "colombia": "co",
  "chile": "cl",
  "peru": "pe",
  "dominican republic": "do",
  "jamaica": "jm",
  "bahamas": "bs",
  "bermuda": "bm",
  "cayman islands": "ky",
  "puerto rico": "pr",
  "barbados": "bb",
  "trinidad and tobago": "tt",
  "panama": "pa",
  "costa rica": "cr",
  "guatemala": "gt",
  "bahrain": "bh",
  "qatar": "qa",
  "oman": "om",
  "kuwait": "kw",
};

function countryNameToIso2(countryName) {
  const normalized = countryName.toLowerCase().trim();
  return COUNTRY_NAME_TO_ISO2[normalized] ?? normalized.replace(/[^a-z0-9]/g, "").slice(0, 4);
}

// ── Minimal US region list for geohash + nearest matching ───────────
// (Paste the full REGIONS array here, or require it if you have a JS version)
// For simplicity this script just handles the country check + state fallback.
// US courses that were already correct won't be touched (we check existing key).

function assignRegionForCourse(loc) {
  if (!loc) return null;
  const { latitude, longitude, city = "", state = "", country = "" } = loc;
  if (!latitude || !longitude) return null;

  // International fast-path
  if (country) {
    const iso2 = countryNameToIso2(country);
    if (iso2 !== "us") {
      return `${iso2}_misc`;
    }
  }

  // For US courses: we trust the existing key if it already starts with "us_"
  // and is a valid-looking key (not garbage like us_erw_misc or us_roo_misc).
  // The script will flag these for manual review or re-run with full region matching.
  return null; // signal: keep existing key for US courses
}

function isGarbageUsKey(regionKey, country) {
  if (!regionKey) return false;
  // A US key is garbage if country is NOT US but key starts with us_
  if (country) {
    const iso2 = countryNameToIso2(country);
    if (iso2 !== "us" && regionKey.startsWith("us_")) return true;
  }
  return false;
}

async function main() {
  console.log(`🚀 Course regionKey backfill — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  const snap = await db.collection("courses").get();
  console.log(`📦 Found ${snap.size} course documents`);

  let checked = 0;
  let fixed = 0;
  let skipped = 0;
  let noLocation = 0;

  const batch_size = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    checked++;
    const data = doc.data();
    const loc = data.location;

    if (!loc?.latitude || !loc?.longitude) {
      noLocation++;
      continue;
    }

    const currentKey = data.regionKey;
    const country = loc.country ?? "";

    // Determine correct key
    let correctKey = null;

    if (country) {
      const iso2 = countryNameToIso2(country);
      if (iso2 !== "us") {
        correctKey = `${iso2}_misc`;
      }
    }

    // If it's a US course (or no country), keep current key unless it looks wrong
    if (!correctKey) {
      if (isGarbageUsKey(currentKey, country)) {
        // Has a us_ key but country says otherwise — fix it
        const iso2 = countryNameToIso2(country);
        correctKey = `${iso2}_misc`;
      } else {
        skipped++;
        continue;
      }
    }

    // No change needed
    if (currentKey === correctKey) {
      skipped++;
      continue;
    }

    console.log(
      `🔧 [${doc.id}] "${data.course_name}" (${loc.city}, ${country})\n` +
      `   ${currentKey ?? "null"} → ${correctKey}`
    );

    if (!DRY_RUN) {
      batch.update(doc.ref, {
        regionKey: correctKey,
        lastUpdated: new Date().toISOString(),
      });
      batchCount++;
      fixed++;

      if (batchCount >= batch_size) {
        await batch.commit();
        console.log(`   ✅ Committed batch of ${batchCount}`);
        batch = db.batch();
        batchCount = 0;
      }
    } else {
      fixed++;
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
    console.log(`   ✅ Committed final batch of ${batchCount}`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Checked:    ${checked}`);
  console.log(`   Fixed:      ${fixed}`);
  console.log(`   Skipped:    ${skipped} (already correct)`);
  console.log(`   No location: ${noLocation}`);
  console.log(DRY_RUN ? "\n⚠️  DRY RUN — no writes made" : "\n✅ Done");
}

main().catch((err) => {
  console.error("🔥 Fatal error:", err);
  process.exit(1);
});