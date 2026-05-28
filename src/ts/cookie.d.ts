declare module "cookie" {
  export interface ParseOptions {
    decode?: (value: string) => string;
  }

  export function parse(
    str: string,
    options?: ParseOptions,
  ): Record<string, string>;
}
