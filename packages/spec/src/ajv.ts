/**
 * AJV constructor with CJS/ESM default-export interop resolved (`import _Ajv from "ajv"` may
 * expose the class at `.default`).
 *
 * @category Schema
 */

import type { Ajv as AjvInstance, Options } from "ajv";
import _Ajv from "ajv";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Ajv = ((_Ajv as any).default ?? _Ajv) as new (options?: Options) => AjvInstance;
