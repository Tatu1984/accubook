/**
 * HSN / SAC code library for Indian GST.
 *
 * HSN (Harmonized System Nomenclature) codes classify goods.
 * SAC (Service Accounting Code) codes classify services.
 *
 * Both are mandatory on tax invoices for GST-registered businesses
 * (HSN turnover thresholds: 4-digit ≥ ₹5cr, 6-digit < ₹5cr).
 *
 * The official GSTN list has ~17,000 entries; we ship a curated subset
 * of the most commonly used ones across SMB segments. Customers can
 * extend by configuring tax-config + item-specific HSN codes.
 *
 * Default rate is the standard GST rate as of FY 2025-26 — verify before
 * any prod-tax-filing usage; the GST Council periodically revises rates.
 */

export type HsnEntry = {
  code: string;
  description: string;
  /** Standard GST rate as of FY 2025-26. Caller can override per-item. */
  defaultGstRate: number;
  /** Whether this is HSN (goods) or SAC (services). */
  type: "HSN" | "SAC";
};

/**
 * Static seed data. Hand-picked from common B2B SMB invoice categories.
 * Sources: CBIC HSN/SAC schedule + Bharat Nirvana GST rate finder.
 *
 * Not exhaustive — designed to cover the most-frequently-typed codes so
 * the auto-complete UI feels useful from day one.
 */
export const HSN_LIBRARY: ReadonlyArray<HsnEntry> = [
  // -------- IT / Electronics (Chapter 84-85) --------
  { code: "8471", description: "Automatic data processing machines (computers, laptops)", defaultGstRate: 18, type: "HSN" },
  { code: "8473", description: "Parts and accessories for computers", defaultGstRate: 18, type: "HSN" },
  { code: "8523", description: "Optical and magnetic media, recorded / unrecorded", defaultGstRate: 18, type: "HSN" },
  { code: "8528", description: "Monitors and projectors, TV reception apparatus", defaultGstRate: 18, type: "HSN" },
  { code: "8517", description: "Telephone sets, smartphones, networking equipment", defaultGstRate: 18, type: "HSN" },
  { code: "8504", description: "Electrical transformers, static converters, UPS", defaultGstRate: 18, type: "HSN" },
  { code: "8544", description: "Insulated wires, cables, fibre optic cables", defaultGstRate: 18, type: "HSN" },

  // -------- Office furniture & supplies --------
  { code: "9401", description: "Seats (other than barber/dental), and parts thereof", defaultGstRate: 18, type: "HSN" },
  { code: "9403", description: "Other furniture (office, kitchen, etc.) and parts", defaultGstRate: 18, type: "HSN" },
  { code: "4820", description: "Notebooks, registers, account books, paper stationery", defaultGstRate: 18, type: "HSN" },
  { code: "4823", description: "Other paper, cut to size or shape", defaultGstRate: 18, type: "HSN" },
  { code: "9608", description: "Pens, pencils, marker pens", defaultGstRate: 12, type: "HSN" },

  // -------- Textiles / Apparel --------
  { code: "5208", description: "Woven cotton fabrics", defaultGstRate: 5, type: "HSN" },
  { code: "5407", description: "Woven synthetic filament fabrics", defaultGstRate: 5, type: "HSN" },
  { code: "6109", description: "T-shirts, singlets, vests, knitted/crocheted", defaultGstRate: 12, type: "HSN" },
  { code: "6203", description: "Men's suits, jackets, trousers (woven)", defaultGstRate: 12, type: "HSN" },
  { code: "6204", description: "Women's suits, dresses, skirts (woven)", defaultGstRate: 12, type: "HSN" },

  // -------- Food / Agriculture --------
  { code: "1001", description: "Wheat and meslin", defaultGstRate: 0, type: "HSN" },
  { code: "1006", description: "Rice", defaultGstRate: 0, type: "HSN" },
  { code: "0401", description: "Milk and cream, not concentrated", defaultGstRate: 0, type: "HSN" },
  { code: "1701", description: "Cane or beet sugar", defaultGstRate: 5, type: "HSN" },
  { code: "1905", description: "Bread, biscuits, cakes, pastry", defaultGstRate: 18, type: "HSN" },
  { code: "0902", description: "Tea, whether or not flavoured", defaultGstRate: 5, type: "HSN" },
  { code: "0901", description: "Coffee, whether or not roasted", defaultGstRate: 5, type: "HSN" },

  // -------- Industrial / Construction --------
  { code: "7214", description: "Other bars and rods of iron / non-alloy steel", defaultGstRate: 18, type: "HSN" },
  { code: "7308", description: "Structures and parts (bridges, towers, doors) of iron/steel", defaultGstRate: 18, type: "HSN" },
  { code: "2523", description: "Portland cement, aluminous cement, slag cement", defaultGstRate: 28, type: "HSN" },
  { code: "8429", description: "Self-propelled bulldozers, excavators, loaders", defaultGstRate: 18, type: "HSN" },

  // -------- Pharmaceuticals --------
  { code: "3003", description: "Medicaments (mixed or unmixed) for therapeutic use", defaultGstRate: 12, type: "HSN" },
  { code: "3004", description: "Medicaments in measured doses for retail sale", defaultGstRate: 12, type: "HSN" },

  // -------- Chemicals / Plastics --------
  { code: "3923", description: "Articles for conveyance / packing of goods, of plastics", defaultGstRate: 18, type: "HSN" },
  { code: "3926", description: "Other articles of plastics", defaultGstRate: 18, type: "HSN" },

  // -------- Vehicles / Transport --------
  { code: "8703", description: "Motor cars and other motor vehicles for transport of persons", defaultGstRate: 28, type: "HSN" },
  { code: "8711", description: "Motorcycles, mopeds, side-cars", defaultGstRate: 28, type: "HSN" },
  { code: "8712", description: "Bicycles and other cycles, not motorised", defaultGstRate: 12, type: "HSN" },

  // ====================== SAC (services) ======================
  { code: "9954", description: "Construction services", defaultGstRate: 18, type: "SAC" },
  { code: "9961", description: "Services in wholesale trade", defaultGstRate: 18, type: "SAC" },
  { code: "9962", description: "Services in retail trade", defaultGstRate: 18, type: "SAC" },
  { code: "9963", description: "Accommodation, food and beverage services", defaultGstRate: 18, type: "SAC" },
  { code: "9964", description: "Passenger transport services", defaultGstRate: 5, type: "SAC" },
  { code: "9965", description: "Goods transport services (road, rail, sea, air)", defaultGstRate: 5, type: "SAC" },
  { code: "9966", description: "Rental services of transport vehicles", defaultGstRate: 18, type: "SAC" },
  { code: "9971", description: "Financial and related services", defaultGstRate: 18, type: "SAC" },
  { code: "9972", description: "Real estate services", defaultGstRate: 18, type: "SAC" },
  { code: "9973", description: "Leasing or rental services without operator", defaultGstRate: 18, type: "SAC" },
  { code: "9982", description: "Legal and accounting services", defaultGstRate: 18, type: "SAC" },
  { code: "9983", description: "Other professional, technical and business services", defaultGstRate: 18, type: "SAC" },
  { code: "9984", description: "Telecommunication, broadcasting, information supply services", defaultGstRate: 18, type: "SAC" },
  { code: "9985", description: "Support services", defaultGstRate: 18, type: "SAC" },
  { code: "9986", description: "Support services to agriculture, forestry, fishing", defaultGstRate: 0, type: "SAC" },
  { code: "9987", description: "Maintenance, repair and installation services (except construction)", defaultGstRate: 18, type: "SAC" },
  { code: "9988", description: "Manufacturing services on physical inputs owned by others", defaultGstRate: 18, type: "SAC" },
  { code: "9991", description: "Public administration services", defaultGstRate: 18, type: "SAC" },
  { code: "9992", description: "Education services", defaultGstRate: 0, type: "SAC" },
  { code: "9993", description: "Human health and social care services", defaultGstRate: 0, type: "SAC" },
  { code: "9996", description: "Recreational, cultural and sporting services", defaultGstRate: 18, type: "SAC" },
];

const HSN_BY_CODE = new Map(HSN_LIBRARY.map((e) => [e.code, e]));

/**
 * Look up an HSN/SAC entry by exact code.
 * Returns null if not in the curated library.
 */
export function lookupHsn(code: string): HsnEntry | null {
  if (!code) return null;
  return HSN_BY_CODE.get(code.trim()) ?? null;
}

/**
 * Search the library by code prefix and/or description substring.
 * Used by the item-master / line-item HSN auto-complete UI.
 */
export function searchHsn(
  query: string,
  opts?: { type?: "HSN" | "SAC"; limit?: number }
): HsnEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = opts?.limit ?? 20;
  const results: HsnEntry[] = [];
  for (const e of HSN_LIBRARY) {
    if (opts?.type && e.type !== opts.type) continue;
    if (e.code.toLowerCase().startsWith(q) || e.description.toLowerCase().includes(q)) {
      results.push(e);
      if (results.length >= limit) break;
    }
  }
  // Code-prefix matches sort before description matches.
  return results.sort((a, b) => {
    const aPrefix = a.code.toLowerCase().startsWith(q) ? 0 : 1;
    const bPrefix = b.code.toLowerCase().startsWith(q) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.code.localeCompare(b.code);
  });
}
