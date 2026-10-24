import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    ignores: ["src/lib/services/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch'] > Literal[value=/^\\/api\\/admin/]",
          message: "fetch('/api/admin...') calls are restricted outside src/lib/services. Move this call into a dedicated service."
        },
        {
          selector: "CallExpression[callee.name='fetch'] > TemplateLiteral > TemplateElement[value.raw=/^\\/api\\/admin/]",
          message: "fetch('/api/admin...') calls are restricted outside src/lib/services. Move this call into a dedicated service."
        }
      ]
    }
  },
  {
    files: ["tests/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
]);

export default eslintConfig;
