import { sql } from "drizzle-orm";
import { customType, type AnyPgColumn } from "drizzle-orm/pg-core";

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** SQL for `column IN ('a', 'b', …)`, for CHECK constraints built from the lists in enums.ts. */
export function oneOf(column: AnyPgColumn, values: readonly string[]) {
  const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}
