/**
 * carrier.server.ts — TrackFlow carrier detection engine
 *
 * Detects shipping carrier from tracking number patterns.
 * Gianluca's domain: carrier regex + URL templates.
 */

export type CarrierInfo = {
  name: string;
  code: string;
  trackingUrl: string;
};

/**
 * Carrier detection rules ordered by specificity (most specific first).
 * Each rule: pattern regex + carrier metadata.
 */
const CARRIER_RULES: Array<{
  pattern: RegExp;
  carrier: CarrierInfo;
}> = [
  // UPS
  {
    pattern: /^1Z[A-Z0-9]{16}$/i,
    carrier: {
      name: "UPS",
      code: "ups",
      trackingUrl: "https://www.ups.com/track?tracknum={{tracking}}",
    },
  },
  // USPS: 22 digits starting with 9 — must come BEFORE FedEx 22-digit rule
  {
    pattern: /^9[0-9]{21}$/,
    carrier: {
      name: "USPS",
      code: "usps",
      trackingUrl:
        "https://tools.usps.com/go/TrackConfirmAction?tLabels={{tracking}}",
    },
  },
  // FedEx: 12, 15, 20 digits (exclude 22-digit USPS numbers by ordering)
  {
    pattern: /^(\d{12}|\d{15}|\d{20})$/,
    carrier: {
      name: "FedEx",
      code: "fedex",
      trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={{tracking}}",
    },
  },
  // FedEx: 22 digits NOT starting with 9 (USPS 22-digit numbers start with 9)
  {
    pattern: /^[0-8]\d{21}$/,
    carrier: {
      name: "FedEx",
      code: "fedex",
      trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={{tracking}}",
    },
  },
  // USPS: 13-char alphanumeric (international)
  {
    pattern: /^[A-Z]{2}\d{9}US$/i,
    carrier: {
      name: "USPS",
      code: "usps",
      trackingUrl:
        "https://tools.usps.com/go/TrackConfirmAction?tLabels={{tracking}}",
    },
  },
  // DHL Express: 10 digits
  {
    pattern: /^\d{10}$/,
    carrier: {
      name: "DHL Express",
      code: "dhl_express",
      trackingUrl:
        "https://www.dhl.com/en/express/tracking.html?AWB={{tracking}}",
    },
  },
  // DHL eCommerce: starts with GM or 420
  {
    pattern: /^(GM|420)\d+/i,
    carrier: {
      name: "DHL eCommerce",
      code: "dhl_ecommerce",
      trackingUrl:
        "https://ecommerce.dhl.com/tracking.html?tracking-id={{tracking}}",
    },
  },
  // OnTrac: C prefix
  {
    pattern: /^C\d{14}$/i,
    carrier: {
      name: "OnTrac",
      code: "ontrac",
      trackingUrl: "https://www.ontrac.com/trackingres.asp?tracking_number={{tracking}}",
    },
  },
  // LaserShip / LSO
  {
    pattern: /^1LS\d{12}$/i,
    carrier: {
      name: "LaserShip",
      code: "lasership",
      trackingUrl: "https://www.lasership.com/track/{{tracking}}",
    },
  },
  // Canada Post
  {
    pattern: /^\d{16}$|^[A-Z]{2}\d{9}CA$/i,
    carrier: {
      name: "Canada Post",
      code: "canada_post",
      trackingUrl: "https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor={{tracking}}",
    },
  },
  // Royal Mail (UK)
  {
    pattern: /^[A-Z]{2}\d{9}GB$/i,
    carrier: {
      name: "Royal Mail",
      code: "royal_mail",
      trackingUrl: "https://www.royalmail.com/track-your-item#/tracking-results/{{tracking}}",
    },
  },
  // Australia Post
  {
    pattern: /^[A-Z]{2}\d{9}AU$/i,
    carrier: {
      name: "Australia Post",
      code: "australia_post",
      trackingUrl: "https://auspost.com.au/mypost/track/#/search?q={{tracking}}",
    },
  },
  // Amazon Logistics
  {
    pattern: /^TBA\d{12,16}$/i,
    carrier: {
      name: "Amazon Logistics",
      code: "amazon",
      trackingUrl: "https://track.amazon.com/tracking/{{tracking}}",
    },
  },
  // Shopify (custom) — fallback carrier name hint in CSV
];

const UNKNOWN_CARRIER: CarrierInfo = {
  name: "Other",
  code: "other",
  trackingUrl: "",
};

/**
 * Detect carrier from a tracking number string.
 * Returns the most likely carrier, or UNKNOWN if no pattern matches.
 */
export function detectCarrier(trackingNumber: string): CarrierInfo {
  const cleaned = trackingNumber.trim().toUpperCase();

  for (const rule of CARRIER_RULES) {
    if (rule.pattern.test(cleaned)) {
      return {
        ...rule.carrier,
        trackingUrl: rule.carrier.trackingUrl.replace("{{tracking}}", cleaned),
      };
    }
  }

  return UNKNOWN_CARRIER;
}

/**
 * Build a tracking URL for a known carrier code + tracking number.
 */
export function buildTrackingUrl(
  carrierCode: string,
  trackingNumber: string
): string {
  const rule = CARRIER_RULES.find((r) => r.carrier.code === carrierCode);
  if (!rule) return "";
  return rule.carrier.trackingUrl.replace("{{tracking}}", trackingNumber.trim());
}

/**
 * Normalize a carrier name string to a known carrier code.
 * Used when the CSV explicitly provides a carrier column.
 */
export function normalizeCarrierName(input: string): string {
  const lower = input.toLowerCase().trim();

  const aliases: Record<string, string> = {
    ups: "ups",
    "united parcel service": "ups",
    fedex: "fedex",
    "federal express": "fedex",
    usps: "usps",
    "united states postal service": "usps",
    "us postal service": "usps",
    "us mail": "usps",
    dhl: "dhl_express",
    "dhl express": "dhl_express",
    "dhl ecommerce": "dhl_ecommerce",
    ontrac: "ontrac",
    lasership: "lasership",
    amazon: "amazon",
    "amazon logistics": "amazon",
    "canada post": "canada_post",
    "royal mail": "royal_mail",
    "australia post": "australia_post",
  };

  return aliases[lower] ?? "other";
}

/**
 * All supported carriers for dropdown display.
 */
export const SUPPORTED_CARRIERS: CarrierInfo[] = [
  {
    name: "UPS",
    code: "ups",
    trackingUrl: "https://www.ups.com/track?tracknum={{tracking}}",
  },
  {
    name: "FedEx",
    code: "fedex",
    trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={{tracking}}",
  },
  {
    name: "USPS",
    code: "usps",
    trackingUrl:
      "https://tools.usps.com/go/TrackConfirmAction?tLabels={{tracking}}",
  },
  {
    name: "DHL Express",
    code: "dhl_express",
    trackingUrl:
      "https://www.dhl.com/en/express/tracking.html?AWB={{tracking}}",
  },
  {
    name: "DHL eCommerce",
    code: "dhl_ecommerce",
    trackingUrl:
      "https://ecommerce.dhl.com/tracking.html?tracking-id={{tracking}}",
  },
  {
    name: "OnTrac",
    code: "ontrac",
    trackingUrl: "https://www.ontrac.com/trackingres.asp?tracking_number={{tracking}}",
  },
  {
    name: "LaserShip",
    code: "lasership",
    trackingUrl: "https://www.lasership.com/track/{{tracking}}",
  },
  {
    name: "Canada Post",
    code: "canada_post",
    trackingUrl: "https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor={{tracking}}",
  },
  {
    name: "Royal Mail",
    code: "royal_mail",
    trackingUrl: "https://www.royalmail.com/track-your-item#/tracking-results/{{tracking}}",
  },
  {
    name: "Australia Post",
    code: "australia_post",
    trackingUrl: "https://auspost.com.au/mypost/track/#/search?q={{tracking}}",
  },
  {
    name: "Amazon Logistics",
    code: "amazon",
    trackingUrl: "https://track.amazon.com/tracking/{{tracking}}",
  },
  {
    name: "Other",
    code: "other",
    trackingUrl: "",
  },
];
