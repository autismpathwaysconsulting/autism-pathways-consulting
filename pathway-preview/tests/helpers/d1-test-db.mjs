import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values.map(value => value === undefined ? null : value));
  }

  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values) || null;
    return column && row ? row[column] ?? null : row;
  }

  async all() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: {} };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

export class TestD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => statement.runSync());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  exec(sql) {
    return this.database.exec(sql);
  }

  close() {
    this.database.close();
  }
}

export async function createTestD1() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const root = new URL("../../", import.meta.url);
  database.exec(await readFile(new URL("migrations/0001_pathway_preview.sql", root), "utf8"));
  database.exec(await readFile(new URL("migrations/0002_synthetic_fixture.sql", root), "utf8"));
  return new TestD1(database);
}
