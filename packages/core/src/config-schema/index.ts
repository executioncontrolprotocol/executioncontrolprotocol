import { z } from "zod"

/** Config schema type accepted by `.withConfig()`. @category Definitions */
export type ConfigSchema = z.ZodType<Record<string, unknown>>
