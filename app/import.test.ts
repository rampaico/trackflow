/**
 * import.test.ts — Unit tests for CSV import column mapping
 */
import { describe, it, expect } from "vitest";
import { detectColumnMapping, mapCsvRows } from "./import.server";

describe("detectColumnMapping", () => {
  it("detects standard column names", () => {
    const headers = ["Order Number", "Tracking Number", "Carrier"];
    const mapping = detectColumnMapping(headers);
    expect(mapping.orderColumn).toBe("Order Number");
    expect(mapping.trackingColumn).toBe("Tracking Number");
    expect(mapping.carrierColumn).toBe("Carrier");
  });

  it("detects abbreviated column names", () => {
    const headers = ["Order #", "Tracking #"];
    const mapping = detectColumnMapping(headers);
    expect(mapping.orderColumn).toBe("Order #");
    expect(mapping.trackingColumn).toBe("Tracking #");
  });

  it("detects snake_case column names", () => {
    const headers = ["order_name", "tracking_number", "shipping_carrier"];
    const mapping = detectColumnMapping(headers);
    expect(mapping.orderColumn).toBe("order_name");
    expect(mapping.trackingColumn).toBe("tracking_number");
    expect(mapping.carrierColumn).toBe("shipping_carrier");
  });

  it("detects case-insensitive column names", () => {
    const headers = ["ORDER", "TRACKING", "COURIER"];
    const mapping = detectColumnMapping(headers);
    expect(mapping.orderColumn).toBe("ORDER");
    expect(mapping.trackingColumn).toBe("TRACKING");
    expect(mapping.carrierColumn).toBe("COURIER");
  });

  it("returns undefined for missing columns", () => {
    const headers = ["product_id", "quantity", "price"];
    const mapping = detectColumnMapping(headers);
    expect(mapping.orderColumn).toBeUndefined();
    expect(mapping.trackingColumn).toBeUndefined();
    expect(mapping.carrierColumn).toBeUndefined();
  });
});

describe("mapCsvRows", () => {
  const mapping = {
    orderColumn: "Order",
    trackingColumn: "Tracking",
    carrierColumn: "Carrier",
  };

  it("maps rows correctly", () => {
    const rows = [
      { Order: "1001", Tracking: "1Z999AA10123456784", Carrier: "UPS" },
      { Order: "1002", Tracking: "9400111899223397889846", Carrier: "USPS" },
    ];

    const mapped = mapCsvRows(rows, mapping);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].orderName).toBe("#1001");
    expect(mapped[0].trackingNumber).toBe("1Z999AA10123456784");
    expect(mapped[0].carrier).toBe("ups");
    expect(mapped[1].orderName).toBe("#1002");
  });

  it("normalizes order names to include # prefix", () => {
    const rows = [
      { Order: "1001", Tracking: "1Z999AA10123456784", Carrier: "UPS" },
      { Order: "#1002", Tracking: "9400111899223397889846", Carrier: "USPS" },
    ];
    const mapped = mapCsvRows(rows, mapping);
    expect(mapped[0].orderName).toBe("#1001");
    expect(mapped[1].orderName).toBe("#1002");
  });

  it("filters out rows with missing order or tracking", () => {
    const rows = [
      { Order: "", Tracking: "1Z999AA10123456784", Carrier: "UPS" },
      { Order: "1001", Tracking: "", Carrier: "UPS" },
      { Order: "1002", Tracking: "9400111899223397889846", Carrier: "USPS" },
    ];
    const mapped = mapCsvRows(rows, mapping);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].orderName).toBe("#1002");
  });

  it("auto-detects carrier when no carrier column", () => {
    const mappingNoCarrier = {
      orderColumn: "Order",
      trackingColumn: "Tracking",
    };
    const rows = [
      { Order: "1001", Tracking: "1Z999AA10123456784" },
    ];
    const mapped = mapCsvRows(rows, mappingNoCarrier);
    expect(mapped[0].carrier).toBe("ups"); // detected from tracking number
  });

  it("preserves row index", () => {
    const rows = [
      { Order: "1001", Tracking: "1Z999AA10123456784", Carrier: "UPS" },
      { Order: "1002", Tracking: "9400111899223397889846", Carrier: "USPS" },
      { Order: "1003", Tracking: "123456789012", Carrier: "FedEx" },
    ];
    const mapped = mapCsvRows(rows, mapping);
    expect(mapped[0].rowIndex).toBe(0);
    expect(mapped[1].rowIndex).toBe(1);
    expect(mapped[2].rowIndex).toBe(2);
  });
});
