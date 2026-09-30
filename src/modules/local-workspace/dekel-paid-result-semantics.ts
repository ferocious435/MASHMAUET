export type PaidResultObject =
  | "waste"
  | "temporary_fence"
  | "permanent_fence"
  | "temporary_signage"
  | "temporary_protection"
  | "access_equipment"
  | "measurement"
  | "door_system"
  | "door_hardware"
  | "door_lock"
  | "door_hinge"
  | "door_handle"
  | "door_closer"
  | "door_panic_hardware"
  | "door_threshold"
  | "window_system"
  | "window_glazing"
  | "opening_closure"
  | "opening_passage"
  | "opening_louvre"
  | "electrical_grounding"
  | "electrical_panel"
  | "electrical_panel_accessory"
  | "electrical_box"
  | "electrical_cable"
  | "electrical_cable_trench"
  | "electrical_containment"
  | "electrical_point"
  | "electrical_fixture"
  | "exit_sign"
  | "electrical_protection"
  | "electrical_testing"
  | "hvac_system"
  | "hvac_outdoor_unit"
  | "hvac_indoor_unit"
  | "hvac_equipment"
  | "hvac_support"
  | "hvac_penetration"
  | "hvac_ductwork"
  | "hvac_air_terminal"
  | "hvac_weather_louvre"
  | "hvac_refrigerant_piping"
  | "hvac_refrigerant"
  | "hvac_condensate"
  | "hvac_commissioning"
  | "floor_preparation"
  | "floor_primer"
  | "floor_testing"
  | "floor_covering"
  | "plaster"
  | "painting"
  | "waterproofing"
  | "roof_work"
  | "steel_work"
  | "cleaning"
  | "fire_control_panel"
  | "fire_device"
  | "fire_detector"
  | "fire_sounder"
  | "fire_manual_call_point"
  | "fire_cabling"
  | "fire_extinguisher"
  | "fire_signage"
  | "fire_safety"
  | "demolition";

export type PaidResultAction =
  | "demolish"
  | "supply_install"
  | "install"
  | "repair"
  | "prepare"
  | "connect"
  | "measure"
  | "test"
  | "clean"
  | "dispose"
  | "seal"
  | "paint"
  | "rent"
  | "unknown";

export type PaidResultDomain = "general" | "openings" | "electrical" | "hvac" | "flooring" | "finishes" | "envelope" | "steel" | "fire";
export type PaidResultAssemblyLevel = "system" | "assembly" | "component" | "connection" | "service" | "result";
export type PaidResultRelation = "direct_price" | "included_component" | "professional_analogue" | "incompatible" | "unknown";
export type PaidResultScenario = "new_install" | "replace_existing" | "repair_existing" | "demolish_existing" | "temporary_lifecycle" | "test_existing" | "neutral";
export const DEKEL_PAID_RESULT_SEMANTIC_REVISION = "2026-09-03-paid-result-relation-v4";

export type PaidResultSignature = {
  core: string;
  object: PaidResultObject | null;
  action: PaidResultAction;
  domain: PaidResultDomain;
  assemblyLevel: PaidResultAssemblyLevel;
  scenario: PaidResultScenario;
};

const HEBREW_FINAL_LETTERS: Record<string, string> = {
  "ך": "כ",
  "ם": "מ",
  "ן": "נ",
  "ף": "פ",
  "ץ": "צ",
};

/**
 * Normalize Hebrew final letters so the same paid object is not missed merely
 * because it appears in singular (מוליך) or plural/construct form (מוליכים).
 */
export function normalizePaidResultText(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("he")
    .replace(/[ךםןףץ]/gu, (letter) => HEBREW_FINAL_LETTERS[letter] ?? letter)
    .replace(/[־–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Keep the billable result itself. Included operations and the purpose of the
 * work are useful for scope/evidence, but must not redirect DEKEL retrieval.
 */
export function paidResultCoreText(value: string): string {
  const source = String(value ?? "").normalize("NFKC").toLocaleLowerCase("he").replace(/[־–—]/gu, "-").replace(/\s+/gu, " ").trim();
  const [primary] = source.split(
    /\s+(?:לרבות|כולל(?:ת|ים|ות)?|המחיר כולל|ללא|לא כולל|לצור[ךכ]|לש[םמ]|לקראת|לקבלת|כדי|על מנת|לפני)\s+/u,
    1,
  );
  const core = (primary ?? source).split(/\n|[.;:]/u, 1)[0]?.trim() || source;
  const replacementIndex = Math.max(
    core.lastIndexOf("אספקה והתקנת"),
    core.lastIndexOf("אספקה והתקנה"),
    core.lastIndexOf("החלפת"),
    core.lastIndexOf("החלפה"),
  );
  return replacementIndex > 0 && /פירוק|הריס/u.test(core.slice(0, replacementIndex))
    ? core.slice(replacementIndex).trim()
    : core;
}

function inferObject(core: string): PaidResultObject | null {
  if (/רפפ(?:ה|ות)[^.]{0,80}(?:מסגר|משקופ|פתח)|(?:חלונ|פתח)[^.]{0,80}רפפ/u.test(core)) return "opening_louvre";
  if (/ניקוי[^.]{0,80}(?:קונסטרוקצי[^.]{0,20}פלדה|פלדה חשופה|קורוזיה|חלודה)|(?:קונסטרוקצי[^.]{0,20}פלדה|פלדה חשופה)[^.]{0,80}ניקוי/u.test(core)) return "steel_work";
  // The head noun is the paid result. A cable merely routed inside a tray must
  // not turn the tray itself into a cable item, even when "כבלים" appears first.
  if (/(?:תוואי|מוביל)[^.]{0,50}כבל[^.]{0,60}(?:תעל|מגש|סולמ)|(?:תעל|מגש|סולמ)[^.]{0,60}כבל/u.test(core)) {
    if (/חפיר|קרקע|מילוי חוזר/u.test(core)) return "electrical_cable_trench";
    return "electrical_containment";
  }
  const rules: Array<[PaidResultObject, RegExp]> = [
    ["waste", /פסולת|העמס|הטמנ|אתר מורשה|שפכ/u],
    ["temporary_fence", /זמנ[^.]{0,60}(?:גדר|גידור|מחיצ)|(?:גדר|גידור|מחיצ)[^.]{0,60}זמנ|מחיצ(?:ה|ת)[^.]{0,50}הגנה/u],
    ["permanent_fence", /(?:^|[\s,.;])גדר(?=$|[\s,.;])|גידור/u],
    ["temporary_signage", /שלט אזהרה|שילוט בטיחות|איסור כניסה|סימונ אזור/u],
    ["temporary_protection", /הגנה זמנית|כיסוי הגנה|כיסוי[^.]{0,80}זמני|קירוי זמני|אטימה זמנית|סגירה זמנית/u],
    ["access_equipment", /במת הרמה|פיגומ|אמצעי גישה|עבודה בגובה/u],
    ["fire_control_panel", /(?:^|אספקה[^.]{0,50}|[\s,.;])ב?רכזת גילוי|ב?רכזת גילוי ל|ב?רכזת אש/u],
    ["fire_cabling", /כבל[^.]{0,80}גילוי אש|חי?ווט[^.]{0,80}גילוי אש/u],
    ["fire_extinguisher", /מטפ|אמצעי כיבוי ראשוני/u],
    ["exit_sign", /שלט יציאה מואר|שלט הכוונה חירומ/u],
    ["fire_signage", /שלט[^.]{0,80}(?:מילוט|יציאה|אש)|שילוט[^.]{0,80}(?:מילוט|יציאה|אש)/u],
    ["fire_detector", /גלאי/u],
    ["fire_sounder", /צופר|סירנה[^.]{0,60}(?:אש|התרעה)/u],
    ["fire_manual_call_point", /לחצנ[^.]{0,40}(?:אש|ידני)|(?:אש|התרעה)[^.]{0,40}לחצנ/u],
    ["fire_device", /אמצעי התרעה/u],
    ["electrical_grounding", /הארק|מוליכ הארקה|השוואת פוטנציאל/u],
    ["electrical_panel_accessory", /(?:מפסק גבול|מאוורר|תריס אוורור|מסננ|מערכת תאורה|גופ תאורה|תושבת[^.]{0,30}מחשב)[^.]{0,80}(?:לוח ה?חשמל|ארונ חשמל)|(?:לוח ה?חשמל|ארונ חשמל)[^.]{0,80}(?:מפסק גבול|מאוורר|תריס אוורור|מסננ|מערכת תאורה|גופ תאורה|תושבת[^.]{0,30}מחשב)/u],
    ["electrical_panel", /לוח ה?חשמל|לוח חלוקה|ארונ חשמל|לוח זמני[^.]{0,50}(?:אתר|בניה)/u],
    ["electrical_box", /קופסת הזנה|תיבת הזנה|קופסת חיבור|קופסת שירות/u],
    ["electrical_testing", /בדיק[^.]{0,100}(?:מתקנ חשמל|בידוד|קוטביות|זרמ דלפ|מפסקי מגן|הארקה|לולאת תקלה)|דוח בדיקת קבלה|איזונ פזות|איזונ פאזות|מיונ מעגלימ/u],
    ["electrical_point", /נקודת (?:הזנה|כח|כוח|מאור|חשמל|מפסק)|נקודה למזגנ|בית תקע|שקע/u],
    ["electrical_fixture", /גופ תאור(?:ה|ת)|תאורת חירומ|שלט יציאה מואר/u],
    ["electrical_protection", /מאמ[״"']?ת|מא[״"']?ז|מפסק מגן|הגנת מנוע|מנתק עומס|מפסק ניתוק|מפסק זרמ פקט|מפסק פקט/u],
    ["electrical_cable_trench", /חפיר[^.]{0,80}תעל[^.]{0,40}כבל|תעל[^.]{0,40}כבל[^.]{0,80}(?:חפיר|קרקע|מילוי חוזר)/u],
    ["electrical_containment", /תעל(?:ה|ת|ות)[^.]{0,40}(?:כבל|חשמל)|סולמ(?:ימ)?[^.]{0,30}כבל|מגש(?:י|ימ)?[^.]{0,30}כבל|צינור חשמל|מוביל חשמל/u],
    ["electrical_cable", /כבל|מוליכ(?:ימ)?/u],
    ["hvac_commissioning", /ואקומ|בדיקת אטימות[^.]{0,60}קרר|איזונ אוויר|מדידת ספיק|בדיקת ביצועימ|הפעלה ראשונית/u],
    ["hvac_refrigerant_piping", /(?:צנרת|צינורות?)\s+נחושת(?:[^.]{0,100}(?:מיזוג|מזגנ|יחידת פנימ|יחידת חוצ|קרר))?|(?:מיזוג|מזגנ)[^.]{0,100}(?:צנרת|צינורות?)\s+נחושת/u],
    ["hvac_refrigerant", /קרר|גז קירור|מטענ גז/u],
    ["hvac_condensate", /ניקוז מי עיבוי|ניקוז מזגנ|צינור ניקוז|צנרת ניקוז[^.]{0,50}עיבוי/u],
    ["hvac_support", /תושבת[^.]{0,100}(?:מזגנ|מיזוג|יחידת חוצ|מעבה)|(?:מזגנ|מיזוג|יחידת חוצ|מעבה)[^.]{0,100}(?:תושבת|בסיס|קונזולה)|קונסטרוקציית פלדה[^.]{0,100}(?:יחידות חוצ|מזגנ)/u],
    ["hvac_penetration", /(?:מעבר|פתח|חדירה)[^.]{0,80}תעל(?:ת|ות)? (?:אוויר|אויר|אוורור)|תעל(?:ת|ות)? (?:אוויר|אויר|אוורור)[^.]{0,80}(?:מעבר|פתח|חדירה)/u],
    ["hvac_weather_louvre", /תריס[^.]{0,50}נגד גשמ|תריסי? חוצ|תריס[^.]{0,70}עמיד[^.]{0,30}גשמ|רפפ(?:ה|ות)[^.]{0,40}חוצ|רשת[^.]{0,50}נגד ציפור/u],
    ["hvac_air_terminal", /מפזר[^.]{0,40}(?:אוויר|אויר)|שבכ(?:ה|ת|ות)[^.]{0,40}(?:אוויר|אויר)|רשת(?:ות)?[^.]{0,40}(?:אספקה|יניקה|אוויר|אויר|אוורור)|תריסי? (?:אוויר|אויר)|גריל[^.]{0,40}(?:אוויר|אויר)/u],
    ["opening_louvre", /רפפ(?:ה|ות)[^.]{0,80}(?:מסגר|משקופ|פתח)|(?:חלונ|פתח)[^.]{0,80}רפפ/u],
    ["hvac_ductwork", /תעלות? (?:אוויר|אויר|אוורור)|תעלות? פח מגולוונ|ספירקל/u],
    ["hvac_outdoor_unit", /יחידת עיבוי|יחידה חיצונית|מעבה(?: צירי)?/u],
    ["hvac_indoor_unit", /יחידת פנים|יחידה פנימית|מאייד מתועל|מאייד פנימי/u],
    ["hvac_system", /מערכת (?:מיזוג[^.]{0,80}(?:מפוצלת|מיני מרכזית)|אוורור מכני)|מזגנ (?:מפוצל|מיני מרכזי)|יחידת מיזוג אוויר מפוצל|יחיד(?:ת|ות) מיזוג(?: אוויר)?[^.]{0,80}חדש/u],
    ["hvac_equipment", /מזגנ|יחיד(?:ת|ות) (?:מיזוג|אוורור)|מפוח|מאייד|מעבה/u],
    ["door_panic_hardware", /מנגנונ[^.]{0,40}(?:בהלה|מילוט)|ידית בהלה|מוט(?:ות)? בהלה/u],
    ["door_threshold", /ספ (?:דלת|מתכת|אלומיני|משופע|מ-p\.v\.c|מברשת)|מפתנ דלת/u],
    ["door_closer", /מחזיר דלת|מחזיר(?: שמנ)?[^.]{0,50}דלת|מנגנונ סגירה הידראולי/u],
    ["door_lock", /מנעול|צילינדר|בריח/u],
    ["door_hinge", /(?:(?:^|[\s,.;])ציר(?:ימ|י)?(?=$|[\s,.;])[^.]{0,80}דלת|דלת[^.]{0,80}[\s,.;]ציר(?:ימ|י)?(?=$|[\s,.;]))/u],
    ["door_handle", /(?:ידית|ידיות)[^.]{0,80}דלת|דלת[^.]{0,80}(?:ידית|ידיות)/u],
    ["door_hardware", /פרזול|מנגנונ[^.]{0,30}(?:פתיחה|נעילה)|כיוונ[^.]{0,40}דלת/u],
    ["door_system", /דלת|משקופ/u],
    ["window_glazing", /זיגוג|זכוכית[^.]{0,100}(?:בחלונ|לחלונ)|החלפת[^.]{0,80}זכוכית/u],
    ["window_system", /חלונ|ויטרינ|מסגרת אלומיניום[^.]{0,80}זכוכית|אדנ חלונ/u],
    ["opening_closure", /סגירת פתח|סגירה קבועה|מילוי פתח/u],
    ["opening_passage", /פתח מעבר|קידוח[^.]{0,50}מעבר|שרוול|חדירה במעטפת/u],
    ["floor_testing", /בדיק[^.]{0,100}(?:לחות|מישוריות|חוזק|יציבות)[^.]{0,80}(?:רצפ|תשתית|בטונ)|מפת חריגות/u],
    ["floor_primer", /(?:פריימר|שכבת יסוד|שכבת קישור)[^.]{0,100}(?:רצפ|תשתית|בטונ)|(?:רצפ|תשתית)[^.]{0,100}(?:פריימר|שכבת יסוד|שכבת קישור)/u],
    ["floor_preparation", /ניקוי מכני[^.]{0,100}(?:רצפ|תשתית)|חשיפ[^.]{0,80}(?:רצפ|תשתית)|ליטוש[^.]{0,80}רצפ|הכנת[^.]{0,80}(?:רצפ|תשתית)|יישור[^.]{0,80}רצפ|מדה מתפלסת|(?:תיקונ|שיקומ)[^.]{0,100}(?:רצפ|חורים|סדקים|אזורימ חלשימ)|הסרת שכבות[^.]{0,80}(?:רצפ|תשתית)|חספוס פני בטונ/u],
    ["floor_covering", /ריצופ|שטיח|פרקט|יריעות גומי|רצפת ספורט|פנל לריצופ|שיפולימ/u],
    ["measurement", /מדידת ייצור|מדידת שטח|מדידת מידות|תיעוד מידות|ביצוע מדידה|מיפוי מצב|סקר מצב/u],
    ["plaster", /טיח|שכבת בסיס צמנט/u],
    ["painting", /צביע|צבע|ציפוי גמר/u],
    ["waterproofing", /איטומ|אטימה|חומר איטומ/u],
    ["roof_work", /גג|קירוי|איסכורית|רכס|הבזק/u],
    ["steel_work", /קונסטרוקצי[^.]{0,20}פלדה|מסגר(?:ת|ות) נשיאה|פרופיל(?:י)? פלדה|מריש(?:ימ)?|פלדה גלויה|קורוזיה|חלודה/u],
    ["fire_safety", /גילוי אש|כיבוי אש|מערכת אש/u],
    ["cleaning", /ניקיונ|נקיונ|ניקוי|שטיפה/u],
  ];
  const matches = rules
    .map(([object, pattern], order) => ({ object, index: core.search(pattern), order }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index || left.order - right.order);
  return matches[0]?.object ?? null;
}

function inferAction(core: string, object: PaidResultObject | null): PaidResultAction {
  // In a noun-led item, "with ... testing/measurement" describes its
  // attributes and included completion work, not a separately paid test.
  // Only remove that qualifier after the paid object has already appeared:
  // an actual leading "test the item with ..." must remain a test.
  const qualifierIndex = core.search(/\s+עמ\s+/u);
  const head = qualifierIndex >= 0 ? core.slice(0, qualifierIndex) : core;
  const actionClause = object && inferObject(head) === object ? head : core;
  const actionPatterns: Array<[PaidResultAction, RegExp]> = [
    ["demolish", /פ(?:י)?רוק|הריס|ניתוק\s+ופ(?:י)?רוק|הסר(?:ה|ת)[^.]{0,80}(?:ריצופ|חיפוי|שטיח|פרקט|יריעות|לוחות|מערכת|מתקנ)/u],
    ["test", /בדיק|בחינ|איזונ|הפעלה\s+ובדיקה/u],
    ["measure", /מדיד|מיפוי|סקר מצב|תיעוד מידות/u],
    ["dispose", /פינוי|העמס|הטמנ/u],
    ["prepare", /הכנה|הסר(?:ה|ת)|קילופ|ליטוש|ניקוי מכני|ניקוי[^.]{0,80}(?:מברשות|דיסק)|יישור/u],
    ["seal", /איטומ|אטימה/u],
    ["paint", /צביע|יישומ[^.]{0,40}צבע|חידוש צבע/u],
    ["connect", /^(?:חיבור|סיום וחיבור|קישור אל)|(?:^|[.;])\s*(?:חיבור|סיום וחיבור|קישור אל)/u],
    ["repair", /תיקונ|שיקומ|(?:^|[\s,.;])שיפוצ|חיזוק|חידוש|טיפול מונע|תחזוקה|העתקת/u],
    ["rent", /השכר/u],
    ["supply_install", /אספקה(?:[^.]{0,80}התקנ| והפעלת)|אספקת|החלפ/u],
    ["install", /התקנ|הרכבה|ביצוע|יציקה|סגיר(?:ה|ת)|חיפוי/u],
    ["clean", /ניקיונ|נקיונ|ניקוי|שטיפה/u],
  ];
  const explicit = actionPatterns
    .map(([action, pattern], order) => ({ action, index: actionClause.search(pattern), order }))
    .filter((match) => match.index >= 0 && (match.action !== "dispose" || object === "waste"))
    .sort((left, right) => left.index - right.index || left.order - right.order)[0];
  if (explicit) return explicit.action;
  if (object === "opening_closure" || object === "roof_work" || object === "steel_work" || object === "plaster") return "install";
  if (object === "painting") return "paint";
  if (object === "waterproofing") return "seal";
  if (object === "floor_preparation" || object === "floor_primer") return "prepare";
  if (object === "access_equipment") return "rent";
  if ([
    "temporary_fence", "permanent_fence", "door_system", "door_hardware", "door_lock", "door_hinge", "door_handle", "door_closer", "door_panic_hardware", "door_threshold",
    "window_system", "window_glazing", "opening_louvre", "electrical_grounding", "electrical_panel", "electrical_panel_accessory", "electrical_box",
    "electrical_cable", "electrical_cable_trench", "electrical_containment", "electrical_point", "electrical_fixture", "exit_sign", "electrical_protection",
    "hvac_system", "hvac_outdoor_unit", "hvac_indoor_unit", "hvac_equipment", "hvac_support", "hvac_penetration", "hvac_ductwork", "hvac_air_terminal", "hvac_weather_louvre", "hvac_refrigerant_piping", "hvac_condensate", "floor_covering",
    "fire_control_panel", "fire_device", "fire_detector", "fire_sounder", "fire_manual_call_point", "fire_cabling", "fire_extinguisher", "fire_signage",
  ].includes(object ?? "")) return "supply_install";
  return "unknown";
}

export function paidResultSignature(value: string): PaidResultSignature {
  const core = normalizePaidResultText(paidResultCoreText(value).replace(/\([^)]*\)/gu, " "));
  const object = inferObject(core);
  const fullText = normalizePaidResultText(value);
  const coreAction = inferAction(core, object);
  const action = coreAction === "unknown" ? inferAction(fullText, object) : coreAction;
  return { core, object, action, domain: domainForObject(object), assemblyLevel: assemblyLevelForObject(object), scenario: inferScenario(core, action, fullText) };
}

function inferScenario(core: string, action: PaidResultAction, fullText: string): PaidResultScenario {
  if (/זמני|השכר/u.test(core)) return "temporary_lifecycle";
  if (action === "demolish") return "demolish_existing";
  if (action === "test") return "test_existing";
  if (/פירוק|הריס/u.test(fullText) && /אספק|התקנ|חדש/u.test(fullText)) return "replace_existing";
  if (/החלפ/u.test(core)) return "replace_existing";
  if (action === "repair" || /שיקומ|שיפוצ|תיקונ|חידוש|קיימ/u.test(core) && !/חדש/u.test(core)) return "repair_existing";
  if (action === "supply_install" || /חדש/u.test(core)) return "new_install";
  return "neutral";
}

function compatibleAction(left: PaidResultAction, right: PaidResultAction): boolean {
  if (left === right) return true;
  return false;
}

function relationForActions(left: PaidResultAction, right: PaidResultAction): PaidResultRelation {
  if (compatibleAction(left, right)) return "direct_price";
  if (left === "unknown" || right === "unknown") return "unknown";
  const productive = new Set<PaidResultAction>(["supply_install", "install"]);
  const destructiveOrPreparatory = new Set<PaidResultAction>(["demolish", "prepare"]);
  if ((productive.has(left) && destructiveOrPreparatory.has(right))
    || (productive.has(right) && destructiveOrPreparatory.has(left))) return "incompatible";
  if (destructiveOrPreparatory.has(left) && destructiveOrPreparatory.has(right)) return "incompatible";
  if ((left === "repair" && productive.has(right)) || (right === "repair" && productive.has(left))) return "incompatible";
  if (["test", "measure", "clean", "dispose"].includes(left) || ["test", "measure", "clean", "dispose"].includes(right)) return "incompatible";
  if ((left === "seal" && destructiveOrPreparatory.has(right)) || (right === "seal" && destructiveOrPreparatory.has(left))) return "incompatible";
  if ((left === "paint" && destructiveOrPreparatory.has(right)) || (right === "paint" && destructiveOrPreparatory.has(left))) return "incompatible";
  return "professional_analogue";
}

function scenariosCompatible(left: PaidResultScenario, right: PaidResultScenario): boolean {
  if (left === right) return true;
  // A project operation may describe the whole replacement lifecycle
  // (remove the existing item and install a new one), while the DEKEL row
  // prices the new supplied item itself.  The reverse direction is unsafe:
  // a DEKEL row for replacing a component of an existing item must not price
  // a genuinely new item.
  if (left === "replace_existing" && right === "new_install") return true;
  if (left === "neutral" || right === "neutral") return true;
  return false;
}

function isSystemComponentPair(left: PaidResultObject, right: PaidResultObject): boolean {
  const pair = new Set([left, right]);
  if (pair.has("door_system") && [...pair].some((object) => [
    "door_hardware", "door_lock", "door_hinge", "door_handle", "door_closer", "door_panic_hardware", "door_threshold",
  ].includes(object))) return true;
  if (pair.has("window_system") && pair.has("window_glazing")) return true;
  if (pair.has("electrical_panel") && (pair.has("electrical_protection") || pair.has("electrical_box") || pair.has("electrical_panel_accessory"))) return true;
  if (pair.has("hvac_system") && [...pair].some((object) => [
    "hvac_outdoor_unit", "hvac_indoor_unit", "hvac_equipment", "hvac_support", "hvac_penetration", "hvac_ductwork", "hvac_air_terminal", "hvac_weather_louvre", "hvac_refrigerant_piping", "hvac_refrigerant", "hvac_condensate",
  ].includes(object))) return true;
  return false;
}

function domainForObject(object: PaidResultObject | null): PaidResultDomain {
  if (!object) return "general";
  if (["door_system", "door_hardware", "door_lock", "door_hinge", "door_handle", "door_closer", "door_panic_hardware", "door_threshold", "window_system", "window_glazing", "opening_closure", "opening_passage", "opening_louvre"].includes(object)) return "openings";
  if (object.startsWith("electrical_") || object === "exit_sign") return "electrical";
  if (object.startsWith("hvac_")) return "hvac";
  if (object.startsWith("floor_")) return "flooring";
  if (object.startsWith("fire_") || object === "fire_safety") return "fire";
  if (["plaster", "painting", "cleaning"].includes(object)) return "finishes";
  if (["waterproofing", "roof_work"].includes(object)) return "envelope";
  if (object === "steel_work") return "steel";
  return "general";
}

function assemblyLevelForObject(object: PaidResultObject | null): PaidResultAssemblyLevel {
  if (["door_system", "window_system", "electrical_panel", "hvac_system", "fire_control_panel", "fire_safety"].includes(object ?? "")) return "system";
  if (["temporary_fence", "permanent_fence", "access_equipment", "opening_louvre", "electrical_fixture", "hvac_ductwork", "floor_covering", "fire_extinguisher"].includes(object ?? "")) return "assembly";
  if (["door_hardware", "door_lock", "door_hinge", "door_handle", "door_closer", "door_panic_hardware", "door_threshold", "window_glazing", "electrical_panel_accessory", "electrical_box", "electrical_cable", "electrical_protection", "exit_sign", "hvac_outdoor_unit", "hvac_indoor_unit", "hvac_equipment", "hvac_support", "hvac_air_terminal", "hvac_weather_louvre", "hvac_refrigerant", "fire_device", "fire_detector", "fire_sounder", "fire_manual_call_point", "fire_cabling", "fire_signage"].includes(object ?? "")) return "component";
  if (["electrical_grounding", "electrical_cable_trench", "electrical_containment", "electrical_point", "hvac_penetration", "hvac_refrigerant_piping", "hvac_condensate", "opening_passage"].includes(object ?? "")) return "connection";
  if (["measurement", "electrical_testing", "hvac_commissioning", "floor_testing", "cleaning"].includes(object ?? "")) return "service";
  return "result";
}

const GENERIC_TOKENS = /^(?:של|על|עם|את|אל|או|כל|לפי|עבור|כולל|לרבות|חדש|חדשה|חדשים|חדשות|קיים|קיימת|מלא|מלאה|אספקה|התקנה|ביצוע|מערכת|עבודה|עבודות)$/u;

function meaningfulTokens(value: string): Set<string> {
  return new Set(normalizePaidResultText(value).match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length >= 3 && !GENERIC_TOKENS.test(token)) ?? []);
}

/** Direct pricing requires the same paid object and a compatible primary action. */
export function paidResultDirectCompatible(workDescription: string, candidateDescription: string): boolean {
  return paidResultRelation(workDescription, candidateDescription) === "direct_price";
}

export function paidResultRelation(workDescription: string, candidateDescription: string): PaidResultRelation {
  const explicitHourly = (value: string) => /שעת\s+עבודה|שעות\s+עבודה|לפי\s+שע(?:ה|ות)|hourly|labor\s+hours?/iu.test(value);
  if (explicitHourly(workDescription) || explicitHourly(candidateDescription)) {
    return explicitHourly(workDescription) && explicitHourly(candidateDescription) ? "direct_price" : "incompatible";
  }
  const work = paidResultSignature(workDescription);
  const candidate = paidResultSignature(candidateDescription);
  if (work.object && candidate.object) {
    if (work.object === candidate.object) {
      if (!scenariosCompatible(work.scenario, candidate.scenario)) return "incompatible";
      return relationForActions(work.action, candidate.action);
    }
    if (isSystemComponentPair(work.object, candidate.object)) return "included_component";
    return "incompatible";
  }
  if (work.object || candidate.object) return "unknown";
  if (work.core === candidate.core && work.core.length >= 8) return "direct_price";
  if (!compatibleAction(work.action, candidate.action)) return "unknown";
  const workTokens = meaningfulTokens(work.core);
  const candidateTokens = meaningfulTokens(candidate.core);
  const overlap = [...workTokens].filter((token) => candidateTokens.has(token));
  return overlap.length >= 2 ? "professional_analogue" : "unknown";
}
