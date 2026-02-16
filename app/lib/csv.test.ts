import { describe, expect, it } from "vitest";
import { mapCSVToApplicationData, parseCSV } from "./csv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(id: string, name: string) {
  return { id, file: { name } };
}

// ---------------------------------------------------------------------------
// parseCSV
// ---------------------------------------------------------------------------

describe("parseCSV", () => {
  it("parses basic CSV", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    expect(parseCSV(csv)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'name,address\n"Acme, Inc.","123 Main St, Suite 4"';
    expect(parseCSV(csv)).toEqual([
      ["name", "address"],
      ["Acme, Inc.", "123 Main St, Suite 4"],
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = 'name\n"He said ""hello"""';
    expect(parseCSV(csv)).toEqual([["name"], ['He said "hello"']]);
  });

  it("trims whitespace from fields", () => {
    const csv = "  a , b ,c \n 1 , 2 , 3 ";
    expect(parseCSV(csv)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles \\r\\n line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    expect(parseCSV(csv)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("skips empty lines", () => {
    const csv = "a,b\n\n1,2\n\n";
    expect(parseCSV(csv)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles mixed quoted and unquoted fields", () => {
    const csv = 'name,value\nfoo,"bar, baz"\nqux,quux';
    expect(parseCSV(csv)).toEqual([
      ["name", "value"],
      ["foo", "bar, baz"],
      ["qux", "quux"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// mapCSVToApplicationData — column mapping
// ---------------------------------------------------------------------------

describe("mapCSVToApplicationData", () => {
  const files = [
    makeFile("f1", "label1.jpg"),
    makeFile("f2", "label2.png"),
    makeFile("f3", "label3.webp"),
  ];

  it("maps exact camelCase headers", () => {
    const rows = parseCSV("fileName,brandName,alcoholContent\nlabel1.jpg,Acme Beer,5%");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({
      brandName: "Acme Beer",
      alcoholContent: "5%",
    });
  });

  it("maps alias headers case-insensitively", () => {
    const rows = parseCSV("File,Brand,ABV,Volume\nlabel1.jpg,Acme Beer,5%,12oz");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({
      brandName: "Acme Beer",
      alcoholContent: "5%",
      netContents: "12oz",
    });
  });

  it("maps all supported aliases", () => {
    const rows = parseCSV(
      "image,brand name,class/type,alcohol content,net contents,producer name,producer address,country of origin,government warning,beverage type\n" +
        "label1.jpg,Brand,Wine,14%,750ml,Producer,Address,USA,Warning text,wine",
    );
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({
      brandName: "Brand",
      classType: "Wine",
      alcoholContent: "14%",
      netContents: "750ml",
      producerName: "Producer",
      producerAddress: "Address",
      countryOfOrigin: "USA",
      governmentWarning: "Warning text",
      beverageType: "wine",
    });
  });

  // ---------------------------------------------------------------------------
  // File matching
  // ---------------------------------------------------------------------------

  it("matches filenames case-insensitively", () => {
    const rows = parseCSV("fileName,brand\nLABEL1.JPG,Acme Beer");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({ brandName: "Acme Beer" });
  });

  it("matches CSV row without extension to file with extension", () => {
    const rows = parseCSV("fileName,brand\nlabel1,Acme Beer");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({ brandName: "Acme Beer" });
  });

  it("matches CSV row with extension to file name without extension", () => {
    const filesNoExt = [makeFile("f1", "label1")];
    const rows = parseCSV("fileName,brand\nlabel1.jpg,Acme Beer");
    const result = mapCSVToApplicationData(rows, filesNoExt);
    expect(result.data.f1).toEqual({ brandName: "Acme Beer" });
  });

  it("maps multiple rows to different files", () => {
    const rows = parseCSV(
      "fileName,brand\nlabel1.jpg,Brand1\nlabel2.png,Brand2\nlabel3.webp,Brand3",
    );
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({ brandName: "Brand1" });
    expect(result.data.f2).toEqual({ brandName: "Brand2" });
    expect(result.data.f3).toEqual({ brandName: "Brand3" });
    expect(result.warnings).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Warnings and errors
  // ---------------------------------------------------------------------------

  it("warns about unmatched CSV rows", () => {
    const rows = parseCSV("fileName,brand\nlabel1.jpg,Brand1\nunknown.jpg,Brand2");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('no matching file for "unknown.jpg"'),
    );
  });

  it("warns about files without CSV data", () => {
    const rows = parseCSV("fileName,brand\nlabel1.jpg,Brand1");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('No CSV data for file "label2.png"'),
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining('No CSV data for file "label3.webp"'),
    );
  });

  it("errors when no fileName column is found", () => {
    const rows = parseCSV("brand,abv\nAcme Beer,5%");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data).toEqual({});
    expect(result.warnings).toContainEqual(
      expect.stringContaining('CSV must have a "fileName" column'),
    );
  });

  it("warns about rows with missing fileName", () => {
    const rows = parseCSV("fileName,brand\n,Brand1");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.warnings).toContainEqual(expect.stringContaining("missing fileName"));
  });

  it("returns warning for empty CSV", () => {
    const rows = parseCSV("");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.warnings).toContainEqual(expect.stringContaining("empty or has no data rows"));
  });

  it("skips empty field values", () => {
    const rows = parseCSV("fileName,brand,abv\nlabel1.jpg,,5%");
    const result = mapCSVToApplicationData(rows, files);
    expect(result.data.f1).toEqual({ alcoholContent: "5%" });
    expect(result.data.f1).not.toHaveProperty("brandName");
  });
});
