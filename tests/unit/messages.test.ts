import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { DOMAIN_ERROR_CODES } from "@/lib/errors";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";

type Tree = { [key: string]: string | Tree };
const dictionaries = { en, ru, uz } as unknown as Record<"en" | "ru" | "uz", Tree>;

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
    } else {
      Object.assign(out, flatten(value, path));
    }
  }
  return out;
}

const flat = {
  en: flatten(dictionaries.en),
  ru: flatten(dictionaries.ru),
  uz: flatten(dictionaries.uz),
};

describe("locale dictionaries", () => {
  it("have identical keys in every language", () => {
    const keys = Object.keys(flat.en).sort();
    expect(Object.keys(flat.ru).sort()).toEqual(keys);
    expect(Object.keys(flat.uz).sort()).toEqual(keys);
  });

  it("translate every domain error code", () => {
    for (const locale of ["en", "ru", "uz"] as const) {
      for (const code of DOMAIN_ERROR_CODES) {
        expect(flat[locale][`errors.${code}`], `${locale}: errors.${code}`).toBeTruthy();
      }
    }
  });

  it("use the same placeholders across languages", () => {
    // ICU arguments are "{name}" or "{name, type, ...}"; plural branch texts are not arguments.
    const placeholders = (text: string) => [...text.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]);
    for (const [key, text] of Object.entries(flat.en)) {
      const expected = new Set(placeholders(text));
      for (const locale of ["ru", "uz"] as const) {
        expect(new Set(placeholders(flat[locale][key] ?? "")), `${locale}: ${key}`).toEqual(expected);
      }
    }
  });

  it("format without ICU errors", () => {
    for (const locale of ["en", "ru", "uz"] as const) {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: dictionaries[locale],
        onError: (error) => errors.push(`${locale}: ${error.message}`),
      });
      for (const [key, text] of Object.entries(flat[locale])) {
        const values = Object.fromEntries([...text.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map((m) => [m[1], 2]));
        (t as unknown as (key: string, values: Record<string, number>) => string)(key, values);
      }
      expect(errors).toEqual([]);
    }
  });

  it("write Uzbek with the modifier letters ʻ and ʼ, not ASCII apostrophes", () => {
    const offenders = Object.entries(flat.uz).filter(([, text]) => /[’']/.test(text));
    expect(offenders).toEqual([]);
  });
});
