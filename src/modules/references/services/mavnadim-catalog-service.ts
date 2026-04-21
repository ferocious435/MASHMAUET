import { readdir } from "node:fs/promises";
import path from "node:path";

import type {
  MavnadimCatalogItem,
  MavnadimCatalogSummary,
} from "../domain/mavnadim-schemas.ts";

export class MavnadimCatalogService {
  private readonly directoryPath: string;

  public constructor(options?: { directoryPath?: string }) {
    this.directoryPath =
      options?.directoryPath ?? path.join(process.cwd(), "HOMER", "MAVNADIM");
  }

  public async getCatalogSummary(): Promise<MavnadimCatalogSummary> {
    try {
      const entries = await readdir(this.directoryPath, { withFileTypes: true });
      const sourceImagesCount = entries.filter(
        (entry) =>
          entry.isFile() &&
          [".jpg", ".jpeg", ".png"].includes(path.extname(entry.name).toLowerCase()),
      ).length;

      return {
        exists: true,
        directoryPath: this.directoryPath,
        sourceImagesCount,
        itemsCount: mavnadimCatalogItems.length,
        error: null,
      };
    } catch (error) {
      return {
        exists: mavnadimCatalogItems.length > 0,
        directoryPath: this.directoryPath,
        sourceImagesCount: 0,
        itemsCount: mavnadimCatalogItems.length,
        error:
          error instanceof Error
            ? error.message
            : "Unknown MAVNADIM catalog error.",
      };
    }
  }

  public async getCatalogPreview(limit = 5): Promise<MavnadimCatalogItem[]> {
    return mavnadimCatalogItems.slice(0, limit);
  }

  public async getAllCatalogItems(): Promise<MavnadimCatalogItem[]> {
    return [...mavnadimCatalogItems];
  }

  public async findById(catalogItemId: string): Promise<MavnadimCatalogItem | null> {
    return (
      mavnadimCatalogItems.find((item) => item.catalogItemId === catalogItemId) ??
      null
    );
  }
}

const mavnadimCatalogItems: MavnadimCatalogItem[] = [
  {
    catalogItemId: "mavnadim-residential-single-room-3x6",
    displayName: 'מבנ"ד 3/6 - מגורים חד חדר',
    shortLabel: "מגורים חד חדר",
    dimensionsLabel: "3/6",
    category: "residential",
    basePrice: 80000,
    sourceImageName: "IMG20260413142012.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      'עבודות חשמל ומיזו"א',
    ],
    optionalAddons: [
      { label: "ריצוף אריחי קרמיקה", price: 5100 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: [],
    tags: ["מבנה", "מגורים", "חדר", "מודולרי"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-residential-double-room-3x6",
    displayName: 'מבנ"ד 3/6 - מגורים דו חדר',
    shortLabel: "מגורים דו חדר",
    dimensionsLabel: "3/6",
    category: "residential",
    basePrice: 85000,
    sourceImageName: "IMG20260413142017.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      'עבודות חשמל ומיזו"א',
    ],
    optionalAddons: [
      { label: "ריצוף אריחי קרמיקה", price: 5400 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: [],
    tags: ["מבנה", "מגורים", "דו חדר", "מודולרי"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-residential-map-3x6",
    displayName: 'מבנד3\\6 - מגורים מ"פ',
    shortLabel: 'מגורים מ"פ',
    dimensionsLabel: "3/6",
    category: "residential",
    basePrice: 120000,
    sourceImageName: "IMG20260413142019.jpg",
    includedFeatures: [
      "רצפת בטון",
      "ריצוף אריחים",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "הנמכת תקרה",
      "מענה למים חמים",
      "חיפוי קרמיקה במתחם הרטוב",
      "כלים סניטריים",
      'עבודות חשמל ומיזו"א',
    ],
    optionalAddons: [],
    possibleUses: [],
    tags: ["מבנה", "מגורים", 'מ"פ', "מקלחת", "רטוב", "מודולרי"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-office-single-room-3x6",
    displayName: 'מבנ"ד 3/6 - משרדים חד חדר',
    shortLabel: "משרד חד חדר",
    dimensionsLabel: "3/6",
    category: "service",
    basePrice: 80000,
    sourceImageName: "IMG20260413142024.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      'עבודות חשמל ומיזו"א',
    ],
    optionalAddons: [
      { label: "ריצוף אריחי קרמיקה", price: 5100 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: ["משרד", "עמדת שירות"],
    tags: ["מבנה", "משרד", "שירות", "חד חדר"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-sanitation-double-cell-2x3",
    displayName: 'מבנד2\\3 שו"מ דו תאי \\מקלחת דו תאי\\ שירותים דו תאי',
    shortLabel: 'שו"מ דו תאי / מקלחת דו תאי / שירותים דו תאי',
    dimensionsLabel: "2/3",
    category: "sanitation",
    basePrice: 55000,
    sourceImageName: "IMG20260413142030.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "מענה למים חמים",
      "חיפוי קרמיקה במתחם הרטוב",
      "כלים סניטריים",
      "עבודות חשמל",
    ],
    optionalAddons: [
      { label: 'בטוקה ש"ב', price: 30000 },
      { label: "ריצוף אריחי קרמיקה", price: 5400 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: ["שירותים", "מקלחות", "שו\"מ"],
    tags: ["מבנה", "שירותים", "מקלחת", "דו תאי", "רטוב"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-sanitation-six-cell-3x6",
    displayName: 'מבנ"ד 3/6 - שירותים 6 תאים',
    shortLabel: "שירותים 6 תאים",
    dimensionsLabel: "3/6",
    category: "sanitation",
    basePrice: 95000,
    sourceImageName: "IMG20260413142033.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "מענה למים חמים",
      "חיפוי קרמיקה במתחם הרטוב",
      "כלים סניטריים",
      "עבודות חשמל",
    ],
    optionalAddons: [
      { label: "ריצוף אריחי קרמיקה", price: 5400 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: ["שירותים למחנה", "שירותים לאתר"],
    tags: ["מבנה", "שירותים", "6 תאים", "מחנה", "רטוב"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-sanitation-3x6",
    displayName: 'מבנ"ד 3/6 - שירותים',
    shortLabel: "שירותים",
    dimensionsLabel: "3/6",
    category: "sanitation",
    basePrice: 95000,
    sourceImageName: "IMG20260413142036.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "מענה למים חמים",
      "חיפוי קרמיקה במתחם הרטוב",
      "כלים סניטריים",
      "עבודות חשמל",
    ],
    optionalAddons: [
      { label: "ריצוף אריחי קרמיקה", price: 5400 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: ["שירותים", "מתחם סניטרי"],
    tags: ["מבנה", "שירותים", "רטוב", "סניטרי"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-sanitation-12sqm",
    displayName: 'מבנ"ד 12 מ"ר - שירותים',
    shortLabel: 'שירותים 12 מ"ר',
    dimensionsLabel: '12 מ"ר',
    category: "sanitation",
    basePrice: 80000,
    sourceImageName: "IMG20260413142039.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "מענה למים חמים",
      "חיפוי קרמיקה במתחם הרטוב",
      "כלים סניטריים",
      "עבודות חשמל",
    ],
    optionalAddons: [
      { label: "ריצוף אריחי קרמיקה", price: 3600 },
      { label: "הנמכת תקרה", price: 4500 },
    ],
    possibleUses: ["שירותים", "שירותי אתר"],
    tags: ["מבנה", "שירותים", '12 מ"ר', "רטוב"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-club-3x6",
    displayName: 'מבנ"ד 3/6 - מועדון',
    shortLabel: "מועדון",
    dimensionsLabel: "3/6",
    category: "club",
    basePrice: 130000,
    sourceImageName: "IMG20260413142042.jpg",
    includedFeatures: [
      "רצפת בטון",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "עבודות חשמל",
      'מיזו"א',
      "מטבחון יבש",
      "גמרי ברמה נאותה",
    ],
    optionalAddons: [],
    possibleUses: ["מועדון", "חלל התכנסות", "חדר פעילות"],
    tags: ["מבנה", "מועדון", "חלל ציבורי", "מטבחון"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-hotel-3x7",
    displayName: 'מבנ"ד 3/7 - בית מלון',
    shortLabel: "בית מלון",
    dimensionsLabel: "3/7",
    category: "hotel",
    basePrice: 200000,
    sourceImageName: "IMG20260413142044.jpg",
    includedFeatures: [
      "רצפת בטון",
      "ריצוף אריחים",
      'חיפוי פאנל מבודד כפול (50 מ"מ)',
      "הנמכת תקרה",
      "מענה למים חמים",
      "חיפוי קרמיקה במתחם הרטוב",
      "כלים סניטריים",
      "מטבחון",
      "עבודות חשמל",
    ],
    optionalAddons: [],
    possibleUses: ["אירוח", "לינה"],
    tags: ["מבנה", "אירוח", "מלון", "חדר רחצה", "מטבחון"],
    notes: [],
  },
  {
    catalogItemId: "mavnadim-cafe-container",
    displayName: "מכולת בית קפה",
    shortLabel: "מכולת בית קפה",
    dimensionsLabel: "קונטיינר",
    category: "commercial",
    basePrice: 80000,
    sourceImageName: "IMG20260413142047.jpg",
    includedFeatures: [
      "רצפת פח מרוג",
      "דיגום מכולה",
      "דלפק",
      "עבודות חשמל ואינסטלציה",
      "חלונות",
      "כיסאות בר",
    ],
    optionalAddons: [
      { label: "סט ריהוט גן (שולחן + 4 כיסאות)", price: 5000 },
    ],
    possibleUses: ["בית קפה", "קיוסק", "מזנון"],
    tags: ["מכולה", "בית קפה", "קיוסק", "מסחרי", "מזנון"],
    notes: ["ללא מכון מטבחי"],
  },
  {
    catalogItemId: "mavnadim-modular-6x6",
    displayName: "מבנה מודולרי 6/6",
    shortLabel: "מבנה מודולרי 6/6",
    dimensionsLabel: "6/6",
    category: "modular",
    basePrice: 250000,
    sourceImageName: "IMG20260413142051.jpg",
    includedFeatures: [
      "ריצוף",
      "חיפוי פאנל חיצוני",
      "חיפוי גבס פנימי",
      "עבודות חשמל",
      "תקרה אקוסטית ומיזו\"א",
    ],
    optionalAddons: [],
    possibleUses: ["בית כנסת", "מועדון גדול", "חד\"ל", "לשכת מפקד"],
    tags: ["מבנה", "מודולרי", "6/6", "חלל גדול"],
    notes: [],
  },
];
