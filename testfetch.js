/**
 * FETCH v2.0 — endpoint smoke test
 *
 * Usage:
 *   npm install axios
 *   node test-fetch.js
 *
 * Adjust BASE_URL and the endpoint paths below to match your actual
 * routes (check routes/scrape.js and routes/deobfuscate.js or similar).
 */

const axios = require("axios");

const BASE_URL = "https://fetch-liart-gamma.vercel.app";

// ---- Adjust these to match your real route paths ----
const SCRAPE_ENDPOINT = "/api/scrape";
const DEOBFUSCATE_ENDPOINT = "/api/deobfuscate";
// -------------------------------------------------------

const TEST_URL_TO_SCRAPE = "https://example.com";

const TEST_OBFUSCATED_JS = `
var _0x1a2b=['log','Hello\\x20World'];
(function(_0x3c4d,_0x5e6f){
  var _0x7g8h=function(_0x9i0j){
    while(--_0x9i0j){_0x3c4d['push'](_0x3c4d['shift']());}
  };
  _0x7g8h(++_0x5e6f);
})(_0x1a2b,0x1a2);
var _0xabcd=function(_0xef01,_0x2345){
  _0xef01=_0xef01-0x0;
  var _0x6789=_0x1a2b[_0xef01];
  return _0x6789;
};
console[_0xabcd('0x0')](_0xabcd('0x1'));
`.trim();

async function testScraper() {
  console.log("\n=== Testing Scraper ===");
  try {
    const res = await axios.post(
      `${BASE_URL}${SCRAPE_ENDPOINT}`,
      { url: TEST_URL_TO_SCRAPE },
      { timeout: 30000, validateStatus: () => true },
    );
    console.log("Status:", res.status);
    if (res.status >= 200 && res.status < 300) {
      const keys = Object.keys(res.data || {});
      console.log("✅ Scrape succeeded. Response keys:", keys);
      if (res.data.html) console.log("HTML length:", res.data.html.length);
      if (res.data.css) console.log("CSS length:", res.data.css.length);
      if (res.data.js) console.log("JS length:", res.data.js.length);
    } else {
      console.log(
        "❌ Scrape failed. Body:",
        JSON.stringify(res.data).slice(0, 500),
      );
    }
  } catch (err) {
    console.log("❌ Scrape request errored:", err.message);
  }
}

async function testDeobfuscator() {
  console.log("\n=== Testing Deobfuscator ===");
  try {
    const res = await axios.post(
      `${BASE_URL}${DEOBFUSCATE_ENDPOINT}`,
      { code: TEST_OBFUSCATED_JS },
      { timeout: 30000, validateStatus: () => true },
    );
    console.log("Status:", res.status);
    if (res.status >= 200 && res.status < 300) {
      console.log("✅ Deobfuscation succeeded.");
      console.log("Output snippet:", JSON.stringify(res.data).slice(0, 500));
    } else {
      console.log(
        "❌ Deobfuscation failed. Body:",
        JSON.stringify(res.data).slice(0, 500),
      );
    }
  } catch (err) {
    console.log("❌ Deobfuscate request errored:", err.message);
  }
}

async function testHealthCheck() {
  console.log("=== Basic reachability ===");
  try {
    const res = await axios.get(BASE_URL, {
      timeout: 15000,
      validateStatus: () => true,
    });
    console.log("Home page status:", res.status);
  } catch (err) {
    console.log("❌ Could not reach base URL:", err.message);
  }
}

(async () => {
  await testHealthCheck();
  await testScraper();
  await testDeobfuscator();
})();
