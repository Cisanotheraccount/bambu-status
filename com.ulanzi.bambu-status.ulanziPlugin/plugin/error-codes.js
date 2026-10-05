const ERROR_MESSAGES = Object.freeze({
  "03004000": "Z HOMING FAIL",
  "03004002": "BED LEVEL FAIL",
  "03004009": "XY HOMING FAIL",
  "03004020": "NOZZLE DETECT",
  "0300801A": "EXTRUSION ERROR",
  "03008021": "NOZZLE MISSING",
  "03008042": "DOOR OPEN",
  "05004002": "BAD FILE PATH",
  "05004005": "FIRMWARE BUSY",
  "05004014": "SLICING FAILED",
  "0500401F": "AUTH TIMEOUT",
  "0500402F": "SD CARD BAD",
  "05004033": "AMS FIRMWARE",
  "0500C010": "SD CARD ERROR",
  "07018007": "EXTRUDER JAM",
  "07018012": "AMS MAP FAIL",
  "07028007": "EXTRUDER JAM",
  "07028012": "AMS MAP FAIL",
  "07038012": "AMS MAP FAIL",
  "07058007": "EXTRUDER JAM",
  "07058012": "AMS MAP FAIL",
  "07078007": "EXTRUDER JAM",
  "07FE8005": "AMS UNLOAD FAIL",
  "07FF8005": "AMS UNLOAD FAIL",
  "18058007": "EXTRUDER JAM",
  "18058012": "AMS MAP FAIL"
});

const HMS_MESSAGES = Object.freeze({
  "0300040000020001": "FAN TOO SLOW",
  "0300120000020001": "TOOLHEAD COVER",
  "0500030000010002": "TOOLHEAD FAULT",
  "0500040000010044": "AMS FIRMWARE",
  "0500050000010007": "MQTT VERIFY FAIL"
});

const FAMILY_MESSAGES = Object.freeze({
  "0300": "TOOLHEAD ISSUE",
  "0500": "SYSTEM ISSUE",
  "0501": "NETWORK ISSUE",
  "0700": "AMS FEED ISSUE",
  "07FE": "AMS FEED ISSUE",
  "07FF": "AMS FEED ISSUE",
  "1800": "AMS HT ISSUE",
  "18FE": "AMS HT ISSUE",
  "18FF": "AMS HT ISSUE"
});

const IGNORED_CODES = new Set([
  "05008079",
  "03008054",
  "03004067",
  "0300400C",
  "0500400E",
  "05008030",
  "0500C011",
  "0C008002",
  "05004001",
  "0300800C",
  "03008013",
  "12FF8007",
  "12FFC003"
]);

export function describePrinterErrors(printError, hms = []) {
  const candidates = [
    ...extractPrintErrorCodes(printError),
    ...extractHmsCodes(hms)
  ].filter((item) => item.code && !isIgnoredErrorCode(item.code));

  if (!candidates.length) {
    return {
      hasError: false,
      code: "",
      message: "OK",
      lines: ["OK"]
    };
  }

  const candidate = candidates[0];
  const message = messageForCode(candidate.code, candidate.fullCode);
  return {
    hasError: true,
    code: candidate.fullCode || candidate.code,
    message,
    lines: errorLines(message, candidate.fullCode || candidate.code)
  };
}

export function normalizeErrorCode(value, minLength = 8) {
  if (value === undefined || value === null || value === "" || value === 0 || value === "0") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value).toString(16).toUpperCase().padStart(minLength, "0");
  }

  const raw = String(value).trim().replace(/^HMS[_-]?/i, "").replace(/^0x/i, "");
  if (!raw) return "";

  const compact = raw.replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (!compact) return "";
  if (/^\d+$/.test(compact) && compact.length > 8) {
    const decimal = Number(compact);
    if (Number.isSafeInteger(decimal)) return decimal.toString(16).toUpperCase().padStart(minLength, "0");
  }
  return compact.padStart(minLength, "0");
}

function extractPrintErrorCodes(printError) {
  const code = normalizeErrorCode(printError, 8);
  return code ? [{ code: code.slice(-8), fullCode: code }] : [];
}

function extractHmsCodes(hms) {
  if (!Array.isArray(hms)) return [];
  return hms.flatMap((entry) => {
    if (entry === undefined || entry === null) return [];

    if (typeof entry !== "object") {
      const code = normalizeErrorCode(entry, 8);
      return code ? [{ code: code.slice(0, 8), fullCode: code }] : [];
    }

    const attr = normalizeErrorCode(entry.attr ?? entry.attribute, 8);
    const code = normalizeErrorCode(entry.code ?? entry.error_code, 8);
    if (attr && code) {
      return [{ code: attr.slice(-8), fullCode: `${attr.slice(-8)}${code.slice(-8)}` }];
    }

    const explicit = normalizeErrorCode(entry.ecode ?? entry.hms ?? entry.id ?? entry.code_id ?? entry.error, 8);
    return explicit ? [{ code: explicit.slice(0, 8), fullCode: explicit }] : [];
  });
}

function messageForCode(code, fullCode = "") {
  const exactFull = HMS_MESSAGES[String(fullCode || "").slice(0, 16)];
  if (exactFull) return exactFull;

  const exact = ERROR_MESSAGES[String(code || "").slice(0, 8)];
  if (exact) return exact;

  const family = FAMILY_MESSAGES[String(code || "").slice(0, 4)];
  if (family) return family;

  return "UNKNOWN ERROR";
}

function errorLines(message, code) {
  const parts = String(message || "UNKNOWN ERROR").split(/\s+/).filter(Boolean);
  const codeText = shortCode(code);
  if (parts.length <= 2) return [...parts, codeText].filter(Boolean).slice(0, 3);
  return [`${parts[0]} ${parts[1]}`, parts.slice(2).join(" "), codeText].filter(Boolean).slice(0, 3);
}

function shortCode(code) {
  const value = String(code || "").replace(/[^0-9A-F]/gi, "").toUpperCase();
  if (!value) return "";
  return value.length > 8 ? value.slice(0, 4) + "-" + value.slice(4, 8) : value;
}

function isIgnoredErrorCode(code) {
  const value = String(code || "").slice(0, 8).toUpperCase();
  if (!value || value === "00000000") return true;
  if (IGNORED_CODES.has(value)) return true;
  if (/^0500401[0-9A-F]$/.test(value) && value !== "05004014") return true;
  if (/^0500402[0-9A-CE]$/.test(value)) return true;
  if (/^05014[0-9A-F]{3}$/.test(value)) return true;
  if (/^(07FE|07FF|18FE|18FF)(8006|8007|C006|C009|C00A|C010|C011|C012)$/.test(value)) return true;
  return false;
}
