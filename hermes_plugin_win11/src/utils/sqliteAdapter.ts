import { createRequire } from 'module'

export interface Statement<BindParameters extends unknown[] = unknown[], Result = unknown> {
  all(...params: BindParameters): Result[]
  get(...params: BindParameters): Result | undefined
  run(...params: BindParameters): { changes: number; lastInsertRowid: number | bigint }
}

export interface DatabaseAdapter {
  exec(sql: string): void
  prepare<BindParameters extends unknown[] = unknown[], Result = unknown>(sql: string): Statement<BindParameters, Result>
  close(): void
}

class BunDatabaseAdapter implements DatabaseAdapter {
  private db: any

  constructor(path: string) {
    const { Database } = require('bun:sqlite')
    this.db = new Database(path)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare<BindParameters extends unknown[] = unknown[], Result = unknown>(sql: string): Statement<BindParameters, Result> {
    const stmt = this.db.query(sql)
    return {
      all: (...params: BindParameters): Result[] => stmt.all(...params),
      get: (...params: BindParameters): Result | undefined => stmt.get(...params),
      run: (...params: BindParameters): { changes: number; lastInsertRowid: number | bigint } => stmt.run(...params),
    }
  }

  close(): void {
    this.db.close()
  }
}

class NodeDatabaseAdapter implements DatabaseAdapter {
  private db: any

  constructor(path: string) {
    const requireFunc = createRequire(import.meta.url)
    const Database = requireFunc('better-sqlite3')
    this.db = new Database(path)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare<BindParameters extends unknown[] = unknown[], Result = unknown>(sql: string): Statement<BindParameters, Result> {
    const stmt = this.db.prepare(sql)
    return {
      all: (...params: BindParameters): Result[] => stmt.all(...params),
      get: (...params: BindParameters): Result | undefined => stmt.get(...params),
      run: (...params: BindParameters): { changes: number; lastInsertRowid: number | bigint } => stmt.run(...params),
    }
  }

  close(): void {
    this.db.close()
  }
}

export class UnifiedDatabase implements DatabaseAdapter {
  private adapter: DatabaseAdapter

  constructor(path: string) {
    if ((process.versions as any).bun) {
      this.adapter = new BunDatabaseAdapter(path)
    } else {
      this.adapter = new NodeDatabaseAdapter(path)
    }
  }

  exec(sql: string): void {
    return this.adapter.exec(sql)
  }

  prepare<BindParameters extends unknown[] = unknown[], Result = unknown>(sql: string): Statement<BindParameters, Result> {
    return this.adapter.prepare<BindParameters, Result>(sql)
  }

  close(): void {
    return this.adapter.close()
  }
}
