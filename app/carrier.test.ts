/**
 * carrier.test.ts — Unit tests for carrier detection engine
 * Run with: npx vitest run app/carrier.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  detectCarrier,
  normalizeCarrierName,
  buildTrackingUrl,
} from "./carrier.server";

describe("detectCarrier", () => {
  it("detects UPS tracking numbers", () => {
    expect(detectCarrier("1Z999AA10123456784").name).toBe("UPS");
    expect(detectCarrier("1ZXXXXXXXXXXXXXXXX").name).toBe("UPS"); // 18 chars after 1Z
  });

  it("detects USPS 22-digit tracking numbers", () => {
    expect(detectCarrier("9400111899223397889846").name).toBe("USPS");
    expect(detectCarrier("9261290100130636401687").name).toBe("USPS");
  });

  it("detects USPS international tracking numbers", () => {
    expect(detectCarrier("EA123456789US").name).toBe("USPS");
    expect(detectCarrier("RX987654321US").name).toBe("USPS");
  });

  it("detects FedEx 12-digit tracking numbers", () => {
    expect(detectCarrier("123456789012").name).toBe("FedEx");
  });

  it("detects FedEx 15-digit tracking numbers", () => {
    expect(detectCarrier("123456789012345").name).toBe("FedEx");
  });

  it("detects FedEx 20-digit tracking numbers", () => {
    expect(detectCarrier("12345678901234567890").name).toBe("FedEx");
  });

  it("detects DHL Express 10-digit tracking numbers", () => {
    expect(detectCarrier("1234567890").name).toBe("DHL Express");
  });

  it("detects Amazon Logistics TBA numbers", () => {
    expect(detectCarrier("TBA123456789000").name).toBe("Amazon Logistics");
    expect(detectCarrier("TBA000000000000").name).toBe("Amazon Logistics");
  });

  it("detects Royal Mail (UK) tracking numbers", () => {
    expect(detectCarrier("AA123456789GB").name).toBe("Royal Mail");
  });

  it("detects Australia Post tracking numbers", () => {
    expect(detectCarrier("AA123456789AU").name).toBe("Australia Post");
  });

  it("detects Canada Post tracking numbers", () => {
    expect(detectCarrier("AA123456789CA").name).toBe("Canada Post");
  });

  it("returns Other for unknown tracking numbers", () => {
    expect(detectCarrier("UNKNOWN123").name).toBe("Other");
    expect(detectCarrier("").name).toBe("Other");
    expect(detectCarrier("XYZ").name).toBe("Other");
  });

  it("is case-insensitive", () => {
    expect(detectCarrier("tba123456789000").name).toBe("Amazon Logistics");
    expect(detectCarrier("ea123456789us").name).toBe("USPS");
  });

  it("includes tracking URL in result", () => {
    const result = detectCarrier("9400111899223397889846");
    expect(result.trackingUrl).toContain("9400111899223397889846");
  });
});

describe("normalizeCarrierName", () => {
  it("normalizes UPS aliases", () => {
    expect(normalizeCarrierName("UPS")).toBe("ups");
    expect(normalizeCarrierName("United Parcel Service")).toBe("ups");
    expect(normalizeCarrierName("ups")).toBe("ups");
  });

  it("normalizes FedEx aliases", () => {
    expect(normalizeCarrierName("FedEx")).toBe("fedex");
    expect(normalizeCarrierName("Federal Express")).toBe("fedex");
    expect(normalizeCarrierName("FEDEX")).toBe("fedex");
  });

  it("normalizes USPS aliases", () => {
    expect(normalizeCarrierName("USPS")).toBe("usps");
    expect(normalizeCarrierName("United States Postal Service")).toBe("usps");
    expect(normalizeCarrierName("US Mail")).toBe("usps");
  });

  it("normalizes DHL aliases", () => {
    expect(normalizeCarrierName("DHL")).toBe("dhl_express");
    expect(normalizeCarrierName("DHL Express")).toBe("dhl_express");
    expect(normalizeCarrierName("DHL eCommerce")).toBe("dhl_ecommerce");
  });

  it("returns 'other' for unknown carriers", () => {
    expect(normalizeCarrierName("Pony Express")).toBe("other");
    expect(normalizeCarrierName("")).toBe("other");
  });
});

describe("buildTrackingUrl", () => {
  it("builds UPS tracking URL", () => {
    const url = buildTrackingUrl("ups", "1Z999AA10123456784");
    expect(url).toContain("ups.com");
    expect(url).toContain("1Z999AA10123456784");
  });

  it("builds FedEx tracking URL", () => {
    const url = buildTrackingUrl("fedex", "123456789012");
    expect(url).toContain("fedex.com");
    expect(url).toContain("123456789012");
  });

  it("builds USPS tracking URL", () => {
    const url = buildTrackingUrl("usps", "9400111899223397889846");
    expect(url).toContain("usps.com");
  });

  it("returns empty string for unknown carrier code", () => {
    expect(buildTrackingUrl("pony_express", "123")).toBe("");
  });
});
