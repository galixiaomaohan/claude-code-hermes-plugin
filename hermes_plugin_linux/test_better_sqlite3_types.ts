import Database from 'better-sqlite3'

type DB = InstanceType<typeof Database>

class Store {
  private db: DB
  constructor(path: string) {
    this.db = new Database(path)
  }
}
